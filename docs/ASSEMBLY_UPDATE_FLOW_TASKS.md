## Assembly Update Flow Refactor — Task List

### Goal

Move the assembly editing flow to a **Save-button-only** model for these fields, with a single, consistent source of truth:

- **Hgt** (component/assembly height overrides)
- **OC** (spacing / oc_spacing)
- **Layering** (layers / overrideLayers)
- **Wst%** (wasteFactor / waste_percent)
- **Unit Cost** (material + labor unit_cost overrides)

Edits happen in the **Assembly Editor Modal**, are applied to the correct backing store (`final_outputs` and/or overrides), and are then reflected **everywhere** that value is used (assembly modal, reports, markups, Mat+Lab, etc.).

---

### 1. Lock in interaction & data ownership model

- [ ] **Document interaction model**:  
  - All of Hgt, OC, Layering, Wst%, Unit Cost are **local-only while editing** (React state).  
  - **Only the Save button in `AssemblyEditorModal` triggers persistence** to the backend.
- [ ] **Confirm source of truth per field** (in code comments + this doc):  
  - Hgt / OC / Layering: stored in `final_outputs.data.assemblies[*].materials_costing[*].matched_materials[*]` as per-instance overrides (height_ft_override, oc_spacing_override, layers_override, usage_override, etc.).  
  - Wst%: stored in `final_outputs` (`waste_percent` on matched_materials/matched_labor) — project-wide per material code.  
  - Unit Cost: stored in `final_outputs` (`unit_cost` on matched_materials/matched_labor) — project-wide per material code.

---

### 2. Centralize front-end update pipeline

- [ ] **Create a single internal helper** in `EstimateResult.tsx` (or a small local module) to map a `WallAssembly` + edited components into:
  - project-wide overrides (unit_cost, waste_percent) by material code
  - per-assembly overrides (height, OC, layering, qty, usage) scoped to the edited assembly
- [ ] **Ensure `AssemblyEditorModal` only talks to this helper via props**:
  - `onSaveAssembly(assembly: WallAssembly)` remains the single entry point.
  - All per-cell change handlers inside the modal only call `handleUpdateComponent` (local state), not any fetch or DB logic.
- [ ] **Remove/disable any blur-triggered persistence** related to Hgt, OC, Layering, or Wst%:
  - No `fetch`/PATCH calls in `AssemblyEditorModal`.
  - No auto-PATCH from `onWasteChange` or similar; it should only update in-memory state used for live calculations if needed.

---

### 3. Simplify and harden `handleSaveAssembly`

- [ ] **Refactor `handleSaveAssembly` in `EstimateResult.tsx`** to:
  - Read from `assembliesRef.current` (already fixed for React 18) to get the latest `WallAssembly`.
  - Build **explicit maps**:
    - `materialUnitCostOverrides: Map<materialCode, number>`
    - `laborUnitCostOverrides: Map<materialCode, number>`
    - `materialWasteOverrides: Map<materialCode, number>` (project-wide)
    - `laborWasteOverrides: Map<materialCode, number>` (project-wide)
    - `perAssemblyOverrides` for Hgt, OC, Layering, Qty, Usage keyed by `(assembly_id, height_ft?, materialCode)`.
  - Apply these maps onto `materialCostingData` to produce a new `updatedCostingData` array.
- [ ] **Ensure write rules**:
  - **Unit Cost + Wst%**: applied across **all assemblies** where that `code` appears (project-wide consistency).  
  - **Hgt, OC, Layering, Qty, Usage**: applied **only to the edited assembly instance** (based on `assembly_id` + `height_ft` parsed from composite ID).
- [ ] **Update `materialCostingData` state** in `EstimateResult`/`project/page.tsx` immediately after a successful Save so the UI stays in sync without another GET.
- [ ] **Leave `PATCH /api/final-output/[id]` as the only persistence point** for these fields:
  - Body stays `{ assemblies: updatedCostingData }` for now (blob write), but the transformation logic becomes clean and centralized.

---

### 4. Remove legacy/hybrid paths and dead code

- [ ] In `project/page.tsx`:
  - [ ] Remove/disable any blur-save PATCH logic for Wst% (if still present in `handleWasteChange` or similar).
  - [ ] Keep `handleUnitCostChange` for **Reports tab inline edits** but ensure it uses the **same mapping rules** as `handleSaveAssembly` for project-wide consistency.
- [ ] In `AssemblyEditorModal.tsx`:
  - [ ] Confirm there is **no direct fetch** or `onWasteChange` path that hits the DB.
  - [ ] Ensure `updateComp` only sets `isDirty` and updates local component state via `handleUpdateComponent`.
- [ ] In `EstimateResult.tsx`:
  - [ ] Remove any now-unused helper functions or props related to the old blur-save model.

---

### 5. Consistency across the application

- [ ] **Verify Wst% consistency**:
  - After changing Wst% in the Assembly modal and clicking Save:
    - [ ] `AssemblyEditorModal` shows the new value on reopen.
    - [ ] **Materials tab** uses the updated `waste_percent` wherever it is displayed/used.
    - [ ] **Mat+Lab tab** uses the updated Wst% in totals where relevant.
    - [ ] Any markup / proposal calculations that depend on Wst% see the new value (if applicable).
- [ ] **Verify Unit Cost consistency**:
  - Changing Unit Cost in the Assembly modal and clicking Save:
    - [ ] Updates project-wide Unit Cost across all assemblies with that code.
    - [ ] Matches what you see when editing the same code in Materials / Labor / Mat+Lab tabs.
- [ ] **Verify Hgt / OC / Layering consistency**:
  - Edits affect:
    - [ ] The edited assembly’s modal view and detail modal.
    - [ ] Any calculations or takeoff displays that use those overrides (e.g., quantity formulas).

---

### 6. Error handling, UX, and tests

- [ ] **UX on Save**:
  - [ ] Disable the Save button while the PATCH is in flight.
  - [ ] Show a success toast when Save completes.
  - [ ] If PATCH fails, either:
    - Keep local changes and show an error (user can retry), or
    - Revert to last-saved data and show an error. (Decide and document which.)
- [ ] **Logging**:
  - [ ] Replace ad-hoc console logs with a small, scoped debug helper (e.g., `debugAssemblySave`) that can be toggled.
- [ ] **Minimal tests / manual checklist**:
  - [ ] Single change: edit Wst% for one material, Save, reload page, verify all assemblies and reports.
  - [ ] Multiple fields: edit Hgt + OC + Layering + Wst% + Unit Cost, Save once, verify DB JSON and UI.
  - [ ] No-change Save: click Save without edits → no data drift, no errors.

---

### 7. Future (not in this refactor, but noted)

These are **out of scope for this immediate change**, but must be revisited later:

- [ ] Split final_output overrides into granular tables (`project_material_overrides` + assembly-instance overrides) instead of full JSONB blob updates.
- [ ] Add a thin API layer specifically for “update field X on material/assembly Y” to avoid sending the whole `assemblies` blob each time.
- [ ] Add automated tests for `handleSaveAssembly` mapping logic and for `mapFinalOutputToWallAssemblies`.

