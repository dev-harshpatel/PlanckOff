# Matching Architecture — Branch Classification + BOM Expansion

**Status:** Active (implemented 2026-06-23)  
**Replaces:** Per-item fuzzy scoring engine (was producing 0 matches — wrong approach)

---

## The Correct Mental Model

Do NOT think of matching as "find the right database row for each PDF-extracted item."

Think of it as: **"classify the whole assembly → expand its recipe from a template → resolve placeholders"**

```
Extracted Assembly
  (assembly_type: "P1 — Interior Partition Wall — Single Layer 16mm Type X — 3-5/8" Studs")
  (materials.gypsum_board: [{ raw_text: "16mm TYPE X GWB", thickness: 16, type: "TYPE X" }])
  (materials.steel_framing: [{ raw_text: "3-5/8" STEEL STUDS AT 400mm OC", size: "92mm" }])
  (materials.insulation: [{ raw_text: "92mm BATT INSULATION" }])
              ↓
classifyAssemblyBranches(assembly)
              ↓
  ['FR-WALL', 'DW-SGL-WALL', 'INS-WALL']
              ↓
  For each branch → load template from assembly_bunch_database
              ↓
  FR-WALL items:       [XXXXXXX stud, XXXXXXX track, SC-PT-1-1/4, ...]
  DW-SGL-WALL items:   [XXXXXXX board, SC-PT-1-5/8, TAPE-PAPER, MUD-DW-LITE, ...]
  INS-WALL items:      [XXXXXXX insulation]
              ↓
  Resolve XXXXXXX:
    XXXXXXX in FR-WALL stud    → category=FRAMING, size=3-5/8"          → ST-358-25
    XXXXXXX in FR-WALL track   → category=FRAMING, size=3-5/8", desc~track → TR-358-25
    XXXXXXX in DW-SGL-WALL board → category=Drywall, size=5/8", type=Type X → GWB-58-TX
    XXXXXXX in INS-WALL       → category=INSULATION, size=3-5/8"        → INS-358-BATT
              ↓
  For each resolved material row:
    wallLabourCode → labour_database → all height bands
              ↓
  MaterialsCostingItem[] output
```

---

## Key Files

| File | Role |
|------|------|
| `src/lib/utils/materialNormalizer.ts` | Pure classification utilities — `classifyAssemblyBranches()`, `normalizeExtractedAssembly()` |
| `src/services/matching/matchAssemblyMaterials.ts` | BOM expansion + placeholder resolution for one assembly |
| `src/services/matching/matchAllAssemblies.ts` | Entry point — loops over all assemblies |
| `src/services/matching/resolveMatchedMaterial.ts` | Maps `MaterialDatabaseRow` → `MatchedMaterial` |
| `src/services/matching/resolveMatchedLabour.ts` | Resolves all height bands for a labour code |
| `src/lib/cache/matcherDbCache.ts` | Redis + memory cache for all three databases |
| `src/app/api/match/route.ts` | HTTP handler — loads caches, calls `matchAllAssemblies` |

---

## Branch Classification Logic

`classifyAssemblyBranches(assembly: AssemblyData)` returns branch codes by checking:

1. **Location** from `assembly.assembly_type` text:
   - "WALL" / "PARTITION" → `'wall'`
   - "CEILING" / "SOFFIT" → `'ceiling'`
   - "BULKHEAD" → `'bulkhead'`
   - Default when not detected → `'wall'`

2. **Material groups present** on the extracted assembly:
   - `materials.steel_framing.length > 0` → framing present
   - `materials.gypsum_board.length > 0` → board present
   - `materials.gypsum_sheathing.length > 0` → sheathing present
   - `materials.insulation.length > 0` → insulation present

3. **Layer count** from `gypsum_board[].layers` (AI sets this during extraction):
   - `layers >= 2` → `DW-DBL-*` instead of `DW-SGL-*`

4. **Special types** detected from `assembly_type` text:
   - "SHAFT" → `FR-SHAFT`, `DW-SGL-SHAFT`, etc.
   - "ACT" / "T-BAR" / "SUSPENDED CEILING" → `ACT-GRID-2X4`, `ACT-TILE`
   - "GYP GRID" → `GYP-GRID`

### Branch Code Reference

| Branch | Location | Content |
|--------|----------|---------|
| `FR-WALL` | Wall | Framing: studs, tracks, screws |
| `DW-SGL-WALL` | Wall | Single-layer drywall: board, screws, tape, mud |
| `DW-DBL-WALL` | Wall | Double-layer drywall |
| `SH-WALL` | Wall | Sheathing board |
| `INS-WALL` | Wall | Batt insulation |
| `FR-CLG` | Ceiling | Framing |
| `DW-SGL-CLG` | Ceiling | Single-layer drywall |
| `DW-DBL-CLG` | Ceiling | Double-layer drywall |
| `SH-CLG` | Ceiling | Sheathing |
| `INS-CLG` | Ceiling | Insulation |
| `FR-BULK` | Bulkhead | Framing |
| `DW-SGL-BULK` | Bulkhead | Single-layer drywall |
| `FR-SHAFT` | Shaft wall | Framing |
| `DW-SGL-SHAFT` | Shaft wall | Single-layer drywall |
| `ACT-GRID-2X2` | Ceiling | ACT 600x600 grid |
| `ACT-GRID-2X4` | Ceiling | ACT 600x1200 grid |
| `ACT-TILE` | Ceiling | Ceiling tiles |
| `GYP-GRID` | Ceiling | Gypsum grid system |

---

## XXXXXXX Placeholder Resolution

When `assembly_bunch_database.item_code = 'XXXXXXX'`, the matcher calls `resolvePlaceholder()`:

```
1. Determine target category from branch code:
   FR-* → FRAMING, DW-* → Drywall, INS-* → INSULATION, SH-* → SHEATHING

2. Filter material_database by category

3. Filter by size (if available from extraction):
   DW-SGL-WALL XXXXXXX + board size '5/8"' → only Drywall rows where sizeImperial = '5/8"'

4. Filter by type (Drywall only):
   boardType = 'Type X' → only rows where type = 'Type X'

5. Narrow by description hint (optional):
   bunchItem.description = 'Stud' → prefer rows containing 'stud' in description
   bunchItem.description = 'Track' → prefer rows containing 'track'

6. Return first candidate (sorted by row_num from DB = most common/standard first)
   Return null if nothing matches — item is silently skipped, not an error
```

---

## Labour Resolution

After each material row is resolved:

```typescript
const labourCode = location === 'ceiling'
  ? resolved.ceilingLabourCode
  : location === 'bulkhead'
  ? resolved.bulkheadLabourCode
  : resolved.wallLabourCode;

resolveMatchedLabour(labourCode, labourRows)
// Returns ALL height bands for this code as separate MatchedLabor items
// Finalize step picks the right band based on actual wall height from takeoff
```

Labour codes are on `material_database` rows (three columns: `wallLabourCode`, `ceilingLabourCode`, `bulkheadLabourCode`). Many framing accessories (screws, fasteners) have no labour code — `resolveMatchedLabour('')` returns `[]` cleanly.

---

## Output Shape

The output of `matchAllAssemblies()` is `MaterialMatchAssembly[]` — identical contract to
what the old AI matcher returned. The finalize step is unchanged.

Each assembly has `materials_costing: MaterialsCostingItem[]` where each entry has:
- `extracted_material`: a synthetic item with `[BOM] code — description` as raw_text
- `matched_materials`: one `MatchedMaterial` from the resolved `material_database` row
- `matched_labor`: all height-band `MatchedLabor` items for this material's labour code

---

## What NOT to Do

- **Do NOT** go back to per-item fuzzy scoring — it fails because the `SIZE` column in
  `material_database` stores sheet dimensions ('4' x 8''), not thickness.
- **Do NOT** skip the assembly bunch database — it is the source of which items belong
  in each assembly type. Without it, you'd have to know that a wall needs studs + tracks
  + screws + board + tape + mud, which is not in the extraction output.
- **Do NOT** use the `labourCode` column from `assembly_bunch_database` at match time —
  it is a reference column only. The authoritative labour code comes from `material_database`
  (the three labour code columns on the matched material row).

---

## Debug Output

The match route writes two debug files in development:
- `match_result-*.json` — full match output with all `MaterialMatchAssembly[]`
- `match_scored-*.json` — per-item debug entries showing branchCode, itemCode, result, resolvedCode

Look at `match_scored-*.json` first when debugging match failures. Check:
1. `branchCodes` — are the right branches being classified?
2. `result: "unmatched"` entries — which XXXXXXX items have no candidate?
3. If XXXXXXX is unmatched: check `normalized.boardSizeImperial` — is the size extracting correctly from the PDF?
