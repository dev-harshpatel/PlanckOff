# Assembly Modal — Save Flow, Field Status & Blockers

This document tracks how every editable field in the Assembly Editor Modal is loaded,
displayed, modified, and saved — and identifies known bugs and blockers as of 2026-03-21.

---

## 1. Architecture Overview

The Assembly Editor Modal has **two distinct save paths**:

| Path | Trigger | What saves | Where it goes |
|------|---------|-----------|---------------|
| **Inline immediate** | blur / confirm dialog | UOM, formula overrides | `project_material_overrides` (local) or `spec_database` (global) |
| **Save button** | user clicks Save | unit cost, waste %, quantity, height, OC, layers, usage | `final_outputs` (via PATCH) + `project_material_overrides` (waste & unit cost sync) |

The Save button is shown whenever `isDirty = true`. It becomes dirty on any field change that
goes through `updateComp()`.

---

## 2. Full Load Path (Database → Modal)

```
GET /api/assembly-data?projectId={id}
  ↓
  final_outputs (latest)       → materialCostingData[]
  assembly_extractions (latest) → assemblyData[] (fallback structure)
  takeoff_outputs (linked)     → rawTakeoffRows[]
  project_material_overrides   → overrideMap
  ↓
applyProjectCostingOverrides(materialCostingData, overrideMap)
  ← merges project_material_overrides on top of final_outputs values
  ↓
mapFinalOutputToWallAssemblies(materialCostingData, resolvedMaterials)
  ← dbToUiMapper.ts
  ← for each assembly + each matched_material:
      overrideHeight  ← material.height_ft_override ?? assembly.height_ft
      ocSpacing       ← material.oc_spacing_override ?? inferred from spacing/usage
      overrideLayers  ← material.layers_override ?? extracted_material.layers
      wasteFactor     ← material.waste_percent / 100  (stored as %)
      overrideMatCost ← material.unit_cost            (no divisor)
      overrideQuantity← material.quantity
      usage           ← material.usage_override ?? inferred
  ↓
assemblies[] state in EstimateResult / AssemblyEditorModal
```

---

## 3. Field-by-Field Status

### 3.1 HEIGHT (`overrideHeight`)

| Attribute | Detail |
|-----------|--------|
| **Source in DB** | `final_outputs.assemblies[].materials_costing[].matched_materials[].height_ft_override` |
| **Fallback** | `final_outputs.assemblies[].height_ft` (from takeoff) |
| **Display** | `{comp.overrideHeight}'` — shown as-is in feet |
| **Editable in** | Component Detail Modal → Specs tab (NumberInput) |
| **Save path** | `updateComp(assemblyId, componentId, 'overrideHeight', newValue)` → `isDirty = true` → Save button → `buildAssemblyOverrideMaps` → `applyOverridesToCostingData` → sets `height_ft_override` on matched materials → PATCH `/api/final-output/[id]` |
| **Transformation on save** | None — stored in feet as entered |
| **Status** | 🔴 **BROKEN — REVERTS AFTER SAVE** |

**Root cause of the revert:**

The assembly's composite ID is `P1@9.7` (assembly_code `@` height_ft from takeoff).
On save, the assembly code is extracted as everything before the last `@`, and `heightFt`
is parsed from after the `@` (e.g. `9.7`). This `heightFt` is used to locate the right
assembly in `materialCostingData` to apply overrides:

```ts
// useAssemblySave.ts
const lastAt = assemblyToSave.id.lastIndexOf("@");
const assemblyCode = lastAt >= 0 ? assemblyToSave.id.slice(0, lastAt) : assemblyToSave.id;
const heightFt = lastAt >= 0 ? parseFloat(assemblyToSave.id.slice(lastAt + 1)) : null;

// assemblyOverrideUtils.ts
const isEditedAssembly =
  costing.assembly_id === assemblyCode &&
  (heightFt === null || costing.height_ft === heightFt);  // ← matches on OLD height
```

So `height_ft_override` is correctly saved to `final_outputs` with the new value.
**But** on save completion, `onAssemblySaveComplete(updatedCostingData)` is called,
which triggers a re-mapping via `mapFinalOutputToWallAssemblies`. During that re-map,
the assembly is re-built with ID `P1@9.7` (from `costing.height_ft`, not `height_ft_override`).
The `overrideHeight` on each component IS read from `height_ft_override` correctly,
but the **assembly header height** (shown in the modal title / global parameters) and
any formula variable `Height` still comes from `height_ft` from the takeoff — which
hasn't changed.

Additionally, **the divide-by-15 behaviour** noted by the user: this is not a literal
division in code but a consequence of how height is used in formulas. Some formulas
compute stud quantities as `(Height / OC) * Length * someMultiplier`, and if the formula
used a hard-coded height from the assembly that doesn't update when `overrideHeight` changes,
the quantity shown in the modal will revert to the formula-computed value the next time
the modal is opened (because formula evaluation uses `assembly.height_ft`, not
`comp.overrideHeight`).

**In short: the height field saves to DB correctly, but the formula engine and the
quantity re-computation on modal reopen ignore the override and use the takeoff height.**

---

### 3.2 OC SPACING (`ocSpacing`)

| Attribute | Detail |
|-----------|--------|
| **Source in DB** | `matched_materials[].oc_spacing_override` |
| **Fallback** | inferred from `extracted_material.spacing` or from `usage` string (e.g. `"Vertical @ 16\" OC"`) |
| **Display** | string, e.g. `"16\""` |
| **Editable in** | Component Detail Modal → Specs tab |
| **Save path** | Same as height — Save button → `buildAssemblyOverrideMaps` → `oc_spacing_override` in final_outputs |
| **Transformation on save** | None — stored as string |
| **Status** | 🟡 **PARTIAL — saves to DB but empty/invalid values are not blocked** |

**Known issue:** If OC is empty or contains a non-numeric string, no validation prevents
saving. Downstream formulas that parse OC (e.g. `(Height / OC) * Length`) will receive
`NaN` or `0`, causing silent formula errors. The formula evaluator does not guard against
this, producing `0` quantity for materials that depend on OC.

---

### 3.3 UNIT COST (`overrideMatCost`)

| Attribute | Detail |
|-----------|--------|
| **Source in DB** | `matched_materials[].unit_cost` (materials) or `matched_labor[].unit_cost` (labor) |
| **Fallback** | `spec_database.productivity` (via priceMap) — only if `unit_cost` is null |
| **Display** | as-is (no divisor applied) |
| **Editable in** | Component Detail Modal → General tab **and** inline in Materials / Labor tabs |
| **Save path (modal)** | Save button → `buildAssemblyOverrideMaps` → `materialUnitCostOverrides` → `applyOverridesToCostingData` → sets `unit_cost` project-wide on all assemblies with that code → PATCH `final-output` |
| **Save path (tabs)** | `handleUnitCostChange` in `page.tsx` → updates `materialCostingData` state immediately → PATCH `final-output` |
| **Transformation on save** | None — stored as-is |
| **Status** | ✅ **WORKING** |

**Minor UX issue:** In the Component Detail Modal (GeneralTab), the Unit Cost field's
placeholder value shows `material?.productivity` (the spec_database production rate)
instead of the current stored unit cost. This is visually misleading — the placeholder
should show the spec_database unit cost as the baseline.

---

### 3.4 WASTE FACTOR (`wasteFactor`)

| Attribute | Detail |
|-----------|--------|
| **Source in DB** | `matched_materials[].waste_percent` (stored as integer %, e.g. 10 = 10%) |
| **Fallback** | `constants/wasteFactor.ts` per-category default |
| **Internal representation** | **decimal** (0.10 for 10%) — converted on load via `/ 100` |
| **Display** | multiplied by 100 for display (NumberInput shows "10") |
| **Editable in** | Inline in Component Detail Modal → Specs tab AND inline cell in the main table |
| **Save path** | Inline blur → `onWasteChange(code, value * 100, isLabor)` immediately (no Save button needed) AND Save button → `buildAssemblyOverrideMaps` (wasteFactor × 100 → matWaste) → `waste_percent` in final_outputs |
| **Transformation** | Decimal × 100 → percent on every save path |
| **Status** | ✅ **WORKING** |

---

### 3.5 QUANTITY (`overrideQuantity`)

| Attribute | Detail |
|-----------|--------|
| **Source in DB** | `matched_materials[].quantity` (pre-computed at finalize) |
| **Formula override** | `project_material_overrides.formulaQty` (project-local) or `spec_database.formulaQty` (global) |
| **Priority** | formula override > `overrideQuantity` > formula-evaluated quantity |
| **Display** | formula result OR stored quantity |
| **Editable in** | Component Detail Modal → General tab |
| **Save path** | Save button → `buildAssemblyOverrideMaps` → `matQty` → `quantity` in final_outputs |
| **Transformation** | None |
| **Status** | ✅ **WORKING** |

**Note:** If a formula override is set (via the formula icon in the Qty column), that
formula is evaluated at render time and takes precedence over `overrideQuantity`.
Changing `overrideQuantity` in the modal has no visible effect while a formula override
is active.

---

### 3.6 UOM / SECONDARY UOM (`mouWall`, `mouWallSec`, etc.)

| Attribute | Detail |
|-----------|--------|
| **Source in DB** | `spec_database.mou_wall` / `mou_ceil` / `mou_wall_sec` / `mou_ceil_sec` |
| **Project override** | `project_material_overrides.mouWall` / `mouCeil` / `mouWallSec` / `mouCeilSec` |
| **Editable in** | Inline cell in Assembly modal UOM column |
| **Save path** | On blur → Local/Global confirm dialog → PATCH `project_material_overrides` (local) or PATCH `spec_database` (global) |
| **NOT saved via** | Save button |
| **Status** | ✅ **WORKING** |

---

### 3.7 FORMULA OVERRIDES (`formulaQty`, `formulaSecQty`, etc.)

| Attribute | Detail |
|-----------|--------|
| **Source in DB** | `spec_database.formula_qty` or `project_material_overrides.formulaQty` |
| **Editable in** | Formula Edit icon in Qty / Se.Qty column |
| **Save path** | Formula Edit Modal → "This project only" → PATCH `project_material_overrides`; "All projects" → PATCH `spec_database` |
| **NOT saved via** | Save button |
| **Status** | ✅ **WORKING** |

---

## 4. Save Button — Full Flow

```
User clicks Save in AssemblyEditorModal
  ↓
handleSaveAssembly(assembly) [useAssemblySave.ts]
  ↓
  1. assembliesRef.current.find(a => a.id === assembly.id)
     → gets latest state (avoids stale closure)
  ↓
  2. Parse composite ID:
     e.g. "P1@9.7" → assemblyCode="P1", heightFt=9.7
  ↓
  3. buildAssemblyOverrideMaps(assemblyToSave)
     → For each component:
        - overrideMatCost  → materialUnitCostOverrides  (project-wide)
        - wasteFactor×100  → matWaste                   (project-wide)
        - overrideQuantity → matQty                     (this assembly only)
        - overrideHeight   → matHeight                  (this assembly only)
        - ocSpacing        → matOc                      (this assembly only)
        - overrideLayers   → matLayers                  (this assembly only)
        - usage            → matUsage                   (this assembly only)
  ↓
  4. applyOverridesToCostingData(materialCostingData, assemblyCode, heightFt, maps)
     → For every assembly in materialCostingData:
        matched_materials:
          unit_cost     ← materialUnitCostOverrides[code]  (all assemblies)
          waste_percent ← matWaste[code]                   (all assemblies)
          quantity      ← matQty[code]     if isEditedAssembly
          height_ft_override ← matHeight[code]   if isEditedAssembly
          oc_spacing_override ← matOc[code]       if isEditedAssembly
          layers_override ← matLayers[code]        if isEditedAssembly
          usage_override ← matUsage[code]          if isEditedAssembly
        matched_labor:
          unit_cost     ← laborUnitCostOverrides[code]     (all assemblies)
          waste_percent ← labWaste[code]                   (all assemblies)
          height_ft     ← labHeight[code]   if isEditedAssembly
  ↓
  5. PATCH /api/final-output/{finalOutputId}
     body: { assemblies: updatedCostingData }
     → updateFinalOutput() in lib/db/pipelineOutputs.ts
     → writes to final_outputs table in Supabase
  ↓
  6. syncWasteOverrides(assemblyToSave)
     → for each component: if wasteFactor differs from global default
       PATCH /api/projects/{id}/material-overrides
       field: "wastePercent", value: wasteFactor * 100
  ↓
  7. syncUnitCostOverrides(assemblyToSave)
     → for each component: if overrideMatCost differs from spec_database baseline
       PATCH /api/projects/{id}/material-overrides
       field: "productivity" (material) or "hourlyRate" (labor)
  ↓
  8. onAssemblySaveComplete(updatedCostingData)
     → calls setMaterialCostingData(updatedCostingData) in page.tsx
     → triggers re-map: mapFinalOutputToWallAssemblies → new assemblies[]
     → modal receives updated assembly via props
```

---

## 5. Known Blockers & Bugs

### BUG-1: Height Override Reverts on Save / Modal Reopen ✅ FIXED 2026-03-22

**Symptom:** User changes height in Component Detail → Specs tab. Clicks Save. The modal
briefly shows the new height then snaps back to the original, OR reopening the modal shows
the old value.

**Root cause (confirmed):**
- The assembly composite ID `P1@9.7` encodes the original takeoff height.
- After save, `onAssemblySaveComplete` triggers `mapFinalOutputToWallAssemblies`.
- This re-build reads each component's `height_ft_override` correctly from `updatedCostingData`.
- **BUT:** the formula engine (`formulaEvaluator.ts`) uses the `Height` variable derived from
  the assembly-level `height_ft` (the takeoff value), not from `comp.overrideHeight`.
- Any formula-computed quantity (e.g. stud count) recalculates with the old height,
  making the visual effect "look like" the height reverted even though the DB value is correct.
- Additionally, if the assembly modal is reopened, the re-mapped component may show the
  correct `overrideHeight` from DB, but quantities will still show formula results based
  on the original `height_ft`.

**Fix applied (2026-03-22):**

Two changes were made:

1. **`useAssemblyActions.ts` — `updateAssemblyInfo`**: When `field === 'defaultHeight'`,
   the new height is immediately propagated to every component's `overrideHeight`. This
   means the formula evaluator uses the new height live during editing, and
   `buildAssemblyOverrideMaps` captures all components' updated heights on Save, writing
   `height_ft_override = newHeight` for every material in `final_outputs`.

2. **`dbToUiMapper.ts` — `mapFinalOutputToWallAssemblies`**: After re-mapping from DB,
   the function inspects all `height_ft_override` values on the materials. If every
   material agrees on the same override height, that value is used as `defaultHeight`
   (so the sidebar shows the saved height on next open). Falls back to the takeoff
   `height_ft` when overrides are absent or mixed.

---

### BUG-2: OC Spacing — No Validation, Empty Value Causes Silent Formula Errors 🟡

**Symptom:** If OC is cleared or left as empty string and Save is clicked, it saves
successfully. But any material whose formula divides by OC (e.g. stud count =
`(Height / OC) * Length`) will receive `NaN` or divide-by-zero, producing 0 quantity.
No error is shown to the user.

**Location:** `SpecsTab.tsx` (OC input), `formulaEvaluator.ts` (OC variable usage).

**Fix needed:**
- Validate OC > 0 before allowing Save when the assembly type requires it.
- Or: add a guard in `formulaEvaluator.ts` to fall back to the previous OC if the new value is invalid.

---

### BUG-3: Unit Cost Placeholder Shows Wrong Value (Minor UX) 🟡

**Symptom:** In the Component Detail Modal → General tab, the Unit Cost Override field
shows `material.productivity` as the placeholder instead of the actual baseline unit cost.
This makes it look like the field is for entering a productivity rate.

**Location:** `GeneralTab.tsx` line ~127: `placeholder={material?.productivity?.toString() || '0.00'}`

**Fix needed:** Change placeholder to show current baseline unit cost from `priceMap` or `spec_database`.

---

### BUG-4: Inline Table Edits May Diverge from Component Detail Modal 🟡

**Symptom:** User edits a field inline in the main assembly table. Then opens Component
Detail for the same component. The modal shows the old value from when it was opened,
not the inline edit.

**Root cause:** `ComponentDetailModal` initialises its local state from the `component`
prop once (on mount). Inline table edits call `handleUpdateComponent` which updates the
parent `assemblies[]` state, but the already-open `ComponentDetailModal` does not re-read
the prop because `localComp` is stored in local state.

---

## 6. Field Status Summary

| Field | Editable | Saves Correctly | Known Issue |
|-------|----------|----------------|-------------|
| **Height** | ✅ (Specs tab + sidebar) | ✅ Fixed 2026-03-22 | BUG-1 resolved |
| **OC Spacing** | ✅ (Specs tab) | ⚠️ Saves to DB, empty causes silent formula error | BUG-2 |
| **Layers** | ✅ (Specs tab) | ✅ | — |
| **Usage / Calc Method** | ✅ (Specs tab / inline select) | ✅ | — |
| **Waste %** | ✅ (Specs tab + inline cell) | ✅ | — |
| **Unit Cost (material)** | ✅ (General tab + Materials tab) | ✅ | Misleading placeholder (BUG-3) |
| **Unit Cost (labor)** | ✅ (General tab + Labor tab) | ✅ | — |
| **Quantity override** | ✅ (General tab) | ✅ | Overridden by formula if formula is active |
| **UOM (primary)** | ✅ (inline cell) | ✅ (immediate, not via Save button) | — |
| **UOM (secondary)** | ✅ (inline cell) | ✅ (immediate, not via Save button) | — |
| **Formula (Qty)** | ✅ (formula icon) | ✅ (immediate, not via Save button) | — |
| **Formula (Se.Qty)** | ✅ (formula icon) | ✅ (immediate, not via Save button) | — |

---

## 7. Value Transformation Reference

| Field | DB format | Load transform | Internal state | Save transform | Saved as |
|-------|-----------|---------------|---------------|---------------|----------|
| `waste_percent` | integer % (e.g. 10) | `÷ 100` | decimal (0.10) | `× 100` | integer % |
| `unit_cost` | display value (e.g. 1.50) | none | display value | none | display value |
| `height_ft_override` | feet (e.g. 9.7) | none | feet | none | feet |
| `oc_spacing_override` | string (e.g. "16\"") | none | string | none | string |
| `layers_override` | integer | none | integer | none | integer |
| `quantity` | pre-computed number | none | number | none | number |

---

## 8. What Saves Immediately vs. Via Save Button

**Saves immediately (no Save button needed):**
- Waste % (inline cell or Specs tab blur) → `final_outputs` + `project_material_overrides`
- UOM (inline cell blur) → `project_material_overrides` or `spec_database`
- Formula overrides (Formula Edit Modal confirm) → `project_material_overrides` or `spec_database`
- Unit cost from Materials or Labor tab → `final_outputs`

**Requires Save button:**
- Unit cost changed in Component Detail Modal (General tab)
- Quantity override (General tab)
- Height (Specs tab)
- OC Spacing (Specs tab)
- Layers (Specs tab)
- Usage / Calculation Method (Specs tab)

---

## 9. DATA_SOURCES.md Accuracy Check

The existing `docs/DATA_SOURCES.md` is **accurate and up to date** as of this review.
The following details were verified:

| Claim in DATA_SOURCES.md | Verified |
|--------------------------|---------|
| Unit costs stored as display value (no × 1000) | ✅ Confirmed |
| `waste_percent` stored as integer % in DB | ✅ Confirmed |
| `height_ft` from takeoff, `height_ft_override` for edits | ✅ Confirmed |
| Save button patches `final_outputs` | ✅ Confirmed |
| UOM / formula edits go to `project_material_overrides` | ✅ Confirmed |
| `Wall height, total length` listed as not editable | ⚠️ Partially inaccurate — height IS editable via Specs tab, but the effect is unreliable (BUG-1) |

**Suggested update to DATA_SOURCES.md Section 12 (Quick Reference):**
Change `"Wall height, total length | final_outputs (from takeoff) | No"` to
`"Wall height | final_outputs (height_ft_override) | Yes — editable in Specs tab, but formula quantities do not respond to this override (BUG-1)"`.

---

## 10. Formula Analysis — Load Path, Save Path, and Variable Reactivity

### 10.1 Where Formulas Are Loaded From

Formulas flow in through **two separate sources**, with the component-level override winning:

```
spec_database.formula_qty (global)
        ↓ loaded via materials[] prop → material.formulaQty
computeFormulaQuantities()    [formulaEvaluator.ts:307-310]
        comp.formulaQtyOverride ?? material?.formulaQty ?? ''
        ↑
project_material_overrides.formulaQty (local)
     → stored in overrideMap[code].formulaQty
     → ⚠️ NOT fed into computeFormulaQuantities (see BUG-F1)
```

**Key resolution code in `formulaEvaluator.ts:307-310`:**
```ts
const wallQtyFormula   = comp.formulaQtyOverride     ?? material?.formulaQty     ?? '';
const wallSeQtyFormula = comp.formulaSecQtyOverride  ?? material?.formulaSecQty  ?? '';
const ceilQtyFormula   = comp.formulaCeilQtyOverride ?? material?.formulaCeilQty ?? '';
const ceilSeQtyFormula = comp.formulaCeilSecQtyOverride ?? material?.formulaCeilSecQty ?? '';
```

**Formula text is NEVER stored in `final_outputs` JSON.** The mapper (`dbToUiMapper.ts → mapFinalOutputToWallAssemblies`) does not map any formula fields onto components. Only the computed `quantity` result lives in `final_outputs`. Every render re-evaluates the formula live from the formula string.

---

### 10.2 Formula Save Paths

| Where entered | Save destination | Goes to final_outputs? |
|---|---|---|
| Formula icon → "This project only" | `project_material_overrides.formulaQty` | ❌ No — formula string only |
| Formula icon → "All projects" | `spec_database.formula_qty` | ❌ No — formula string only |
| FormulasTab in ComponentDetailModal | In-memory only (`comp.formulaQtyOverride`) | ❌ No |
| Assembly Save button | `final_outputs.quantity` (computed result) | ✅ Only the evaluated number, never the formula string |

Formulas have a **completely separate save path** from all other fields. The Save button does not collect formula overrides — `buildAssemblyOverrideMaps` only collects `overrideMatCost`, `wasteFactor`, `overrideQuantity`, `overrideHeight`, `ocSpacing`, `overrideLayers`, and `usage`.

---

### 10.3 Do Formula Variables Update When Other Fields Change?

Formula re-evaluates in real-time at render time when these fields change in the modal:

| Field changed | Formula variable | Re-computes? | Code reference |
|---|---|---|---|
| `overrideHeight` | `Height` / `H` | ✅ Yes | `calcHeight = comp.overrideHeight ?? baseHeight` (formulaEvaluator.ts:279) |
| `ocSpacing` / `usage` | `OC` | ✅ Yes | parsed from `comp.ocSpacing \|\| comp.usage` (line 288-289) |
| `overrideLayers` | `layer` / `Layers` | ✅ Yes | `layers = comp.overrideLayers ?? baseLayers` (line 280) |
| `wasteFactor` | `Wastage` | ✅ Yes | `wastage = comp.wasteFactor ?? getWasteFactor(...)` (line 283-285) |
| `Length` | `Length` / `L` | ❌ Not editable | comes from takeoff instances or `extractedDimensions.totalLength` only |

**Critical caveat:** The formula re-evaluates and the table shows a new quantity immediately after a field change. However, the assembly Save button persists `comp.overrideQuantity` (the manually entered qty), not the formula result. The formula-computed quantity is recalculated fresh each render from the formula string + current variables — it is never captured and written back to `final_outputs.quantity` automatically.

---

### 10.4 Formula Bugs & Blockers

#### BUG-F1: Local Formula Saves Don't Affect Formula Computation 🔴

**Symptom:** User edits a formula via the formula icon → selects "This project only" → formula is saved to DB. The quantity displayed in the table does NOT change.

**Root cause:** `applyFormulaLocal` (AssemblyEditorModal.tsx:186-214):
1. ✅ PATCHes to `project_material_overrides` — formula is in the DB.
2. ✅ Calls `onOverrideMapChange(...)` — `overrideMap[code].formulaQty` is updated, and the override indicator dot appears.
3. ❌ Does NOT call `updateComp()` — `comp.formulaQtyOverride` is never set.

`computeFormulaQuantities` reads `comp.formulaQtyOverride`, which stays `undefined`, so it falls back to `material?.formulaQty` from `spec_database`. The project-level formula override is ignored for evaluation.

`applyProjectCostingOverrides` (projectPricing.ts:39-47) is the load-time override applier — it only handles unit cost and waste, not formulas. So even on page reload, `project_material_overrides.formulaQty` never flows into `comp.formulaQtyOverride`.

**Fix needed:** `applyFormulaLocal` must also call `updateComp(assembly.id, componentId, overrideKey, formulaValue)` for each saved formula field so the component state reflects the new formula immediately. Additionally, `applyProjectCostingOverrides` (or a sibling function) must map `overrideMap[code].formulaQty` onto `comp.formulaQtyOverride` at load time.

---

#### BUG-F2: FormulasTab Overrides Are In-Session Only 🟡

**Symptom:** User types a formula in ComponentDetailModal → Formulas tab → clicks "Save Changes". Formula evaluates correctly in the current browser session. On page reload, the formula reverts to the DB default.

**Root cause:** The detail modal's `handleSave` (ComponentDetailModal.tsx:95-110) calls `onUpdateField` (which is `updateComp`) for `formulaQtyOverride` — this updates `assembly.components` state and marks `isDirty = true`. But the assembly Save button's `buildAssemblyOverrideMaps` does not include formula override fields, so nothing is written to `project_material_overrides` or `final_outputs`.

**Fix needed:** Either route FormulasTab saves through the same Local/Global confirm flow as the formula icon (so they persist to `project_material_overrides`), or explicitly include `formulaQtyOverride` fields in `buildAssemblyOverrideMaps` and write them to `project_material_overrides` on Save.

---

#### BUG-F3: Formula Result Does Not Auto-Sync to final_outputs.quantity 🟡

**Symptom:** User changes Height (or OC/Layers/Waste) in the modal. The Qty column updates live to reflect the new formula result. User clicks Save. On reload, the Qty shown differs from what was visible after the field change.

**Root cause:** The formula result is computed at render time only. The Save button writes `comp.overrideQuantity` to `final_outputs.quantity`, not the formula result. If `overrideQuantity` was not explicitly changed by the user in the General tab, the previously stored quantity is re-written — which may differ from the formula result using the newly saved height/OC/layers.

**Fix needed:** When building the override map for Save, if a formula is active for a component, compute the formula result with the current variable values and write it as the new `quantity` in `final_outputs`. This keeps the stored quantity consistent with what the formula would produce.

---

### 10.5 Formula Bug Summary

| Bug | Severity | Description |
|---|---|---|
| **BUG-F1** | 🔴 Critical | Local formula saves update `overrideMap` only — `comp.formulaQtyOverride` is never set, so formula evaluation is unaffected at runtime and on reload |
| **BUG-F2** | 🟡 Moderate | FormulasTab overrides persist only for the current session — no save path to DB exists |
| **BUG-F3** | 🟡 Moderate | Formula result from field changes (height/OC/layers) does not propagate to `final_outputs.quantity` on Save |
| **BUG-1** (existing) | 🔴 Critical | Height override saves to DB but `formulaEvaluator` re-reads `assembly.height_ft` (takeoff) not `comp.overrideHeight` on reload — formula quantities revert |
