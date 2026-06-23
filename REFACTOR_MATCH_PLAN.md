# Rule-Based Material Matching — Implementation Plan

**Author:** dev-harshpatel  
**Status:** Planning — do not implement until reviewed

---

## What Changes vs What Stays the Same

### Changes
- `src/app/api/match/route.ts` — internal logic only, contract identical
- `src/services/openrouter/matchMaterials.ts` — deleted after Phase 4
- `src/services/finalize/mergeTakeoffWithMaterialMatch.ts` — `expandLaborForHeight()` updated
- Three new Supabase tables: `material_database`, `labour_database`, `assembly_bunch_database`
- New migration file
- Three new import scripts
- Three new repository files (follow exact existing pattern)
- Three new cache functions added to existing `materialDbCache.ts`
- One new normalizer utility
- One new matching service

### Does NOT change
- `/api/extract`, `/api/finalize`, `/api/parse-takeoff`, `/api/assembly-data` — untouched
- `PipelineContext`, `ImportFilesModal` — untouched
- `assembly_extractions`, `material_matches`, `final_outputs`, `takeoff_outputs` table schemas
- `MatchedMaterial`, `MatchedLabor`, `MaterialsCostingItem`, `MaterialCosting` type shapes
- All Reports/Labour/Materials/Markups tabs — zero UI changes this phase

### `spec_database` — kept in Supabase, fully removed from codebase
The `spec_database` Supabase table is NOT deleted but no code in this project will read
from or write to it after this refactor. `material_database` replaces it for everything.

Additional files that change because of this:
- `src/lib/cache/materialDbCache.ts` — existing `getMaterialDatabase()` (reads spec_database)
  is removed; replaced by `getMaterialDatabaseNew()` which reads `material_database`
- `src/lib/db/materials.ts` — all functions that query `spec_database` are deleted
- `src/app/api/materials/route.ts` — route that served spec_database data is deleted
- `src/context/AppContext.tsx` — `useMaterials()` hook and materials array removed;
  components that used `useMaterials()` for display are updated to use `material_database`
  data via a new `/api/material-database` route (added in Phase 3)
- `src/lib/utils/projectCosting.ts` — `buildProjectPriceMap()` and `aggregateProjectCosts()`
  updated: priceMap is now built from `MaterialDatabaseRow[]` using `code → unit_price`;
  the `per` field comes from `uom1` (wall UOM) on the material row

---

## Critical Conflict to Resolve First (Read Before Everything)

`expandLaborForHeight()` in `src/services/finalize/mergeTakeoffWithMaterialMatch.ts`
currently works like this:

```
matched_labor[].code → look up in spec_database → get laborCostCode
  → find sibling rows in spec_database by same laborCostCode
  → pick sibling whose description contains "(Walls < 12 ft)" / "(High 12 ft to 24 ft)" etc.
```

With the new system, matched_labor codes will be `LAB-HNG-STD` etc. from `labour_database`.
These won't exist in `spec_database`, so `expandLaborForHeight()` will silently fail
(fall through to the "not in DB" branch and return the original item with no expansion).

**Resolution:** Store all height bands on each `matched_labor` item at match time
as `_labour_bands: LabourDatabaseRow[]`. Update `expandLaborForHeight()` to use
`_labour_bands` when present, falling back to the old `spec_database` lookup when not.
This keeps backward compatibility with any existing data while new data uses the new path.

This is the only place where finalize logic changes. The API contract is unaffected.

---

## What Was Wrong With the Old Logic (Do Not Repeat)

These are the exact bugs found in the existing codebase. Every point below is a
concrete code defect, not an opinion. The new architecture must avoid all of them.

**1. Three competing quantity calculation paths**
- `formulaEvaluator.ts` — formula-string evaluation (live, in the Assembly Editor UI)
- `calculationUtils.ts` — hardcoded `switch` on a `usage` string with magic constants
- `mat.quantity` / `lab.quantity` stored by the pipeline (what Reports reads)

All three could produce different numbers for the same assembly item. Reports showed
whatever the pipeline stored; the Assembly Editor showed a different number. Neither
was definitively correct.

**Fix:** One path only. Quantity is computed ONCE at finalize time using
`material_database.qty1Formula`. The formula result is stored on `MatchedMaterial.quantity`
and `MatchedLabor.quantity`. All views read that stored value — nothing re-computes it.

**2. `quantity` was optional → silent zero costs**
`MatchedLabor.quantity?: number` — if the pipeline never set it, `aggregateProjectCosts()`
did `lab.quantity ?? 0` and the labour cost silently disappeared. No warning, no error.

**Fix:** `quantity` is REQUIRED on both `MatchedMaterial` and `MatchedLabor`. The finalize
step must always set it. A value of `0` is valid; `undefined` is not.

**3. `productivity` field collision**
`spec_database.productivity` was used as a **material unit cost** in `projectCosting.ts`
but as a **production rate (units/hr)** in `calculationUtils.ts`. Same column, two
completely different interpretations in two places.

**Fix:** No `productivity` field exists in the new architecture. Unit cost comes from
`material_database.unitPrice` (set at match time). Production rate is a separate concept
that lives in `labour_database.ratePerUom`.

**4. Hardcoded `$65/hr` labour rate fallback**
`calculationUtils.ts` fell back to `65` as the hourly labour rate when no DB value was
found. This was never caught because the fallback silently produced plausible numbers.

**Fix:** No hardcoded rate anywhere. `unit_cost` on every `MatchedLabor` comes from
`labour_database.ratePerUom` for the correct height band. If the rate is `0` (not yet
priced in the DB), it shows as `0` — visibly wrong, not silently wrong.

**5. `Reports.tsx` re-computed labour totals inline (violated Cardinal Law)**
There was a `useMemo` inside `Reports.tsx` that re-traversed `materialCostingData` and
computed `laborTotal = qty * lab.unit_cost` independently — bypassing `aggregateProjectCosts()`
and the override map. Any user override was invisible in that panel.

**Fix:** `Reports.tsx` reads `projectCosts.totalLabor` from context. Zero inline arithmetic.

**6. Wrong prompt key in the AI finalize path**
`finalizeAssemblies.ts` called `getResolvedAIPrompt(AI_PROMPT_KEYS.MATERIAL_MATCH)` —
it reused the material match prompt for the finalize step. The finalize step has entirely
different requirements.

**Fix:** The finalize step is now deterministic (`mergeTakeoffWithMaterialMatch.ts`).
No AI prompt needed at all.

---

## Canonical Quantity & Cost Architecture (New — Read Before Writing Any Calculation Code)

```
Match step (ruleBasedMatcher.ts)
  Sets on each MatchedMaterial:
    unit_cost  = material_database.unitPrice           ← REQUIRED, never 0 unless DB says 0
    code       = material_database.code
    qty1Formula = material_database.qty1Formula        ← stored for finalize step to use

  Sets on each MatchedLabor:
    unit_cost  = labour_database.ratePerUom (STD band) ← REQUIRED
    _labourBands = all bands from labour_database      ← for height expansion at finalize
    qty1Formula = labour_database.qty1Formula          ← stored for finalize step to use

Finalize step (mergeTakeoffWithMaterialMatch.ts)
  For each MatchedMaterial and MatchedLabor:
    Resolve formula tokens from the takeoff row:
      [LEN]    = takeoff_row.length_ft
      [HGT]    = takeoff_row.height_ft
      [LAYER]  = takeoff_row.layer_count  (default 1)
      [WST_FR] = material_database waste factor        (from constants, not DB)
      [OC]     = takeoff_row.stud_spacing_in           (default 16)
    Evaluate qty1Formula → store as quantity           ← REQUIRED, never undefined
    total_cost is NOT stored — computed at display only as quantity * unit_cost

aggregateProjectCosts() — reads stored values, never re-evaluates formulas
  lineItem.totalCost = lineItem.quantity * lineItem.unitCost
  totalMaterial = sum of material line items
  totalLabor    = sum of labour line items
```

**Rules that flow from this:**
- `quantity` and `unit_cost` are both REQUIRED (non-optional) on every line item after finalize
- `total_cost` / `totalCost` is NEVER stored — always `quantity * unit_cost` at read time
- Formula evaluation happens exactly ONCE, in the finalize step
- No component, hook, or useMemo re-evaluates a formula or recomputes a quantity
- If a formula result is `NaN` or negative, finalize logs a warning and stores `0` — never `undefined`

---

## Wall Type Detail View (Phase 6 UI)

When a user clicks a wall type (e.g. P1) anywhere in the Reports section, a slide-in
panel opens showing exactly what the pipeline matched and calculated for that wall type.

### Panel Layout

```
┌─────────────────────────────────────────────────────────┐
│  P1  —  Interior Partition Wall          Fire: N/A   [×] │
│  3-5/8" Steel Studs · Single Layer Type X · Batt Ins.    │
├─────────────────────────────────────────────────────────┤
│  [ Materials ]  [ Labour ]                               │
├─────────────────────────────────────────────────────────┤
│  Branch      Code          Description    Qty   Unit     │
│             Unit Cost     Total                          │
│  ─────────────────────────────────────────────────────  │
│  FR-WALL    SC-PT-1-1/4   Framing Screw  120   Pieces   │
│             $0.12         $14.40                         │
│  DW-SGL-WALL GWB-5/8-TX   5/8" Type X   480   SF        │
│             $0.85         $408.00                        │
│  ...                                                     │
├─────────────────────────────────────────────────────────┤
│                           Material Total    $1,240.00    │
└─────────────────────────────────────────────────────────┘
```

### Data the Panel Receives (props)

```typescript
interface WallTypeDetailPanelProps {
  wallTypeCode: string;          // 'P1'
  wallTypeDescription: string;   // from takeoff
  fireRating: string;            // 'N/A' | '1HR' | '2HR' etc.
  lineItems: CostLineItem[];     // from projectCosts.lineItems — already computed
  onClose: () => void;
}
```

No additional fetching — all data comes from `projectCosts.lineItems` already in context,
filtered by `assemblyId` for this wall type. Zero new API calls.

### Materials Tab columns
`Branch` · `Code` · `Description` · `Qty` · `Unit` · `Unit Cost` · `Total`

### Labour Tab columns
`Branch` · `Code` · `Description` · `Height Band` · `Qty` · `Unit` · `Unit Cost` · `Total`

### Footer
Material subtotal · Labour subtotal · Combined total for this wall type

### Component file
`src/components/features/reports/WallTypeDetailPanel.tsx`
Follows the slide-in panel pattern (not a modal — use a `<aside>` fixed to the right edge).
Reads from `useProjectDataContext()` — does not fetch.

---

## Architecture: How the Three Databases Work Together

```
PDF Extraction Output
  │  (assembly descriptions: "3-5/8" stud, single layer 16mm Type X GWB, batt insulation")
  ▼
ruleBasedMatcher.ts
  │
  ├─ Step 1: Classify extraction → assembly branch types
  │    e.g. "wall + framing + single-layer + insulation" → [FR-WALL, DW-SGL-WALL, INS-WALL]
  │
  ├─ Step 2: Load items for each branch from assembly_bunch_database table
  │    FR-WALL items: [studs-XXXXXXX, tracks-XXXXXXX, screws-SC-PT-1-1/4, ...]
  │    DW-SGL-WALL items: [board-XXXXXXX, screws-SC-PT-1-5/8, tape-TAPE-PAPER, mud-MUD-DW-LITE, ...]
  │    INS-WALL items: [insulation-XXXXXXX]
  │
  ├─ Step 3: Resolve XXXXXXX placeholders
  │    For each placeholder item: search material_database by (category + size + type)
  │    from the extracted assembly attributes
  │    e.g. XXXXXXX board in DW-SGL-WALL + "16mm Type X" → GWB-5/8-TX
  │
  ├─ Step 4: Look up each resolved code in material_database
  │    → get full details: description, size, unitPrice, wallLabourCode,
  │      ceilingLabourCode, bulkheadLabourCode, formulas, UOMs
  │
  ├─ Step 5: Resolve labour (per location)
  │    location=wall   → use material.wallLabourCode
  │    location=ceiling → use material.ceilingLabourCode
  │    location=bulkhead → use material.bulkheadLabourCode
  │    labourCode → labour_database → all height bands → store as _labourBands
  │
  └─ Step 6: Cost resolution
       unit_cost = material_database.unitPrice (no spec_database fallback)
       This value flows into MatchedMaterial.unit_cost → aggregateProjectCosts() reads it
```

**Key rule:** Labour codes come from `material_database` (wallLabourCode / ceilingLabourCode /
bulkheadLabourCode). The `LABOUR CODE` column in the Assembly Bunch Database Excel is a reference
column only — it is stored in the DB but is NOT used as the authoritative source at match time.

**Cost rule:** `material_database.unitPrice` is the sole source of unit cost. `spec_database`
is never queried. `aggregateProjectCosts()` no longer needs a `priceMap` built from
`spec_database` — it reads `unit_cost` directly from each `MatchedMaterial` as set at
match time from `material_database.unitPrice`.

---

## New Database Tables

**Migration file:** `supabase/migrations/020_create_material_labour_databases.sql`

```sql
-- ─── material_database (from Drywall Database Excel) ──────────────────────────
CREATE TABLE material_database (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_num                 INTEGER,
  category                TEXT NOT NULL,
  assembly_code           TEXT,
  code                    TEXT NOT NULL,
  wall_labour_code        TEXT,
  ceiling_labour_code     TEXT,
  bulkhead_labour_code    TEXT,
  type                    TEXT,
  description             TEXT NOT NULL,
  section                 TEXT,
  size                    TEXT,
  size_num                NUMERIC,
  unit_price              NUMERIC DEFAULT 0,
  container_unit          TEXT,
  qty1_formula            TEXT,
  uom1                    TEXT,
  qty2_formula            TEXT,
  uom2                    TEXT,
  qty1_formula_ceiling    TEXT,
  uom1_ceiling            TEXT,
  qty2_formula_ceiling    TEXT,
  uom2_ceiling            TEXT,
  notes                   TEXT,
  search_keywords         TEXT[],
  size_mm                 NUMERIC,
  size_imperial           TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT material_database_code_key UNIQUE (code)
);

CREATE INDEX idx_material_db_category    ON material_database(category);
CREATE INDEX idx_material_db_code        ON material_database(code);
CREATE INDEX idx_material_db_keywords    ON material_database USING GIN(search_keywords);
CREATE INDEX idx_material_db_type        ON material_database(type);
CREATE INDEX idx_material_db_size_imp    ON material_database(size_imperial);

-- ─── labour_database (from Labour Database Excel) ──────────────────────────────
CREATE TABLE labour_database (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_code     TEXT NOT NULL,
  code            TEXT,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL,
  ht_band         TEXT,
  ht_min_ft       NUMERIC DEFAULT 0,
  ht_max_ft       NUMERIC DEFAULT 99,
  uom             TEXT,
  rate_per_uom    NUMERIC DEFAULT 0,
  qty1_formula    TEXT,
  qty1_uom        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_labour_db_code     ON labour_database(labour_code);
CREATE INDEX idx_labour_db_category ON labour_database(category);

-- ─── assembly_bunch_database (from Default Assembly Branch Excel) ──────────────────────
-- One row per line item per branch template.
-- XXXXXXX item_codes are stored as-is; resolved at match time.
CREATE TABLE assembly_bunch_database (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code    TEXT NOT NULL,     -- e.g. 'FR-WALL', 'DW-SGL-WALL', 'INS-CLG'
  assembly_code  TEXT,              -- assembly-level code pattern (may contain XXXXXXX)
  item_code      TEXT NOT NULL,     -- material item code (may be 'XXXXXXX' = placeholder)
  section        TEXT,              -- CSI section code
  layers         INTEGER,           -- layer count context (NULL = all layers)
  description    TEXT,
  size           TEXT,
  labour_code    TEXT,              -- reference only — not used at match time
  note           TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_assembly_bunch_database_branch   ON assembly_bunch_database(branch_code);
CREATE INDEX idx_assembly_bunch_database_item     ON assembly_bunch_database(item_code);
```

---

## New TypeScript Types

**File:** `src/types/index.ts` — add alongside existing types

```typescript
// ─── material_database row ─────────────────────────────────────────────────────
export interface MaterialDatabaseRow {
  id: string;
  rowNum: number;
  category: string;
  assemblyCode: string;
  code: string;
  wallLabourCode: string;
  ceilingLabourCode: string;
  bulkheadLabourCode: string;     // NEW vs old plan — was BULKHEAD_LABOUR_CODE in Excel
  type: string;
  description: string;
  section: string;
  size: string;
  sizeNum: number;
  unitPrice: number;
  containerUnit: string;
  qty1Formula: string;            // wall quantity formula
  uom1: string;
  qty2Formula: string;            // wall secondary formula
  uom2: string;
  qty1FormulaCeiling: string;     // ceiling formula
  uom1Ceiling: string;
  qty2FormulaCeiling: string;
  uom2Ceiling: string;
  notes: string;
  searchKeywords: string[];       // computed at import time
  sizeMM: number | null;
  sizeImperial: string | null;
}

// ─── labour_database row ───────────────────────────────────────────────────────
export interface LabourDatabaseRow {
  id: string;
  labourCode: string;    // e.g. 'LAB-FRM-STD'
  code: string;          // short code e.g. 'STD'
  description: string;
  category: string;      // e.g. 'Install Framing Wall'
  htBand: string;        // 'Standard' | 'Medium' | 'High' | 'Very High' | 'Extra High' | 'All'
  htMinFt: number;
  htMaxFt: number;
  uom: string;
  ratePerUom: number;
  qty1Formula: string;
  qty1Uom: string;
  notes: string;
}

// ─── assembly_bunch_database row ───────────────────────────────────────────────────────
export interface AssemblyBunchDatabaseItem {
  id: string;
  branchCode: string;      // 'FR-WALL' | 'DW-SGL-WALL' | 'DW-DBL-WALL' | 'SH-WALL' |
                           // 'INS-WALL' | 'FR-CLG' | 'DW-SGL-CLG' | 'DW-DBL-CLG' |
                           // 'SH-CLG' | 'INS-CLG' | 'FR-BULK' | 'DW-SGL-BULK' |
                           // 'FR-SHAFT' | 'DW-SGL-SHAFT' | 'FR-SHAFT-CLG' |
                           // 'DW-SGL-SHAFT-CLG' | 'ACT-GRID-2X2' | 'ACT-GRID-2X4' |
                           // 'ACT-TILE' | 'GYP-GRID'
  assemblyCode: string;    // assembly-level code pattern (may include XXXXXXX)
  itemCode: string;        // 'XXXXXXX' = placeholder; resolve at match time
  section: string;
  layers: number | null;
  description: string;
  size: string;
  labourCode: string;      // reference column only
  note: string;
  sortOrder: number;
}
```

**Also update `MatchedLabor`** in `src/types/assembly/index.ts`:

```typescript
export interface MatchedLabor {
  // ... all existing fields unchanged ...
  _labourBands?: LabourDatabaseRow[];  // all height bands — used by finalize step
}
```

---

## New Repository Files

All three files follow the exact pattern from existing repositories:
`supabaseAdmin` + `{ data, error }` returns + transformer functions + snake_case↔camelCase.

### `src/lib/db/materialDatabase.ts`

```typescript
import { supabaseAdmin } from '@/lib/supabase/server';
import type { MaterialDatabaseRow } from '@/types';

const toMaterialDatabaseRow = (row: Record<string, unknown>): MaterialDatabaseRow => ({
  id: row.id as string,
  rowNum: (row.row_num as number) ?? 0,
  category: row.category as string,
  assemblyCode: (row.assembly_code as string) ?? '',
  code: row.code as string,
  wallLabourCode: (row.wall_labour_code as string) ?? '',
  ceilingLabourCode: (row.ceiling_labour_code as string) ?? '',
  bulkheadLabourCode: (row.bulkhead_labour_code as string) ?? '',
  type: (row.type as string) ?? '',
  description: row.description as string,
  section: (row.section as string) ?? '',
  size: (row.size as string) ?? '',
  sizeNum: (row.size_num as number) ?? 0,
  unitPrice: (row.unit_price as number) ?? 0,
  containerUnit: (row.container_unit as string) ?? '',
  qty1Formula: (row.qty1_formula as string) ?? '',
  uom1: (row.uom1 as string) ?? '',
  qty2Formula: (row.qty2_formula as string) ?? '',
  uom2: (row.uom2 as string) ?? '',
  qty1FormulaCeiling: (row.qty1_formula_ceiling as string) ?? '',
  uom1Ceiling: (row.uom1_ceiling as string) ?? '',
  qty2FormulaCeiling: (row.qty2_formula_ceiling as string) ?? '',
  uom2Ceiling: (row.uom2_ceiling as string) ?? '',
  notes: (row.notes as string) ?? '',
  searchKeywords: (row.search_keywords as string[]) ?? [],
  sizeMM: row.size_mm as number | null,
  sizeImperial: row.size_imperial as string | null,
});

export async function getAllMaterialDatabase(): Promise<{
  data: MaterialDatabaseRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .select('*')
    .order('row_num', { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  return { data: data.map(toMaterialDatabaseRow), error: null };
}

export async function getMaterialDatabaseByCategory(category: string): Promise<{
  data: MaterialDatabaseRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .select('*')
    .eq('category', category)
    .order('row_num', { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  return { data: data.map(toMaterialDatabaseRow), error: null };
}

export async function bulkUpsertMaterialDatabase(
  rows: Omit<MaterialDatabaseRow, 'id'>[],
): Promise<{ error: { message: string } | null }> {
  const dbRows = rows.map((r) => ({
    row_num: r.rowNum,
    category: r.category,
    assembly_code: r.assemblyCode,
    code: r.code,
    wall_labour_code: r.wallLabourCode,
    ceiling_labour_code: r.ceilingLabourCode,
    bulkhead_labour_code: r.bulkheadLabourCode,
    type: r.type,
    description: r.description,
    section: r.section,
    size: r.size,
    size_num: r.sizeNum,
    unit_price: r.unitPrice,
    container_unit: r.containerUnit,
    qty1_formula: r.qty1Formula,
    uom1: r.uom1,
    qty2_formula: r.qty2Formula,
    uom2: r.uom2,
    qty1_formula_ceiling: r.qty1FormulaCeiling,
    uom1_ceiling: r.uom1Ceiling,
    qty2_formula_ceiling: r.qty2FormulaCeiling,
    uom2_ceiling: r.uom2Ceiling,
    notes: r.notes,
    search_keywords: r.searchKeywords,
    size_mm: r.sizeMM,
    size_imperial: r.sizeImperial,
  }));
  const CHUNK = 250;
  for (let i = 0; i < dbRows.length; i += CHUNK) {
    const { error } = await supabaseAdmin
      .from('material_database')
      .upsert(dbRows.slice(i, i + CHUNK), { onConflict: 'code' });
    if (error) return { error: { message: error.message } };
  }
  return { error: null };
}
```

### `src/lib/db/labourDatabase.ts`

```typescript
import { supabaseAdmin } from '@/lib/supabase/server';
import type { LabourDatabaseRow } from '@/types';

const toLabourDatabaseRow = (row: Record<string, unknown>): LabourDatabaseRow => ({
  id: row.id as string,
  labourCode: row.labour_code as string,
  code: (row.code as string) ?? '',
  description: row.description as string,
  category: row.category as string,
  htBand: (row.ht_band as string) ?? 'All',
  htMinFt: (row.ht_min_ft as number) ?? 0,
  htMaxFt: (row.ht_max_ft as number) ?? 99,
  uom: (row.uom as string) ?? '',
  ratePerUom: (row.rate_per_uom as number) ?? 0,
  qty1Formula: (row.qty1_formula as string) ?? '',
  qty1Uom: (row.qty1_uom as string) ?? '',
  notes: (row.notes as string) ?? '',
});

export async function getAllLabourDatabase(): Promise<{
  data: LabourDatabaseRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .select('*')
    .order('labour_code', { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  return { data: data.map(toLabourDatabaseRow), error: null };
}

export async function getLabourBandsByCode(labourCode: string): Promise<{
  data: LabourDatabaseRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .select('*')
    .eq('labour_code', labourCode)
    .order('ht_min_ft', { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  return { data: data.map(toLabourDatabaseRow), error: null };
}

export async function bulkUpsertLabourDatabase(
  rows: Omit<LabourDatabaseRow, 'id'>[],
): Promise<{ error: { message: string } | null }> {
  const dbRows = rows.map((r) => ({
    labour_code: r.labourCode,
    code: r.code,
    description: r.description,
    category: r.category,
    ht_band: r.htBand,
    ht_min_ft: r.htMinFt,
    ht_max_ft: r.htMaxFt,
    uom: r.uom,
    rate_per_uom: r.ratePerUom,
    qty1_formula: r.qty1Formula,
    qty1_uom: r.qty1Uom,
    notes: r.notes,
  }));
  // labour_database has a labour_code + ht_band composite natural key
  // Use upsert on labour_code for now; if labour_code can repeat across bands, add id as conflict target
  const { error } = await supabaseAdmin
    .from('labour_database')
    .upsert(dbRows, { onConflict: 'labour_code' });
  return { error: error ? { message: error.message } : null };
}
```

### `src/lib/db/assemblyBunchDatabase.ts`

```typescript
import { supabaseAdmin } from '@/lib/supabase/server';
import type { AssemblyBunchDatabaseItem } from '@/types';

const toAssemblyBunchDatabaseItem = (row: Record<string, unknown>): AssemblyBunchDatabaseItem => ({
  id: row.id as string,
  branchCode: row.branch_code as string,
  assemblyCode: (row.assembly_code as string) ?? '',
  itemCode: row.item_code as string,
  section: (row.section as string) ?? '',
  layers: row.layers as number | null,
  description: (row.description as string) ?? '',
  size: (row.size as string) ?? '',
  labourCode: (row.labour_code as string) ?? '',
  note: (row.note as string) ?? '',
  sortOrder: (row.sort_order as number) ?? 0,
});

export async function getAssemblyBunchDatabaseByCode(branchCode: string): Promise<{
  data: AssemblyBunchDatabaseItem[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .select('*')
    .eq('branch_code', branchCode)
    .order('sort_order', { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  return { data: data.map(toAssemblyBunchDatabaseItem), error: null };
}

export async function getAllAssemblyBunchDatabase(): Promise<{
  data: AssemblyBunchDatabaseItem[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .select('*')
    .order('branch_code', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  return { data: data.map(toAssemblyBunchDatabaseItem), error: null };
}

export async function bulkUpsertAssemblyBunchDatabase(
  rows: Omit<AssemblyBunchDatabaseItem, 'id'>[],
): Promise<{ error: { message: string } | null }> {
  const dbRows = rows.map((r) => ({
    branch_code: r.branchCode,
    assembly_code: r.assemblyCode,
    item_code: r.itemCode,
    section: r.section,
    layers: r.layers,
    description: r.description,
    size: r.size,
    labour_code: r.labourCode,
    note: r.note,
    sort_order: r.sortOrder,
  }));
  // assembly_bunch_database has no natural unique key — delete + re-insert per branch_code
  // The import script handles this: delete branch, then insert fresh rows
  const { error } = await supabaseAdmin.from('assembly_bunch_database').insert(dbRows);
  return { error: error ? { message: error.message } : null };
}

export async function deleteAssemblyBunchDatabaseByCode(branchCode: string): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .delete()
    .eq('branch_code', branchCode);
  return { error: error ? { message: error.message } : null };
}
```

---

## Updated Cache File

**File:** `src/lib/cache/materialDbCache.ts`

The existing `getMaterialDatabase()` function (which reads `spec_database`) is **deleted**.
All three new functions are added using the same Redis + in-memory pattern.

```typescript
// ─── material_database cache ───────────────────────────────────────────────────

const MAT_DB_NEW_CACHE_KEY = 'material-database-v2:json';
let matDbNewMemCache: { data: MaterialDatabaseRow[]; cachedAt: number } | null = null;

export const getMaterialDatabaseNew = async (): Promise<MaterialDatabaseRow[]> => {
  // same Redis + in-memory pattern as getMaterialDatabase()
  // fetches from material_database table via getAllMaterialDatabase()
};

export const invalidateMaterialDatabaseNewCache = async (): Promise<void> => {
  matDbNewMemCache = null;
  const redis = getRedisClient();
  if (redis) {
    try { await redis.del(MAT_DB_NEW_CACHE_KEY); }
    catch (err) { console.warn('[materialDbCache] Redis del (mat_db_new) failed:', err); }
  }
};

// ─── labour_database cache ─────────────────────────────────────────────────────

const LABOUR_DB_CACHE_KEY = 'labour-database:json';
let labourDbMemCache: { data: LabourDatabaseRow[]; cachedAt: number } | null = null;

export const getLabourDatabaseCached = async (): Promise<LabourDatabaseRow[]> => {
  // same Redis + in-memory pattern
  // fetches from labour_database table via getAllLabourDatabase()
};

export const invalidateLabourDatabaseCache = async (): Promise<void> => {
  labourDbMemCache = null;
  const redis = getRedisClient();
  if (redis) {
    try { await redis.del(LABOUR_DB_CACHE_KEY); }
    catch (err) { console.warn('[materialDbCache] Redis del (labour_db) failed:', err); }
  }
};

// ─── assembly_bunch_database cache ─────────────────────────────────────────────────────

const ASSEMBLY_BUNCH_DATABASE_CACHE_KEY = 'assembly-bunch-database:json';
let assemblyBunchDatabaseMemCache: { data: AssemblyBunchDatabaseItem[]; cachedAt: number } | null = null;

export const getAssemblyBunchDatabaseCached = async (): Promise<AssemblyBunchDatabaseItem[]> => {
  // same Redis + in-memory pattern
  // fetches from assembly_bunch_database table via getAllAssemblyBunchDatabase()
};

export const invalidateAssemblyBunchDatabaseCache = async (): Promise<void> => {
  assemblyBunchDatabaseMemCache = null;
  const redis = getRedisClient();
  if (redis) {
    try { await redis.del(ASSEMBLY_BUNCH_DATABASE_CACHE_KEY); }
    catch (err) { console.warn('[materialDbCache] Redis del (assembly_bunch_database) failed:', err); }
  }
};
```

Note: full implementation follows the exact lines as `getMaterialDatabase()` above it —
`getRedisClient()` guard, TTL check, fallback to Supabase, write-back to cache.

---

## Normalization Utility

**File:** `src/lib/utils/materialNormalizer.ts`

Pure functions only — no React, no DB calls, no side effects.

```typescript
// ─── mm → imperial lookup ──────────────────────────────────────────────────────
const MM_TO_IMPERIAL: Record<number, string> = {
  13: '1/2"', 16: '5/8"', 19: '3/4"', 25: '1"',
  38: '1-1/2"', 41: '1-5/8"', 51: '2"', 64: '2-1/2"',
  76: '3"', 89: '3-1/2"', 92: '3-5/8"', 102: '4"',
  152: '6"', 203: '8"',
};

// Handles: '16 mm' | '16mm' | '5/8"' | '5/8 inch' | 16 (number)
// Returns: '5/8"' | null
export function normalizeToImperial(raw: string | number | null): string | null

// Returns: 'Type X' | 'Type C' | 'Type MR' | null
export function normalizeBoardType(raw: string | null): string | null

// Maps free text to DB CATEGORY values
// 'GYPSUM WALLBOARD' | 'GWB' | 'drywall' → 'Drywall'
// 'STEEL STUDS' | 'stud' | 'framing' → 'FRAMING'
// 'insulation' | 'batt' → 'INSULATION'
export function mapToDBCategory(rawText: string): string | null

// Extract '2' from '2 LAYERS 16mm GYPSUM WALLBOARD' / 'DOUBLE LAYER' → 2
export function extractLayerCount(rawText: string): number  // default 1

// Identify assembly location
// 'wall' / 'partition' → 'wall' | 'ceiling' / 'lid' → 'ceiling' | 'bulkhead' → 'bulkhead'
export function extractLocation(rawText: string): 'wall' | 'ceiling' | 'bulkhead' | null

// Classify extracted assembly description into assembly branch types
// Returns ordered list of branch codes that apply (e.g. ['FR-WALL', 'DW-SGL-WALL', 'INS-WALL'])
// Rules:
//   location=wall   framing present → include FR-WALL
//   location=wall   board present + layers=1 → include DW-SGL-WALL
//   location=wall   board present + layers=2 → include DW-DBL-WALL
//   location=wall   sheathing present → include SH-WALL
//   location=wall   insulation present → include INS-WALL
//   location=ceiling framing present → include FR-CLG
//   location=ceiling board present + layers=1 → include DW-SGL-CLG
//   location=ceiling board present + layers=2 → include DW-DBL-CLG
//   location=ceiling ACT grid 2x2 → include ACT-GRID-2X2
//   location=ceiling ACT grid 2x4 → include ACT-GRID-2X4
//   location=ceiling tile only → include ACT-TILE
//   location=ceiling gypsum grid → include GYP-GRID
//   location=bulkhead framing → include FR-BULK
//   location=bulkhead board → include DW-SGL-BULK
//   shaft wall keywords → include FR-SHAFT / DW-SGL-SHAFT etc.
export function classifyAssemblyBranches(rawText: string): string[]

// Master function — called once per extracted assembly item
export interface NormalizedAssembly {
  rawText: string;
  location: 'wall' | 'ceiling' | 'bulkhead' | null;
  sizeImperial: string | null;   // stud/board size
  sizeMM: number | null;
  boardType: string | null;      // 'Type X' | 'Type C' | etc.
  category: string | null;
  layerCount: number;
  branchCodes: string[];         // output of classifyAssemblyBranches()
  keywords: string[];            // lowercased tokens, stopwords removed
}
export function normalizeExtractedAssembly(rawText: string): NormalizedAssembly
```

---

## Rule-Based Matching Service

**File:** `src/services/matching/ruleBasedMatcher.ts`

Replaces `src/services/openrouter/matchMaterials.ts` entirely.
Exports one function with the same return shape as the old `matchMaterialsToDatabase`.

```typescript
import type { MatchResult } from '@/types/pipeline';
import type { MaterialDatabaseRow, LabourDatabaseRow, AssemblyBunchDatabaseItem } from '@/types';
import { normalizeExtractedAssembly } from '@/lib/utils/materialNormalizer';
import { getMaterialDatabaseNew, getLabourDatabaseCached, getAssemblyBunchDatabaseCached } from '@/lib/cache/materialDbCache';

export async function matchAssembliesByRules(
  extraction: { assemblies: unknown[] },
): Promise<MatchResult>
```

### Internals (private, not exported)

**`expandBranchToMaterials(branchCodes, normalized, allBranchItems, allMaterialRows)`**

```
For each branchCode in branchCodes:
  items = allBranchItems.filter(i => i.branchCode === branchCode)
  For each item:
    if item.itemCode === 'XXXXXXX':
      resolved = resolvePlaceholder(item, normalized, allMaterialRows)
    else:
      resolved = allMaterialRows.find(r => r.code === item.itemCode)
    if resolved: add to BOM list with item metadata (layers, branchCode)
```

**`resolvePlaceholder(branchItem, normalized, allMaterialRows)`** — pure function

```
Determine target category from branchItem.description / branchCode:
  e.g. 'board' in DW-SGL-WALL → category = 'Drywall'
       'stud' in FR-WALL → category = 'FRAMING'
       'insulation' in INS-WALL → category = 'INSULATION'

Filter allMaterialRows by:
  1. category matches
  2. sizeImperial matches normalized.sizeImperial  (if available)
  3. type matches normalized.boardType             (if available)

If multiple candidates: score by specificity (exact type > partial > generic)
Return best match | null if no match (item is skipped, not an error)
```

**`resolveLabour(materialRow, location, allLabourRows)`** — pure function

```
labourCode = location === 'ceiling'  ? materialRow.ceilingLabourCode
           : location === 'bulkhead' ? materialRow.bulkheadLabourCode
           :                           materialRow.wallLabourCode

if (!labourCode) return { matched: [], bands: [] }

bands = allLabourRows.filter(r => r.labourCode === labourCode)
defaultBand = bands.find(b => b.htBand === 'Standard') ?? bands[0] ?? null
if (!defaultBand) return { matched: [], bands: [] }

return {
  matched: [toMatchedLabor(defaultBand)],
  bands,                          // all bands stored for finalize step
}
```

**`toMatchedMaterial(materialRow, branchItem?)`** — maps `MaterialDatabaseRow` → `MatchedMaterial`

**`toMatchedLabor(labourRow)`** — maps `LabourDatabaseRow` → `MatchedLabor`

**Fire/STC metadata preservation** — same pattern as existing service:

```typescript
// Build map before processing (same as matchMaterials.ts lines 97-112)
const metaById = new Map<string, AssemblyMeta>();
// ... populate from extraction.assemblies ...
// ... propagate back after matching ...
```

**Unmatched handling:**
- `matched_materials = []`, `matched_labor = []`
- Add `_unmatched: true` and `_rawText: string` on the assembly item
- Do not throw — pipeline continues

---

## Updated Match API Route

**File:** `src/app/api/match/route.ts`

Minimal changes — swap the internal call only:

```typescript
// REMOVE these lines:
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { ... }
const promptText = await getResolvedAIPrompt(AI_PROMPT_KEYS.MATERIAL_MATCH);
database = await getMaterialDatabase();
const result = await matchMaterialsToDatabase(extraction, database, apiKey, promptText, totalStart);

// REPLACE with:
const result = await matchAssembliesByRules({ assemblies: extraction.assemblies });
```

**Keep everything else unchanged:**
- `withAuth` wrapper
- Input validation
- `saveMaterialMatch()` call
- `updatePipelineRunStep()` / `failPipelineRun()` calls
- `writeJsonToLocal()` call
- All logging
- Response shape

---

## Updated Finalize Service

**File:** `src/services/finalize/mergeTakeoffWithMaterialMatch.ts`

Only `expandLaborForHeight()` changes. Nothing else.

```typescript
// UPDATED: check for _labourBands first (new path), fall back to spec_database lookup (old path)
const expandLaborForHeight = (
  labor: MatchedLabor,
  segments: HeightSegment[],
  laborIndex: LaborIndex,    // still passed in for backward compat
): MatchedLabor[] => {

  // NEW PATH: _labourBands present = came from new rule-based matcher
  if (labor._labourBands && labor._labourBands.length > 0) {
    return segments.map((segment) => {
      const band = labor._labourBands!.find(
        (b) => segment.height_ft >= b.htMinFt && segment.height_ft < b.htMaxFt,
      ) ?? labor._labourBands![0];
      return {
        code: band.labourCode,
        description: band.description,
        unit: band.uom,
        unit_cost: band.ratePerUom,
        height_ft: segment.height_ft,
        height_category: segment.category,
        _labourBands: labor._labourBands,
      };
    });
  }

  // OLD PATH: existing spec_database lookup — unchanged
  // ... existing code ...
};
```

---

## Import Scripts

### `scripts/importMaterialDatabase.ts`

Reads `data/Drywall Database (6-17-2026).xlsx` (sheet: `Material Data`).

```
Header detection: find row where cells include 'CODE' and 'DESCRIPTION'
Data rows: skip rows where CODE cell is empty OR row is a section-header
           (section-headers have no CODE value, only a CATEGORY label)
Column mapping (exact Excel column names → TS field):
  ROW_NUM              → rowNum
  CATEGORY             → category
  ASSEMBLY_CODE        → assemblyCode
  CODE                 → code
  WALL_LABOUR_CODE     → wallLabourCode
  CEILING_LABOUR_CODE  → ceilingLabourCode
  BULKHEAD_LABOUR_CODE → bulkheadLabourCode
  TYPE                 → type
  DESCRIPTION          → description
  SECTION              → section
  SIZE                 → size
  SIZE_NUM             → sizeNum
  UNIT_PRICE           → unitPrice
  CONTAINER_UNIT       → containerUnit
  QTY1_FORMULA         → qty1Formula
  UOM1                 → uom1
  QTY2_FORMULA         → qty2Formula
  UOM2                 → uom2
  QTY1_FORMULA2        → qty1FormulaCeiling   (ceiling context)
  UOM12                → uom1Ceiling
  QTY2_FORMULA2        → qty2FormulaCeiling
  UOM22                → uom2Ceiling
  NOTES                → notes

Compute at import time (never at match time):
  searchKeywords: [category, type, description.split(' '), sizeImperial, String(sizeMM)]
    .map(s => s?.toLowerCase().trim())
    .filter(s => s && s.length > 1 && !STOPWORDS.has(s))
  sizeMM: parse numeric mm from SIZE field if unit is mm
  sizeImperial: convert sizeMM via MM_TO_IMPERIAL lookup, or parse directly if SIZE is imperial
```

Run with: `npx tsx scripts/importMaterialDatabase.ts`
Expected row count: ~1152 data rows (skip section-header rows, skip empty CODE rows).

### `scripts/importLabourDatabase.ts`

Reads `data/Labour Database (6-17-2026).xlsx` (sheet: `Labour Data`).

```
Header detection: row index 1 (0-based) — first real data row is row index 2
Skip section-label rows: rows where LABOUR_CODE is blank
                         ('Walls', 'Bulkhead', 'Ceiling' section labels)
Column mapping:
  LABOUR_CODE  → labourCode
  CODE         → code
  DESCRIPTION  → description
  CATEGORY     → category
  HT_BAND      → htBand
  HT_MIN_FT    → htMinFt
  HT_MAX_FT    → htMaxFt
  UOM          → uom
  RATE_PER_UOM → ratePerUom
  QTY1_FORMULA → qty1Formula
  QTY1_UOM     → qty1Uom
  NOTES        → notes
```

Run with: `npx tsx scripts/importLabourDatabase.ts`
Expected row count: ~100 data rows (3 sections: Walls, Bulkhead, Ceiling).

### `scripts/importAssemblyBunchDatabase.ts`

Reads `data/Default_Assembly_Branch (6-17-2026).xlsx` (sheet: `by default assembly branch`).

```
The file has 20 named sections, each with its own header row.
Each section starts with a header row that contains 'ASSEMBLY_CODE' (or similar).
The section name (branchCode) must be parsed from the section label row
that precedes the header.

Section-to-branchCode mapping (from the Excel section labels):
  'FR-WALL' | 'DW-SGL-WALL' | 'DW-DBL-WALL' | 'SH-WALL' | 'INS-WALL'
  'FR-CLG'  | 'DW-SGL-CLG'  | 'DW-DBL-CLG'  | 'SH-CLG'  | 'INS-CLG'
  'FR-BULK' | 'DW-SGL-BULK'
  'FR-SHAFT'| 'DW-SGL-SHAFT'| 'FR-SHAFT-CLG'| 'DW-SGL-SHAFT-CLG'
  'ACT-GRID-2X2' | 'ACT-GRID-2X4' | 'ACT-TILE' | 'GYP-GRID'

Column mapping (per section, using detected header row):
  ASSEMBLY_CODE      → assemblyCode
  CODE (Item)        → itemCode     (store XXXXXXX as-is)
  SECTION            → section
  Layers             → layers       (parse as integer | null)
  DESCRIPTION        → description
  SIZE               → size
  WALL_LABOUR_CODE or LABOUR CODE → labourCode
  NOTE               → note
  (row index within section) → sortOrder

Import strategy:
  For each branchCode: DELETE existing rows, then INSERT fresh rows
  (no unique natural key, so delete+insert is cleaner than upsert)
```

Run with: `npx tsx scripts/importAssemblyBunchDatabase.ts`
Expected row count: ~120–150 rows across 20 sections (varies by section size).

---

## Implementation Order

### Phase 1 — Database + Data (no pipeline changes)
1. Write `supabase/migrations/020_create_material_labour_databases.sql` — all 3 tables
2. Run migration on Supabase
3. Add `MaterialDatabaseRow`, `LabourDatabaseRow`, `AssemblyBunchDatabaseItem` to `src/types/index.ts`
4. Add `_labourBands` optional field to `MatchedLabor` in `src/types/assembly/index.ts`
5. Write `src/lib/db/materialDatabase.ts`
6. Write `src/lib/db/labourDatabase.ts`
7. Write `src/lib/db/assemblyBunchDatabase.ts`
8. Write `scripts/importMaterialDatabase.ts` + run it → verify ~1152 rows in Supabase
9. Write `scripts/importLabourDatabase.ts` + run it → verify ~100 rows in Supabase
10. Write `scripts/importAssemblyBunchDatabase.ts` + run it → verify ~120–150 rows in Supabase

### Phase 2 — Normalizer + Matcher (no API changes yet)
11. Write `src/lib/utils/materialNormalizer.ts`
12. Test normalizer manually against sample extraction lines:
    `data/output/debug/*/08_extraction_merged.json`
    — confirm branch classification, size normalization, board type detection
13. Write `src/services/matching/ruleBasedMatcher.ts`
14. Test matcher output against existing AI match output:
    `data/output/debug/*/11_match_result.json`
    — compare matched codes and labour codes side by side

### Phase 3 — Wire Into Pipeline
15. Add new cache functions to `src/lib/cache/materialDbCache.ts` (3 functions)
16. Update `src/app/api/match/route.ts` — swap internal call
17. Update `expandLaborForHeight()` in finalize service — add new path, keep old path
18. End-to-end test: upload `PlanckOff-Wall-Assembly.pdf` + takeoff Excel
    → verify `final_output` JSON in `data/output/final_output/`
    → compare totals in Reports tab against a baseline run

### Phase 4 — Cleanup (only after Phase 3 confirmed stable)
19. Delete `src/services/openrouter/matchMaterials.ts`
20. Remove `OPENROUTER_API_KEY` check from match route
21. Remove `AI_PROMPT_KEYS.MATERIAL_MATCH` usage from match route
22. Delete `getMaterialDatabase()` from `src/lib/cache/materialDbCache.ts` (spec_database cache)
23. Delete `src/lib/db/materials.ts` (spec_database repository — all functions)
24. Delete `src/app/api/materials/route.ts` (spec_database API route)
25. Remove `useMaterials()` and the spec_database fetch from `src/context/AppContext.tsx`
26. Update `src/lib/utils/projectCosting.ts`: remove `buildProjectPriceMap()` and the
    `priceMap` parameter from `aggregateProjectCosts()` — unit_cost now comes directly
    from each `MatchedMaterial.unit_cost` as set by the matcher at match time
27. Grep for any remaining `spec_database`, `useMaterials`, `getMaterialDatabase` references
    and remove them

### Phase 5 — PDF Extraction Improvement (separate, after Phase 3 stable)
23. Write `src/services/extraction/pdfTableParser.ts` — TIER 0 deterministic parser
24. Update `/api/extract` to try TIER 0 first, fall through to existing AI on failure

### Phase 6 — Wall Type Detail View
25. Add `branchCode` to `CostLineItem` in `src/lib/utils/projectCosting.ts` so each line
    item knows which assembly branch it came from (FR-WALL, DW-SGL-WALL, etc.)
26. Write `src/components/features/reports/WallTypeDetailPanel.tsx` — slide-in panel,
    reads from `useProjectDataContext()`, no fetching, two tabs (Materials / Labour)
27. Wire click handler on wall type rows in the existing Reports/Materials view to open panel
28. Ensure `CostLineItem` carries `heightBand` from `MatchedLabor` for the Labour tab display

---

## Key Watch-Outs

**1. `XXXXXXX` rows go into the DB as-is**
Do not filter or skip placeholder rows during import. They are valid assembly_bunch_database rows.
At match time, `resolvePlaceholder()` handles them by searching `material_database` by
category + size + type from the normalized extraction. If no match is found, the item
is skipped silently (no error thrown — some placeholders may not resolve for all assemblies).

**2. Three labour code fields on `MaterialDatabaseRow`**
All three (`wallLabourCode`, `ceilingLabourCode`, `bulkheadLabourCode`) must be mapped in
the import script and in the repository transformer. An empty cell in Excel = empty string
in DB, not NULL. `resolveLabour()` returns empty when the code is ''.

**3. `spec_database` is gone from code — `material_database.unitPrice` is the sole cost source**
`spec_database` is never queried. `aggregateProjectCosts()` no longer builds a priceMap
from spec_database. Instead, `unit_cost` is set on each `MatchedMaterial` at match time
directly from `material_database.unitPrice`. `aggregateProjectCosts()` reads `unit_cost`
as already set — no external price lookup needed. Any existing priceMap / `buildProjectPriceMap`
logic in `projectCosting.ts` is removed. `getMaterialDatabase()` (the old spec_database cache
function) is deleted from `materialDbCache.ts`.

**4. Assembly bunch database import: delete + insert, not upsert**
`assembly_bunch_database` has no natural unique key (branch_code + item_code is not unique
because the same item_code can appear in multiple branches, and XXXXXXX can appear many times).
The import script must delete all rows for a branchCode then re-insert. Never upsert.

**5. Labour code uniqueness in `labour_database`**
If `labour_code` repeats across height bands (e.g., `LAB-HNG-STD` appears once per band),
the `upsert({ onConflict: 'labour_code' })` in the repository will overwrite. Review the
Excel first — if labour_code + ht_band is the unique key, the upsert conflict column needs
to change. Confirm during Phase 1 step 9.

**6. Scoring threshold is gone**
The old plan had a ≥6 score threshold. The new approach uses assembly branch classification
(keyword-based, deterministic) instead of fuzzy scoring. There is no threshold to tune.
Unresolved placeholders are benign — the BOM just has fewer items, not wrong items.

**7. `_labourBands` must be optional on `MatchedLabor`**
`aggregateProjectCosts()` in `projectCosting.ts` maps over `matched_labor` and reads
`code`, `unit_cost`, `quantity`. It must not break on the new `_labourBands` field.
Since it's optional and existing code only destructures known fields, this is safe —
but verify after Phase 3 step 18 by checking Reports tab totals.

**8. Labour code may legitimately be empty**
Many Framing rows in the Drywall DB (screws, fasteners) have no labour code for all three
contexts. `resolveLabour()` must return `{ matched: [], bands: [] }` cleanly — no warning,
no throw.

---

## Files Summary

| Action   | File |
|----------|------|
| NEW      | `supabase/migrations/020_create_material_labour_databases.sql` |
| NEW      | `scripts/importMaterialDatabase.ts` |
| NEW      | `scripts/importLabourDatabase.ts` |
| NEW      | `scripts/importAssemblyBunchDatabase.ts` |
| NEW      | `src/lib/db/materialDatabase.ts` |
| NEW      | `src/lib/db/labourDatabase.ts` |
| NEW      | `src/lib/db/assemblyBunchDatabase.ts` |
| NEW      | `src/lib/utils/materialNormalizer.ts` |
| NEW      | `src/services/matching/ruleBasedMatcher.ts` |
| NEW      | `src/services/extraction/pdfTableParser.ts` (Phase 5 only) |
| MODIFIED | `src/lib/cache/materialDbCache.ts` (delete getMaterialDatabase; add 3 new functions) |
| MODIFIED | `src/types/index.ts` (3 new interfaces) |
| MODIFIED | `src/types/assembly/index.ts` (`_labourBands` on MatchedLabor) |
| MODIFIED | `src/app/api/match/route.ts` (swap internal call, remove AI deps) |
| MODIFIED | `src/services/finalize/mergeTakeoffWithMaterialMatch.ts` (expandLaborForHeight + formula-based quantity computation) |
| MODIFIED | `src/lib/utils/projectCosting.ts` (remove priceMap/spec_database; remove inline arithmetic; read stored quantity * unit_cost only) |
| MODIFIED | `src/types/assembly/index.ts` (quantity + unit_cost made REQUIRED on MatchedMaterial and MatchedLabor) |
| MODIFIED | `src/context/AppContext.tsx` (remove useMaterials / spec_database fetch) |
| NEW      | `src/components/features/reports/WallTypeDetailPanel.tsx` (Phase 6) |
| DELETED  | `src/services/openrouter/matchMaterials.ts` (Phase 4 only) |
| DELETED  | `src/lib/db/materials.ts` (Phase 4 — spec_database repository) |
| DELETED  | `src/app/api/materials/route.ts` (Phase 4 — spec_database API route) |
| NO TOUCH | Everything else |
