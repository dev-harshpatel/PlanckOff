# Stored Calculations Implementation Plan

**Status: Implemented** (Phase 1 & 2 complete. Phase 3 PATCH API ready; Assembly modal wiring optional.)

## Problem

- **Current**: Qty, Sec.Qty, and other formula results are recalculated on every page load.
- **Issues**:
  1. Expensive recomputation (formulas, wastage, etc.)
  2. Inconsistency between tabs (Materials vs MatLab vs Assembly modal) — different wastage/formulas
  3. No single source of truth — edits in Assembly modal don't persist or reflect in Materials tab

## Goal

Store calculated values in `final_outputs.data` (project-scoped) so that:
1. One compute at finalize time
2. Materials tab, MatLab tab, Assembly modal all read from stored values
3. Assembly modal edits persist to DB and reflect everywhere
4. Projects stay isolated (final_outputs.project_id)

---

## Phase 1: Extend Schema & Compute at Finalize

### 1.1 Extend MatchedMaterial / MatchedLabor Types

Add optional stored fields to `src/types/assembly/index.ts`:

```ts
export interface MatchedMaterial {
  code: string;
  section?: string;
  description: string;
  manufacturer: string;
  unit: string;
  unit_cost: number;
  /** Stored quantity (computed at finalize) — single source of truth */
  quantity?: number;
  /** Stored secondary quantity (e.g. sheets from SF) */
  sec_quantity?: number;
  sec_unit?: string;
  /** Waste % used for this calculation */
  waste_percent?: number;
}

export interface MatchedLabor {
  code: string;
  section?: string;
  description: string;
  unit: string;
  unit_cost: number;
  height_ft?: number;
  height_category?: string;
  /** Stored quantity */
  quantity?: number;
}
```

### 1.2 Shared Quantity Computation

Create `src/lib/utils/quantityFromExtracted.ts` — extract the logic from `aggregateMaterialsFromCosting` into reusable functions:

- `computeQuantityFromExtracted(extracted_material, mat, materials)` → number
- `computeSecQuantityFromExtracted(extracted_material, mat, materials, qty)` → number | null

These use the same formula/wastage logic as today's Materials tab.

### 1.3 Enrich at Finalize

In `mergeTakeoffWithMaterialMatch.ts`, after building each `materials_costing` item:

- For each `matched_material`: compute qty, sec_qty using the shared functions (need materials DB for formulas).
- For each `matched_labor`: set quantity (1 for HR, or derived from segment).
- Attach `quantity`, `sec_quantity`, `sec_unit`, `waste_percent` to each matched entry.

**Challenge**: `mergeTakeoffWithMaterialMatch` currently doesn't receive the full materials DB (only labor index for height segmentation). We need to pass materials DB into finalize so we can resolve formulas.

**Options**:
- A) Pass materials DB into finalize API — finalize fetches materials and passes to mergeTakeoffWithMaterialMatch.
- B) Compute in a post-processing step after merge — call a new `enrichFinalOutputWithQuantities(result, materials)` before saving.

Recommend **B** — keeps merge logic clean; enrichment is a separate concern.

### 1.4 Finalize API Flow

```
finalize API:
  1. mergeTakeoffWithMaterialMatch(assemblies, takeoffRows, materialMatch, laborDb)
  2. fetch materials from spec_database
  3. enrichFinalOutputWithQuantities(result, materials)
  4. saveFinalOutput(result)
```

---

## Phase 2: Use Stored Values in Consumers

### 2.1 aggregateMaterialsFromCosting

When `matched_material.quantity` is present, use it. Otherwise fall back to current `getQuantityFromExtracted` (backward compat for old final_outputs).

```ts
const qty = mat.quantity ?? getQuantityFromExtracted(...);
const secQty = mat.sec_quantity ?? getSecQuantityFromExtracted(...);
```

### 2.2 MatLabView

Replace inline `getQuantityFromExtracted` with: use `mat.quantity` when present, else simple fallback (or call shared util).

### 2.3 Assembly Modal / assemblyJsonMapper

When mapping final_output → WallAssembly components, pass through `quantity` and `sec_quantity` from matched_materials into `AssemblyComponent.overrideQuantity` (or a new field) so the modal displays stored values.

---

## Phase 3: Persist Assembly Modal Edits

### 3.1 Update final_outputs

Add to `src/lib/db/pipelineOutputs.ts`:

```ts
export const updateFinalOutput = async (
  finalOutputId: string,
  data: unknown,
) => {
  const { data: result, error } = await supabaseAdmin
    .from("final_outputs")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", finalOutputId)
    .select()
    .single();
  // ...
};
```

**Note**: `updated_at` may need a migration if not present.

### 3.2 API: PATCH /api/final-output/[id]

- Auth: withAuth
- Body: `{ assemblies: [...] }` — full assemblies array (or delta — prefer full for simplicity)
- Validates project ownership
- Calls `updateFinalOutput`

### 3.3 Map WallAssembly Edits Back to final_output

When user saves from Assembly modal:
- We have: `WallAssembly[]` (edited)
- We need: `final_output.assemblies` format

Create `mapWallAssembliesToFinalOutput(assemblies, takeoffs)` — inverse of `mapFinalOutputToAssemblies`. This is non-trivial because:
- WallAssembly has `components[]` with overrideQuantity, overrideMatCost, etc.
- final_output has `materials_costing[]` with matched_materials[].quantity

Strategy: Keep a ref to the original final_output. When user edits, merge overrides into the original structure (update matched_materials[].quantity where component id matches).

### 3.4 EstimateResult / Assembly Modal Save Flow

- On Assembly modal save: call `PATCH /api/final-output/[id]` with merged data.
- On success: refresh assembly-data (or update local state from response).
- Materials tab will show updated values on next render (data comes from same source).

---

## Phase 4: Migration & Backward Compatibility

### 4.1 Old final_outputs

- No `quantity` on matched_materials → aggregateMaterialsFromCosting falls back to compute.
- No behavior change for existing projects.

### 4.2 Optional: Backfill

- Could add a script or "Recalculate" button to re-run enrichment on existing final_outputs (optional).

---

## File Checklist

| File | Change |
|------|--------|
| `src/types/assembly/index.ts` | Add quantity, sec_quantity, sec_unit, waste_percent to MatchedMaterial; quantity to MatchedLabor |
| `src/lib/utils/quantityFromExtracted.ts` | New — shared compute logic |
| `src/lib/utils/aggregateMaterialsFromCosting.ts` | Use stored values when present |
| `src/lib/utils/enrichFinalOutputWithQuantities.ts` | New — post-process final_output |
| `src/app/api/finalize/route.ts` | Call enrich before save; fetch materials |
| `src/services/finalize/mergeTakeoffWithMaterialMatch.ts` | No change (enrich is separate) |
| `src/components/features/reports/MatLabView.tsx` | Use mat.quantity when present |
| `src/lib/db/pipelineOutputs.ts` | Add updateFinalOutput |
| `src/app/api/final-output/[id]/route.ts` | New — PATCH handler |
| `src/lib/utils/assemblyJsonMapper.ts` | Map stored qty into components |
| `src/components/features/project/EstimateResult.tsx` | Wire Assembly save → PATCH API |
| `supabase/migrations/` | Optional: add updated_at to final_outputs |

---

## Order of Implementation

1. **Phase 1**: Types, quantityFromExtracted, enrichFinalOutputWithQuantities, finalize API
2. **Phase 2**: aggregateMaterialsFromCosting, MatLabView, assemblyJsonMapper
3. **Phase 3**: updateFinalOutput, PATCH API, Assembly modal save wiring

---

## Risks & Mitigations

- **Formula mismatch**: Enrichment uses same logic as aggregateMaterialsFromCosting — extract to shared util to guarantee consistency.
- **Materials DB at finalize**: Must fetch; already available in project. Add to finalize route.
- **Assembly modal ↔ final_output mapping**: Complex. Consider storing component-level overrides in a parallel structure (e.g. `override_quantities: { [componentId]: number }`) to simplify merge.
