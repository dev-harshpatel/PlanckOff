# Assembly Model — Column Data Wiring Plan

> **Goal:** Wire every column in the `ComponentsList` table to the correct data source (Material Database, Labour Database, or Assembly context). Build a centralized resolver so changing a data source later requires editing one file, not hunting across components.

---

## 1. The Three Data Sources

| Source | Where it Lives | Fetched / Available Via |
|--------|---------------|------------------------|
| **Material Database** | `MaterialDatabaseRow` (Supabase `material_database` table) | `useProjectDataContext()` → `materialDbRows` (to be added) |
| **Labour Database** | `LabourDatabaseRow` + `LabourBandEntry` (Supabase `labour_database` table) | `useProjectDataContext()` → `labourDbRows` (to be added) |
| **Assembly Context** | `WallAssembly` + `AssemblyComponent` | Already in context |

---

## 2. Column-to-Source Mapping (The Full Truth Table)

| Column | Source | Field / Logic |
|--------|--------|---------------|
| **Section** | Material DB | `MaterialDatabaseRow.section` |
| **Code** | Material DB | `MaterialDatabaseRow.code` |
| **Item / Description** | AI pipeline extraction | `AssemblyComponent.materialName` (description from PDF match) |
| **HEIGHT** | ⚠️ TODO | Currently uses `comp.overrideHeight ?? assembly.defaultHeight` — needs proper data source decision |
| **OC** | ⚠️ TODO | Currently parsed from `comp.ocSpacing` / `comp.usage` text — needs proper data source decision |
| **LAYER** | ⚠️ TODO | Currently inferred from `comp.usage` text (e.g. "2 Layer", "Coverage") — needs proper data source decision |
| **Labour Code** | Material DB → context-aware | See §3 below |
| **Wst%** | Component (editable) | `comp.wasteFactor ?? 5` (default 5) |
| **QTY1** | Material DB formulas + evaluator | Wall: `qty1Formula` / Ceiling: `qty1FormulaCeiling` |
| **UOM1** | Material DB | Wall: `uom1` / Ceiling: `uom1Ceiling` |
| **QTY2** | Material DB formulas + evaluator | Wall: `qty2Formula` / Ceiling: `qty2FormulaCeiling` |
| **UOM2** | Material DB | Wall: `uom2` / Ceiling: `uom2Ceiling` |
| **Size** | Derived from QTY1 | `QTY1 / sizes[0].sizeNum` (first size entry's sizeNum) |
| **Lab. Qty** | Labour DB band formula | Evaluate `LabourBandEntry.qty1Formula` with same var map as material formulas |
| **Lab. UOM** | Labour DB band | `LabourBandEntry.qty1Uom` |
| **Mat. Unit $** | Material DB | `MaterialDatabaseRow.unitPrice` |
| **Lab. Unit $** | Labour DB band | `LabourBandEntry.ratePerUom` |
| **Tot. Mat.** | Calculated | `Mat. Unit $ × QTY2` |
| **Tot. Lab.** | Calculated | `Lab. Unit $ × Lab. Qty` |
| **Total** | Calculated | `Tot. Mat. + Tot. Lab.` |

---

## 3. Labour Code Resolution Logic

The Labour Code column is the most context-sensitive. The category is **NOT** inferred from the assembly type — it is determined at AI-match time when the PDF description is matched to a `MaterialDatabaseRow`. The matched row already carries `MaterialDatabaseRow.parentSection` (`"Walls"` | `"Ceiling"` | `"Bulkhead"`), which is the authoritative category for that component row.

```
matRow.parentSection → Labour code field to use
────────────────────────────────────────────────
"Walls"    →  MaterialDatabaseRow.wallLabourCode
"Ceiling"  →  MaterialDatabaseRow.ceilingLabourCode
"Bulkhead" →  MaterialDatabaseRow.bulkheadLabourCode
```

**Why this matters:** The AI matching step links a PDF description → a specific `MaterialDatabaseRow`. That row's `parentSection` is set in the Material Database by the estimator. We trust it completely — we do not re-derive category from `assembly.assemblyType`. The assembly type is a high-level label; `matRow.parentSection` is the ground truth for a given component.

Once the parent code is resolved (e.g. `"LAB-FRM"`), we look up the right **band** from the Labour Database:

```
1. Find LabourDatabaseRow where parentCode === resolvedLabourCode
2. Within labourBands[], find the band where:
   htMinFt <= wallHeight < htMaxFt   (or htBand === "All")
3. Use that LabourBandEntry for:
   - Lab. Qty  → evaluate band.qty1Formula
   - Lab. UOM  → band.qty1Uom
   - Lab. Unit $ → band.ratePerUom
```

If no band matches the height, fall back to the band with `htBand === "All"`, then the lowest min-ft band.

---

## 4. Context Selector (Wall vs Ceiling Formulas)

All formula and UOM fields come in pairs. The selector uses `matRow.parentSection` — set when the AI matched the PDF description to this material row — **not** `assembly.assemblyType`:

```
matRow.parentSection → Formula set to use
──────────────────────────────────────────
"Ceiling"  →  qty1FormulaCeiling, uom1Ceiling, qty2FormulaCeiling, uom2Ceiling
"Walls"    →  qty1Formula, uom1, qty2Formula, uom2
"Bulkhead" →  qty1Formula, uom1, qty2Formula, uom2   (Bulkhead uses Wall formula columns)
```

The match happens during the AI pipeline: PDF description → `MaterialDatabaseRow`. The row that is matched dictates the category and therefore the formula columns. This is the only correct source for context — deriving it from `assembly.assemblyType` would be a guess and could silently pick the wrong formulas if a Ceiling assembly contains a wall-category material or vice versa.

---

## 5. Calculation Formulas (All Pure, No Side Effects)

```
QTY1 = evaluateMaterialFormula(contextQty1Formula, varMap)
QTY2 = evaluateMaterialFormula(contextQty2Formula, varMap)   // typically "QTY1 / SIZE_NUM"
Size = QTY1 / sizes[0].sizeNum   (if sizeNum > 0, else null)

Lab. Qty = evaluateMaterialFormula(band.qty1Formula, varMap)

Tot. Mat. = (Mat. Unit $) × QTY2
Tot. Lab. = (Lab. Unit $) × Lab. Qty
Total     = Tot. Mat. + Tot. Lab.
```

`varMap` is built by the existing `buildFormulaVarMap()` — it already contains Length, Height, CeilingArea, Perimeter, Wastage, Layers, OC, SheetArea, BagSize, AreaCover.

---

## 6. New Files to Create

### 6a. `src/types/assemblyResolver.ts`
Centralized types for the resolved row and its sub-parts.

```ts
export interface AssemblyRowContext {
  isWall: boolean;
  isCeiling: boolean;
  isBulkhead: boolean;
  wallHeight: number;    // for labour band selection
}

export interface ResolvedLabour {
  labourCode: string;           // e.g. "LAB-FRM"
  bandCode: string;             // e.g. "LAB-FRM-STD"
  labQty: number | null;
  labUom: string;
  labUnitRate: number;          // ratePerUom
  totalLabCost: number;
}

export interface ResolvedAssemblyRow {
  // Identification
  section: string;
  materialCode: string;
  description: string;

  // Specs
  height: number | null;
  oc: string;
  layers: number | null;

  // Labour
  labour: ResolvedLabour | null;

  // Quantities
  wastePct: number;             // 5 by default
  qty1: number | null;
  uom1: string;
  qty2: number | null;
  uom2: string;
  size: number | null;          // QTY1 / sizeNum

  // Costs
  matUnitPrice: number;         // from MaterialDatabaseRow.unitPrice
  totalMatCost: number;         // matUnitPrice × qty2
  totalCost: number;            // totalMatCost + totalLabCost
}
```

### 6b. `src/lib/utils/assemblyRowResolver.ts`
**The single centralized resolver.** This is the only place column values are computed.

```ts
// Context comes from the MATCHED material row's parentSection, not the assembly type
export function resolveAssemblyContext(matRow: MaterialDatabaseRow): AssemblyRowContext
export function resolveLabourForRow(
  matRow: MaterialDatabaseRow,
  labourDb: LabourDatabaseRow[],
  context: AssemblyRowContext,
  varMap: Record<string, number>,
): ResolvedLabour | null

export function resolveAssemblyRow(
  comp: AssemblyComponent,
  matRow: MaterialDatabaseRow | null,
  labourDb: LabourDatabaseRow[],
  assembly: WallAssembly,
  takeoffInstances: TakeoffInstance[],
  extractedDims?: ExtractedDimensions,
): ResolvedAssemblyRow
```

All column computation lives here. `ComponentsList` calls `resolveAssemblyRow()` per row and reads the result — it does NOT compute anything itself.

### 6c. `src/hooks/useMaterialAndLabourDb.ts`
A light hook that fetches both databases (once) and exposes them:

```ts
export function useMaterialAndLabourDb(): {
  materialDb: MaterialDatabaseRow[];
  labourDb: LabourDatabaseRow[];
  isLoading: boolean;
}
```

This follows the same single-fetch pattern as `useMaterials()` in AppContext. If they're already in context, remove this and put them directly in `ProjectDataContext`.

---

## 7. Files to Modify

| File | What Changes |
|------|-------------|
| `src/components/features/project/editor-tabs/ComponentsList.tsx` | Replace all inline column logic with `resolveAssemblyRow()`. Each column cell just reads `resolved.xxx`. |
| `src/components/features/project/editor-tabs/assemblyComponentHelpers.ts` | Update `getUnitCostForRow` to read from `MaterialDatabaseRow.unitPrice` instead of `comp.overrideMatCost` only. Update `getRowTotalCost` to use `resolvedRow.totalCost`. |
| `src/lib/utils/formulaEvaluator.ts` | Add `resolveLabourQtyFormula()` — evaluates a labour band formula using the same varMap. Keeps formula evaluation in one file. |
| `src/context/ProjectDataContext.tsx` | Expose `materialDb: MaterialDatabaseRow[]` and `labourDb: LabourDatabaseRow[]` alongside existing data, fetched once via their respective API routes. |

---

## 8. Old Logic to Remove

| Location | What to Remove | Why |
|----------|---------------|-----|
| `ComponentsList.tsx` lines 340–447 | All inline `labUnitCost`, `labQtyVal`, `labUomVal`, `totalLabCost`, `totalMatCost` derivations | Replaced by `resolveAssemblyRow()` output |
| `ComponentsList.tsx` lines 412–428 | `unitCostDisplay` / `unitCostPlaceholder` derivation from `mat?.productivity` | Mat. Unit $ now comes from `MaterialDatabaseRow.unitPrice` |
| `assemblyComponentHelpers.ts` `getUnitCostForRow` | `mat?.productivity` and `details.unitPrice` fallback logic | New source is `MaterialDatabaseRow.unitPrice` |
| `ComponentsList.tsx` Labour Code cell | `mat?.laborCostCode` usage | Labour code now resolved context-aware via resolver |
| Any remaining `spec_database` / `MaterialDefinition.laborCostCode` reads | These came from the old pipeline | New architecture uses `MaterialDatabaseRow` three-code system |

---

## 9. Implementation Order

1. **Types first** — Create `src/types/assemblyResolver.ts` with `AssemblyRowContext`, `ResolvedLabour`, `ResolvedAssemblyRow`.

2. **Resolver** — Create `src/lib/utils/assemblyRowResolver.ts` with:
   - `resolveAssemblyContext(assembly)`
   - `selectLabourCode(matRow, context)` — picks wall/ceiling/bulkhead code
   - `selectLabourBand(labourRow, wallHeight)` — picks the right height band
   - `resolveLabourForRow(matRow, labourDb, context, varMap)`
   - `resolveAssemblyRow(comp, matRow, labourDb, assembly, instances, extractedDims)` — the main entry point

3. **Context plumbing** — Add `materialDb` and `labourDb` to `ProjectDataContext` (fetched once, shared across all tabs).

4. **Wire ComponentsList** — Replace inline logic with `resolveAssemblyRow()` calls. The component becomes purely presentational for these columns.

5. **Remove dead code** — Delete the inline derivation blocks listed in §8.

6. **Update helpers** — Update `assemblyComponentHelpers.ts` to delegate to resolver where appropriate.

---

## 10. What Stays the Same

- `formulaEvaluator.ts` → `evaluateMaterialFormula()`, `buildFormulaVarMap()`, `computeFormulaQuantities()` — already correct, resolver will call these
- Column resize / UI chrome in `ComponentsList.tsx` — untouched
- Override system (`comp.wasteFactor`, `comp.overrideHeight`, `comp.overrideMatCost`) — resolver respects overrides before falling back to DB values
- `getRowTotalCost()` in helpers — updated to delegate to resolver's `totalCost`, same signature

---

## 11. Key Invariants (Never Break These)

1. **One resolver, one truth** — `resolveAssemblyRow()` is the ONLY place column values are computed. If you need to change where Mat. Unit $ comes from, you change it in one line in the resolver, not in 5 places.

2. **Category comes from the matched material row** — Always read `matRow.parentSection` to select wall vs ceiling formulas and labour code. Never derive category from `assembly.assemblyType` — the AI match step is the authoritative source.

3. **Labour band height matching** — Always use `htMinFt <= wallHeight < htMaxFt` for band selection. Fallback to `htBand === "All"`, then first band. Never skip band selection.

4. **No arithmetic in ComponentsList** — The table component renders values, it does not compute them. All numbers come from `ResolvedAssemblyRow`.

5. **Mat. Unit $ × QTY2 for Tot. Mat.** — Not QTY1. QTY2 is the count of pieces/units actually purchased.

6. **Lab. Unit $ × Lab. Qty for Tot. Lab.** — Lab. Qty comes from evaluating the band's `qty1Formula`, not from QTY1 or QTY2.

---

## 12. ⚠️ Columns Still Left to Wire (TODO)

These three columns are intentionally left incomplete. Current behaviour works but the correct permanent data source has not been decided yet.

| Column | Current (temporary) behaviour | What needs to be decided |
|--------|-------------------------------|--------------------------|
| **Height** | `comp.overrideHeight ?? assembly.defaultHeight` | Should this come from the Material DB, the takeoff schedule, or remain a pure assembly-level field? |
| **OC** | Parsed from `comp.usage` text (e.g. `"Vertical @ 16\" OC"`) | Should OC be a structured field on `AssemblyComponent` rather than parsed from a free-text string? |
| **Layers** | Inferred from `comp.usage` text (e.g. `"2 Layer"`, `"Coverage"`) | Should layers come from the assembly bunch database BOM item, or remain a usage-text inference? |

**Do not "fix" these by guessing** — discuss with Harsh/Dhruv before wiring. Once decided, add the data source to the truth table in §2 and wire it through `resolveAssemblyRow()` in `src/lib/utils/assemblyRowResolver.ts`.
