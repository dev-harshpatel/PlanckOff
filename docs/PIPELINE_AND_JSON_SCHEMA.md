# Pipeline Flow & JSON Schema

> **Reference doc** — read this before touching the match step (`/api/match`), the finalize step (`/api/finalize`), `dbToUiMapper.ts`, or any code that reads `materials_costing` from the DB.

---

## 1. The Three Databases

| Database | Table | Purpose |
|----------|-------|---------|
| **Material DB** | `material_database` | One row per product. Stores code, description, unit price, formulas, UOMs, labour codes. This is the primary match target. |
| **Labour DB** | `labour_database` | One row per labour activity, split into height bands. Fetched via the labour code on a matched material row. |
| **Assembly Bunch DB** | `assembly_bunch_database` | BOM templates for each branch (DW-SGL-WALL, FR-WALL, etc.). Used inside the match step to expand placeholders — does NOT appear in the final JSON. |

---

## 2. Full Pipeline Flow

```
User uploads PDF + Excel takeoff
         │
         ▼
STEP 0 — Parse Takeoff (unchanged)
  POST /api/parse-takeoff
  Reads Excel → saves raw takeoff rows to DB (takeoff_outputs)
         │
         ▼
STEP 1 — Extract (unchanged)
  POST /api/extract
  AI reads PDF → extracts assembly descriptions + material groups
  (gypsum_board, steel_framing, insulation, etc.)
  Saves to assembly_extractions table
         │
         ▼
STEP 2 — Match (CHANGED — new rule-based approach)
  POST /api/match
  For each extracted assembly:
    1. classifyAssemblyBranches() → branch codes (DW-SGL-WALL, FR-WALL, INS-WALL …)
    2. For each branch → load BOM template from assembly_bunch_database
    3. Expand placeholders (XXXXXXX, XXXXX, XXXX) → resolve to real codes via material_database
    4. Each resolved code → lock that MaterialDatabaseRow
    5. From locked row → read wall_labour_code (or ceiling / bulkhead variant)
    6. Look up that code in labour_database → get all height bands
    7. Write ONE matched_material entry per resolved code (see §4 for shape)
    8. matched_labor is NO LONGER written separately — labour is derived at render time
  Saves enriched result to material_matches table
         │
         ▼
STEP 3 — Finalize (passthrough — no height segmentation)
  POST /api/finalize
  Merges extract + match output into final_output JSON
  Saves to final_outputs table
         │
         ▼
RENDER — UI reads via /api/assembly-data
  dbToUiMapper.ts maps final_output JSON → WallAssembly[] + AssemblyComponent[]
  assemblyRowResolver.ts resolves every column value at render time
  (reads full formulas, UOMs, sizes, labour bands live from materialDb + labourDb in context)
```

---

## 3. What the Assembly Bunch DB Does (and Doesn't Do)

The assembly bunch DB is **only used inside the match step**. It is an intermediate tool — it never appears in the final JSON.

```
Assembly bunch branch  →  BOM item list with placeholders
DW-SGL-WALL            →  [ XXXXX (drywall), fixed code MTTS, fixed code MSBP, … ]
FR-WALL                →  [ XXXXXXX (stud), XXXXXXX (track), XXXXXXX (slotted track), … ]
INS-WALL               →  [ XXXX (insulation), … ]

resolvePlaceholder() replaces XXXXX → X58, XXXXXXX → S362125-15, etc.
The final JSON only contains the resolved codes — not the bunch template.
```

---

## 4. Final Output JSON — Current Shape (OLD — to be migrated away from)

```json
{
  "assembly_id": "WEF1",
  "assembly_type": "Exterior Wall",
  "height_ft": 15,
  "total_length": 165,
  "materials_costing": [
    {
      "extracted_material": { "raw_text": "...", "description": "..." },
      "matched_materials": [            ← ARRAY (wrong — always 1 item)
        {
          "code": "CT600-33",
          "section": "09 22 00",
          "description": "...",
          "unit": "LF",
          "unit_cost": 0,              ← ALWAYS 0 — wrong, actual price not stored
          "_fromNewDb": true
        }
      ],
      "matched_labor": [               ← SEPARATE LABOUR ROWS — wrong in new arch
        {
          "code": "LAB-FRM-SHAFT",
          "unit_cost": 0,
          "height_ft": 0,
          "height_category": "All",
          "_fromNewDb": true
        }
      ]
    }
  ]
}
```

**Problems with the current shape:**
1. `matched_materials` is an array but a single extraction always matches exactly one material row — should be singular.
2. `unit_cost` is always `0` — the real price (`unit_price`) was never stored in the JSON.
3. `matched_labor` as separate rows is **wrong** — in the new architecture labour is derived at render time from the material row's labour code. These rows become ghost components with no data.
4. Missing `parent_section`, `wall_labour_code`, `ceiling_labour_code`, `bulkhead_labour_code` — the resolver needs these to pick the right formula set and labour band.

---

## 5. Final Output JSON — New Shape (TARGET)

```json
{
  "assembly_id": "WEF1",
  "assembly_type": "Exterior Wall",
  "height_ft": 15,
  "total_length": 165,
  "level": "Level 1",
  "materials_costing": [
    {
      "extracted_material": {
        "raw_text": "[BOM] CT600-33 — CT600-33 / 6\" CT 33mil (20ga) Shaftwall Stud",
        "description": "CT600-33 / 6\" CT 33mil (20ga) Shaftwall Stud",
        "height_ft": 15,
        "total_length": 165
      },
      "matched_material": {            ← SINGULAR (not an array)
        "code": "CT600-33",
        "section": "09 22 00",
        "description": "CT600-33 / 6\" CT 33mil (20ga) Shaftwall Stud",
        "unit_price": 2.45,            ← real price from material_database.unit_price
        "parent_section": "Walls",     ← from material_database — drives wall vs ceiling formula
        "wall_labour_code": "LAB-FRM-SHAFT",   ← from material_database
        "ceiling_labour_code": "",
        "bulkhead_labour_code": ""
      }
      // matched_labor REMOVED — labour derived at render time by assemblyRowResolver
    }
  ]
}
```

**Why this shape is correct:**
- One matched material per extracted item — no ambiguity.
- `unit_price` is stored so the JSON is self-contained for audit/replay.
- `parent_section` + labour codes stored so the resolver can work even if the DB changes later.
- No separate labour rows — labour is resolved at render time by `assemblyRowResolver.ts` using `labourDb` from context.

---

## 6. What Changes in Code (Migration Checklist)

### Match step (`/api/match` → `matchAllAssemblies.ts`)
- [x] Stop writing `matched_labor[]` — now always written as `[]`; labour is derived at render time
- [x] Write `matched_material: { ... }` (singular) alongside `matched_materials: [...]` (backward compat)
- [x] `unit_cost` — read from `MaterialDatabaseRow.unitPrice` via `resolveMatchedMaterial()`
- [x] Add `parent_section` — from `MaterialDatabaseRow.parentSection`
- [x] Add `wall_labour_code`, `ceiling_labour_code`, `bulkhead_labour_code`

### Finalize step (`/api/finalize`)
- [x] `enrichMaterialsCosting()` now passes `matched_material` through unchanged
- [x] `matched_labor` loop in `projectCosting.ts` skipped when `matched_material` is set (no ghost rows)

### Mapper (`src/lib/utils/dbToUiMapper.ts`)
- [x] Read `matched_material` (singular) when present; fall back to `matched_materials[0]` for old DB data
- [x] Skip `matched_labor.forEach(...)` when `matched_material` is set (no ghost labour rows)
- [ ] Map `matched_material.unit_price` → `comp.overrideMatCost` (currently uses `unit_cost` field)

### Types (`src/types/assembly/index.ts`)
- [x] Added `matched_material?: MatchedMaterial | null` to `MaterialsCostingItem`
- [x] Added `parent_section`, `wall_labour_code`, `ceiling_labour_code`, `bulkhead_labour_code` to `MatchedMaterial`
- [x] Kept `matched_materials` and `matched_labor` as required arrays for backward compat

### Resolver (`src/lib/utils/assemblyRowResolver.ts`)
- [ ] No changes needed — already reads from `matRow` (MaterialDatabaseRow) live from context

---

## 7. Render-Time Data Flow (After Migration)

```
final_output JSON (in DB)
  matched_material.code = "CT600-33"
         │
         ▼
dbToUiMapper.ts
  comp.materialCode = "CT600-33"
  comp.materialName = matched_material.description
  comp.sectionCode  = matched_material.section
  (no separate labour components created)
         │
         ▼
ComponentsList.tsx
  matRow = materialDb.find(m => m.code === "CT600-33")   ← live from materialDb in context
         │
         ▼
assemblyRowResolver.ts  resolveAssemblyRow(comp, matRow, labourDb, ...)
  section        ← matRow.section
  materialCode   ← matRow.code
  qty1 / qty2    ← evaluate matRow.qty1Formula with wall dimensions
  uom1 / uom2    ← matRow.uom1 / uom2 (or ceiling variants)
  labourCode     ← matRow.wallLabourCode  (picked by parent_section)
  labourBand     ← labourDb.find(parentCode === labourCode) → band by height
  labQty         ← evaluate band.qty1Formula
  labUnitRate    ← band.ratePerUom
  matUnitPrice   ← comp.overrideMatCost ?? matRow.unitPrice
  totalMatCost   ← matUnitPrice × qty2
  totalLabCost   ← labUnitRate × labQty
  totalCost      ← totalMatCost + totalLabCost
```

---

## 8. Key Rules — Never Break These

1. **One material per extracted item** — `matched_material` is singular. If no match found, the field is `null`.
2. **No labour rows in the JSON** — `matched_labor` is gone. Labour is always derived at render time.
3. **Assembly bunch DB is match-step only** — it never appears in the JSON output.
4. **`parent_section` drives everything** — wall vs ceiling formula selection, labour code selection. Always read it from the matched material row, never from `assembly_type`.
5. **Resolver is the single source of truth for column values** — `dbToUiMapper.ts` only maps identity fields (code, description, section). It does NOT compute costs, quantities, or labour.
