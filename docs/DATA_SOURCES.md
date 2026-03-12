# Data Sources — Where Every Value Comes From

This document tracks the source of truth for every value displayed or stored in the application.
Update this file whenever a data source or flow changes.

---

## 1. Global Materials Database (`spec_database`)

**Table:** `spec_database` (Supabase)
**Repository:** `src/lib/db/materials.ts`
**Loaded via:** `GET /api/materials` → `getAllMaterials()`
**Stored in:** `AppContext.materials` (React context, available app-wide via `useApp()`)
**Loaded when:** App boots / Materials page loads / project page mounts

### Fields and where each is used

| DB Column | TS Field | Used In | Purpose |
|-----------|----------|---------|---------|
| `code` | `code` | Assembly modal, formula evaluator, material matching | Unique identifier to look up a material |
| `description` | `description` | Assembly modal (Item column), Materials page | Display name |
| `mat_cost` | `matCost` | Materials page (Mat. Cost column) | Raw material purchase cost |
| `unit_cost` | `unitCost` | Materials page (Unit Cost column in Spec DB tab) | Cost per unit from spec DB |
| `productivity` | `productivity` | Assembly modal (Unit Cost column fallback) | Production rate per unit — used as fallback ONLY if final_output has no stored unit_cost |
| `mou_wall_sec` | `mouWallSec` | Assembly modal (Se.Qty UOM column, wall assemblies) | Secondary unit of measure for walls |
| `mou_ceil_sec` | `mouCeilSec` | Assembly modal (Se.Qty UOM column, ceiling assemblies) | Secondary unit of measure for ceilings |
| `type` | `type` | Material filters, category inference | Board / Framing / Fastener / etc. |
| `category` | `category` | Waste factor lookup | Used to assign default waste % |

**IMPORTANT:** This table is the global spec database shared across all projects.
Editing unit costs on the Materials tab or Labor tab in a project does NOT touch this table.
Project-specific overrides live in `final_outputs`.

---

## 2. Final Output (`final_outputs`)

**Table:** `final_outputs` (Supabase)
**Repository:** `src/lib/db/pipelineOutputs.ts` — `saveFinalOutput`, `getLatestFinalOutput`
**Loaded via:** `GET /api/assembly-data` → `getLatestFinalOutput(projectId)`
**Stored in:** `materialCostingData` state in `src/app/(protected)/project/page.tsx`
**Also written to:** `data/output/final_output/final_output-{timestamp}.json` (local, for debugging)
**Loaded when:** Project page mounts, after pipeline runs

### JSON Structure

```
final_outputs.data = {
  assemblies: [
    {
      assembly_id: "P1",
      height_ft: 15,
      total_length: 68,
      level: "L1, L2",
      project_country: "CA",
      project_location: "CAN",
      project_province: "AB",
      materials_costing: [
        {
          extracted_material: { raw_text, total_length, height_ft, spacing, layers, type },
          matched_materials: [
            {
              code: "DW-58-8-X",
              description: "5/8\" Type X Fire Rated Board 4x8",
              unit: "SF",
              unit_cost: 18500,       ← stored value (SF/LF × 1000 for precision)
              quantity: 1122.0,       ← pre-computed, stored at finalize time
              sec_quantity: 35.06,
              sec_unit: "EA",
              waste_percent: 10,
              section: "09 29 00"
            }
          ],
          matched_labor: [
            {
              code: "LAB-HNG-STD",
              description: "Hang Drywall (Walls < 12ft)",
              unit: "SF",
              unit_cost: 0.06,        ← stored as-is (no × 1000 for labor)
              quantity: 816.0,
              height_ft: 12,
              height_category: "standard",
              section: "09 29 00"
            }
          ]
        }
      ]
    }
  ]
}
```

### Fields and where each is used

| Field | Used In | Source at Finalize Time |
|-------|---------|------------------------|
| `assembly_id` | Assembly cards, modal title, takeoff lookup | Takeoff Excel (wall_type column) |
| `height_ft` | Assembly modal (Hgt column), labor height selection | Takeoff Excel (height column) |
| `total_length` | Assembly modal (Global Parameters), formula Length variable | Takeoff Excel (length/LF column) |
| `level` | Assembly cards (level badge), takeoff schedule view | Takeoff Excel (level column), enriched in `GET /api/assembly-data` |
| `project_country` | Reports (region display) | `projects.country` at finalize time |
| `project_location` | Labor rate selection (US vs CAN vs OTHER) | Derived from `projects.country` at finalize time |
| `project_province` | Reports (province display) | `projects.province` at finalize time |
| `matched_materials[].unit_cost` | **Materials tab**, **Mat+Lab tab**, **Assembly modal (Unit Cost column)** | `mergeTakeoffWithMaterialMatch` or AI finalize |
| `matched_materials[].quantity` | Materials tab (Qty column), Assembly modal (Qty column) | Pre-computed at finalize, stored as single source of truth |
| `matched_materials[].sec_quantity` | Materials tab (Se.Qty column) | Pre-computed at finalize |
| `matched_labor[].unit_cost` | **Labor tab**, **Mat+Lab tab** | `mergeTakeoffWithMaterialMatch` or AI finalize |
| `matched_labor[].quantity` | Labor tab (Qty column) | Pre-computed at finalize |

### Unit cost storage convention

- **Materials and Labor:** `unit_cost` is stored as the display value (e.g. $1.50/SF stored as `1.5`).
- All report tabs (Materials, Mat+Lab, Labor) read `unit_cost` directly from `final_output` — no divisor.

**Critical:** The Mat+Lab tab (`MatLabView.tsx`) must use `final_output.matched_materials[].unit_cost` (and `matched_labor[].unit_cost`) as the source of truth. It must NOT use `priceMap` (from spec_database) when `final_output` has a value — otherwise manual edits to the JSON or via the UI would not appear.

### When unit costs are edited

Editing unit cost in the **Materials tab** or **Labor tab**:
1. Calls `handleUnitCostChange(code, newDisplayCost, type, unit)` in `page.tsx`
2. Updates `materialCostingData` state in memory (with stored value = display × divisor)
3. Updates `assemblies` state — sets `overrideMatCost = newDisplayCost` on matching components (so Assembly modal reflects the change immediately)
4. PATCHes `PATCH /api/final-output/[id]` → updates `final_outputs` record in Supabase + rewrites local JSON file
5. Does NOT touch `spec_database`

---

## 3. Assembly Extraction (`assembly_extractions`)

**Table:** `assembly_extractions` (Supabase)
**Repository:** `src/lib/db/assemblyData.ts` — `getLatestAssemblyExtraction`
**Loaded via:** `GET /api/assembly-data` → `assemblyData` in response
**Stored in:** `assemblyData` parsed into `assemblies` state via `mapFinalOutputToWallAssemblies()`
**Loaded when:** Project page mounts

### What it contains

AI-extracted assembly structure from the PDF spec: assembly names, section codes, list of materials and labor items per assembly. This is the raw AI output before material matching.

Used as the structural backbone for building `WallAssembly[]` when no `final_output` exists yet.
When a `final_output` exists, it takes precedence and is used directly.

---

## 4. Material Matches (`material_matches`)

**Table:** `material_matches` (Supabase)
**Repository:** `src/lib/db/assemblyData.ts` — `getLatestMaterialMatch`
**Loaded via:** `GET /api/assembly-data` (fallback only) or `POST /api/finalize` (as input)
**Used when:** No `final_output` exists yet (pipeline ran match step but not finalize)

### What it contains

The output of the AI material matching step: each extracted material name mapped to a matching `code` from `spec_database`, with an initial `unit_cost` pulled from the DB at match time.

Once finalize runs, `final_outputs` becomes the source of truth and `material_matches` is only used as input to the finalize step.

---

## 5. Takeoff Data (`takeoff_outputs`)

**Table:** `takeoff_outputs` (Supabase)
**Repository:** `src/lib/db/pipelineOutputs.ts` — `getLatestTakeoffOutput`, `getTakeoffOutputById`
**Loaded via:** `GET /api/assembly-data` → linked via `final_outputs.takeoff_output_id` → `rawTakeoffRows`
**Stored in:** `rawTakeoffRows` → passed to `TakeoffScheduleView` and formula evaluator
**Loaded when:** Project page mounts (alongside final output)

### What it contains

Each row is one wall segment from the Excel takeoff sheet:

| Field | Description |
|-------|-------------|
| `wall_type` | Assembly ID (e.g. "P1") |
| `height` | Wall height in feet |
| `length` | Wall length in LF |
| `level` | Floor/level label (e.g. "L1") |
| `area` | Area in SF (computed from height × length) |

### Where takeoff data is used

| Consumer | What it uses |
|----------|-------------|
| `TakeoffScheduleView` | Full row list — wall_type, height, length, level |
| `mergeTakeoffWithMaterialMatch` (finalize) | Groups by wall_type+height, sums total_length, assigns height_ft per assembly |
| Formula evaluator (`formulaEvaluator.ts`) | `Length` variable = total_length from the matching assembly's takeoff rows |
| `GET /api/assembly-data` | `level` enrichment — fills missing level on final_output assemblies |

---

## 6. Project Record (`projects`)

**Table:** `projects` (Supabase)
**Repository:** `src/lib/db/project.ts`
**Loaded via:** `GET /api/projects/[id]` or inside `GET /api/assembly-data`
**Used when:** Finalize runs, and when `GET /api/assembly-data` enriches assemblies

### Fields that affect output

| Field | Effect |
|-------|--------|
| `country` | Determines `project_location` classifier: `"USA"` → `"US"`, `"CA"` → `"CAN"`, other → `"OTHER"` |
| `province` | Stored as `project_province` on each assembly — used in Reports region display |

These are stamped onto every assembly in `final_outputs` at finalize time and re-enriched on every `GET /api/assembly-data` call.

---

## 7. Constants (Code — Not DB)

**Source:** `src/constants/wasteFactor.ts` (default) → overridden by `final_outputs.matched_materials[].waste_percent`
**Used in:** `mapFinalOutputToWallAssemblies()` when building `WallAssembly[]`

| Constant | Value | Used For |
|----------|-------|---------|
| `DEFAULT_WASTE_FACTORS` | Per-category map (e.g. Board: 0.10, Framing: 0.05) | Fallback `wasteFactor` when `waste_percent` is not set in `final_output` |

Waste factor is first read from `final_output.matched_materials[].waste_percent` (stored in DB). If not present, it falls back to the per-category constant. Once the user sets a waste% via the Assembly modal, it is saved to `final_outputs` and becomes the project-level source of truth — the constant is no longer used for that material.

### When waste percent is edited

Editing waste% in the **Assembly Editor Modal** (inline `Wst%` cell or Component Details):
1. `onWasteChange(code, wastePercent, isLabor)` fires immediately on blur (same event as unit cost)
2. Updates `materialCostingData` state in `page.tsx` for ALL assemblies with that code (project-wide)
3. PATCHes `PATCH /api/final-output/[id]` → persists `waste_percent` to `final_outputs` in Supabase
4. Local `assemblies` state in `EstimateResult` is updated by `updateComp` (existing behaviour — instant UI feedback)
5. The Assembly modal **Save** button also writes waste% project-wide as a safety net (handles Component Details saves)

---

## 8. Assembly Modal — Where Each Column's Value Comes From

The Assembly Editor Modal (`AssemblyEditorModal.tsx`) displays a table of components. Here is where each column reads its value:

| Column | Source | Notes |
|--------|--------|-------|
| Code | `comp.materialCode` | From `final_output.matched_materials[].code` |
| Item / Description | `comp.materialName` | From `final_output.matched_materials[].description` |
| Sect | `comp.sectionCode` | From `final_output.matched_materials[].section` |
| Hgt | `comp.overrideHeight` | From `final_output.height_ft` |
| OC | `comp.ocSpacing` | Derived from `extracted_material.spacing` at finalize |
| Layering | `comp.overrideLayers` | From `extracted_material.layers` at finalize |
| Wst% | `comp.wasteFactor` | From `final_output.waste_percent` (project-specific); falls back to `constants/wasteFactor.ts` when not set. **Editable inline or in Component Details — saves immediately project-wide to `final_output` (same pattern as Unit Cost).** |
| Qty | Formula result or `comp.overrideQuantity` | Formula uses `AppContext.materials` + `final_output.total_length` as Length variable. **Qty override editable — saved to `final_output` via Save button.** |
| UOM | `mat?.mouWall` or `mat?.mouCeil` | From `spec_database` (or `project_material_overrides` if overridden). Inline editable — Local/Global dialog on change. |
| Se.Qty | Computed by formula evaluator | Uses `spec_database.mou_wall_sec` / `mou_ceil_sec` (or project override) |
| UOM (Se.Qty) | `mat?.mouWallSec` or `mat?.mouCeilSec` | From `spec_database` (or `project_material_overrides` if overridden). Inline editable — Local/Global dialog on change. |
| **Unit Cost** | `comp.overrideMatCost` | Set from `final_output.matched_materials[].unit_cost / divisor` on load. **Editable inline — saved to `final_output` via Save button (Assembly modal) or Materials/Labor tabs.** |
| Total Cost | `Unit Cost × Qty` | Computed in modal |

### Assembly Modal Save Button

When any field is changed in the Assembly Editor Modal, a **Save** button appears in the bottom bar.

Clicking **Save** calls `handleSaveAssembly` (in `EstimateResult.tsx`):
1. Reads the current `WallAssembly` state (with all pending changes)
2. Maps three component fields back into `materialCostingData`:
   - `comp.overrideMatCost` → `matched_materials[].unit_cost` / `matched_labor[].unit_cost`
   - `comp.overrideQuantity` → `matched_materials[].quantity`
   - `comp.wasteFactor × 100` → `matched_materials[].waste_percent`
3. PATCHes `PATCH /api/final-output/[id]` with the updated data → persists to `final_outputs` in Supabase

**Note:** Formula overrides (Qty formula, Se.Qty formula) are saved immediately via the Local/Global confirm dialog when set — they go to `project_material_overrides` (local) or `spec_database` (global). They are NOT saved via the Save button.

**Note:** UOM (mouWall / mouCeil / mouWallSec / mouCeilSec) edits trigger the Local/Global confirm dialog immediately on blur — they go to `project_material_overrides` (local) or `spec_database` (global). They are NOT saved via the Save button.

---

## 9. Materials Tab — Column Sources

The Materials tab in Reports (`MaterialsView.tsx`) aggregates across all assemblies.

| Column | Source | Notes |
|--------|--------|-------|
| Code | `matched_materials[].code` | From `final_output` |
| Item | `matched_materials[].description` | From `final_output` |
| Section | `matched_materials[].section` | From `final_output` |
| Qty | `matched_materials[].quantity` | Stored at finalize; summed across assemblies |
| Unit | `matched_materials[].unit` | From `final_output` |
| Se.Qty | `matched_materials[].sec_quantity` | Stored at finalize; summed across assemblies |
| **Unit Cost** | `matched_materials[].unit_cost` | From `final_output`. Editable; saves back to `final_output` via PATCH. Does NOT touch `spec_database`. |
| Total Cost | `Qty × Unit Cost` | Computed in `aggregateMaterialsFromCosting` |

---

## 10. Mat+Lab Tab — Column Sources

The Mat+Lab tab (`MatLabView.tsx`) groups materials with their associated labor by section. **Unit Cost must come from `final_output`** (project-specific), not from `priceMap`/spec_database. If `priceMap` were used first, manual edits to `final_output` would not appear.

| Column | Source | Notes |
|--------|--------|-------|
| Code | `matched_materials[].code` / `matched_labor[].code` | From `final_output` |
| Item | `matched_materials[].description` / `matched_labor[].description` | From `final_output` |
| Section | `matched_materials[].section` / `matched_labor[].section` | From `final_output` |
| Qty | `matched_materials[].quantity` / `matched_labor[].quantity` | From `final_output` |
| Unit | `matched_materials[].unit` / `matched_labor[].unit` | From `final_output` |
| **Unit Cost** | `matched_materials[].unit_cost` / `matched_labor[].unit_cost` | From `final_output`. Fallback to `priceMap` (spec_database) only when `unit_cost` is null. |
| Total Cost | `Qty × Unit Cost` | Computed in `MatLabView` |

---

## 11. Labor Tab — Column Sources

The Labor tab (`LaborView.tsx`) aggregates labor from all assemblies.

| Column | Source | Notes |
|--------|--------|-------|
| Cost Code | `matched_labor[].section` | From `final_output` |
| Item | `matched_labor[].description` | From `final_output` |
| Qty | `matched_labor[].quantity` | Stored at finalize; summed across assemblies |
| Unit | `matched_labor[].unit` | From `final_output` |
| **Unit Cost** | `matched_labor[].unit_cost` | From `final_output`. Editable; saves back to `final_output` via PATCH. Does NOT touch `spec_database`. |
| Total Cost | `Qty × Unit Cost` | Computed in `LaborView` |

---

## 12. Project Material Overrides (`project_material_overrides`)

**Table:** `project_material_overrides` (Supabase)
**Repository:** `src/app/api/projects/[id]/material-overrides/route.ts` (direct, no lib/db layer yet)
**Loaded via:** `GET /api/projects/[id]/material-overrides` → `overrideMap` in `page.tsx`
**Stored in:** `overrideMap` state (`Record<materialCode, Partial<MaterialDefinition>>`) in `page.tsx`
**Loaded when:** Project page mounts

### Purpose

Stores project-specific overrides for fields that normally come from `spec_database`.
When a material field is overridden for a project, `resolveProjectMaterials()` merges the override on top of the global spec, so all formula evaluations and UOM lookups use the project-specific value.

### Schema

```
project_material_overrides
  project_id   UUID    (FK → projects.id)
  material_code TEXT   (FK → spec_database.code)
  overrides    JSONB   (field→value map, e.g. { "mouWall": "EA", "formulaQty": "Length * 2" })
  UNIQUE (project_id, material_code)
```

### Which fields can be overridden

| Field | Override Trigger | UI Location |
|-------|-----------------|-------------|
| `formulaQty` | Formula Edit Modal → "This project only" | Assembly modal Qty column → edit formula icon |
| `formulaSecQty` | Formula Edit Modal → "This project only" | Assembly modal Se.Qty column → edit formula icon |
| `formulaCeilQty` | Formula Edit Modal → "This project only" | Assembly modal Qty column (ceiling) |
| `formulaCeilSecQty` | Formula Edit Modal → "This project only" | Assembly modal Se.Qty column (ceiling) |
| `mouWall` | UOM cell → blur → "This project only" | Assembly modal UOM column (wall) |
| `mouCeil` | UOM cell → blur → "This project only" | Assembly modal UOM column (ceiling) |
| `mouWallSec` | UOM (Se.Qty) cell → blur → "This project only" | Assembly modal UOM (Se.Qty) column (wall) |
| `mouCeilSec` | UOM (Se.Qty) cell → blur → "This project only" | Assembly modal UOM (Se.Qty) column (ceiling) |

### Orange dot indicator

When a field has a project-level override, an orange dot (●) appears next to that cell in the Assembly modal. The dot is clickable and reverts the override by calling `DELETE /api/projects/[id]/material-overrides` for that specific field.

### Resolved view

`resolveProjectMaterials(globals, overrideMap)` in `src/lib/utils/resolveProjectMaterial.ts` merges overrides on top of global materials. The result (`resolvedMaterials`) is what every formula, cost calculation, and UOM display uses.

---

## Pipeline Flow Summary

```
Excel Upload
    ↓
POST /api/parse-takeoff
    → saves to: takeoff_outputs (Supabase)

PDF Upload
    ↓
POST /api/process-pipeline   (extract + match steps)
    → reads:  spec_database (material codes + costs)
    → saves to: assembly_extractions, material_matches (Supabase)

POST /api/finalize
    → reads:  material_matches (latest for project)
    → reads:  takeoff_outputs (latest for project)
    → reads:  spec_database (for enrichFinalOutputWithQuantities)
    → reads:  projects (for country/province)
    → writes: final_outputs (Supabase) + data/output/final_output/*.json (local)

GET /api/assembly-data   (project page load)
    → reads:  final_outputs       → materialCostingData state
    → reads:  assembly_extractions → assemblyData → assemblies state
    → reads:  takeoff_outputs      → rawTakeoffRows state
    → reads:  projects             → enriches project_location on assemblies

PATCH /api/final-output/[id]   (unit cost edit OR Assembly modal Save button)
    → writes: final_outputs (Supabase) + local JSON file
    → does NOT touch: spec_database

PATCH /api/projects/[id]/material-overrides   (formula/UOM local override)
    → writes: project_material_overrides (Supabase) — JSONB merge for that material_code
    → does NOT touch: spec_database or final_outputs

DELETE /api/projects/[id]/material-overrides  (revert to DB value — orange dot button)
    → removes specific field from project_material_overrides JSONB for that material_code

PATCH /api/materials/[code]   (formula/UOM global save)
    → writes: spec_database — affects all projects immediately
    → does NOT touch: project_material_overrides or final_outputs
```

---

## Quick Reference: "Which table owns this value?"

| Value | Owner Table | Editable in UI? |
|-------|------------|-----------------|
| Material code, description, type, category | `spec_database` | Yes (Spec DB page) |
| Material productivity (global rate) | `spec_database` | Yes (Spec DB page) |
| Material mat_cost | `spec_database` | Yes (Spec DB page) |
| Project-specific material unit_cost | `final_outputs` | Yes (Materials tab, Mat+Lab tab, or Assembly modal Save button) |
| Project-specific labor unit_cost | `final_outputs` | Yes (Labor tab, Mat+Lab tab, or Assembly modal Save button) |
| Project-specific quantity override | `final_outputs` | Yes (Assembly modal Component Details → Save button) |
| Project-specific waste factor | `final_outputs` | Yes (Assembly modal inline Wst% cell or Component Details — saves immediately project-wide on blur, same as unit cost) |
| Quantities (Qty, Se.Qty) at finalize | `final_outputs` | No (computed at finalize; overridable per-component) |
| Wall height, total length | `final_outputs` (from takeoff) | No |
| Level labels | `takeoff_outputs` | No |
| Wall type / assembly ID | `takeoff_outputs` | No |
| Country / province | `projects` | Yes (project settings) |
| Waste factor default | Code constant (`wasteFactor.ts`) | No (code change required) |
| Formula overrides (project-specific) | `project_material_overrides` | Yes (Formula Edit Modal → Local) |
| UOM overrides (project-specific) | `project_material_overrides` | Yes (Assembly modal UOM inline edit → Local) |
| Formula / UOM (all projects) | `spec_database` | Yes (Formula Edit Modal → Global / UOM edit → Global) |
