# Assembly Modal — Wastage % & Field Override Save: Current State & Known Issues

## What This Document Is

This is a handoff document describing the **current implementation**, the **root causes** of past bugs, the **partial fixes** already applied, and the **remaining architectural issues** that need a proper solution.

---

## The Feature Being Fixed

In the **Assembly Editor Modal** (`src/components/features/project/AssemblyEditorModal.tsx`), the user can edit per-component fields:

- `Wst%` — Waste percentage (e.g. 10 = 10%)
- `Hgt` — Override height
- Layers, OC spacing, unit cost, quantity, etc.

The requirement is:
- Changes to **`Wst%`** must persist project-wide (same material code → same waste % across ALL assemblies).
- Changes to **`Hgt`**, layers, OC, qty → per-assembly-instance only.
- The **single source of truth** for all these values is the `final_outputs.data` JSONB column in Supabase.
- On reload, data is loaded from `final_outputs` → mapped by `mapFinalOutputToWallAssemblies()` → shown in the modal.

---

## Data Flow (High Level)

```
Supabase final_outputs.data
  └── { assemblies: MaterialCosting[] }
        └── GET /api/assembly-data
              └── page.tsx: loadAssemblyData()
                    ├── setMaterialCostingData(costingDataArray)   ← used for cost calcs
                    └── setAssemblies(mapFinalOutputToWallAssemblies(costingDataArray))
                          └── EstimateResult: initialAssemblies prop
                                └── AssemblyEditorModal: assembly prop
```

When user edits a field → **Save button** → `handleSaveAssembly()` → `PATCH /api/final-output/[id]` → DB updated → `onAssemblySaveComplete()` → reload from DB.

---

## Root Cause of the Original "Revert" Bug

### Bug 1: React 18 deferred rendering (CONFIRMED via logs, FIXED)

**Problem:** When the user edits `Wst%` in the inline table cell and immediately clicks **Save**, the sequence is:

1. `blur` fires on the Wst% input → `updateComp('wasteFactor', 0.2)` → `handleUpdateComponent()` → `setAssemblies(...)` (React **schedules** the update, doesn't commit it yet)
2. React 18 **defers** the re-render (automatic batching in concurrent mode)
3. `click` fires on Save button → `handleSaveAssembly()` runs
4. `handleSaveAssembly` reads `assembliesRef.current` to get the latest assembly
5. **But `assembliesRef.current = assemblies` is set during render** — the render hasn't happened yet!
6. `assembliesRef.current` still has the **OLD** `wasteFactor` (e.g. 0.1 instead of 0.2)
7. `labWaste.set('LAB-HNG-HI', 10)` instead of 20
8. PATCH writes `waste_percent = 10` → reload → revert to 10%

**Confirmed by logs:**
```
labWaste: {LAB-HNG-HI: 10}   ← should be 20
```

**Fix applied** in `EstimateResult.tsx → updateComponent()`:
```typescript
setAssemblies((prev) => {
  const next = prev.map(...);
  assembliesRef.current = next;  // ← update ref INSIDE updater (synchronous, before render)
  return next;
});
```
Now `assembliesRef.current` is always current regardless of React's render schedule.

**This fix also resolves the Height (`Hgt`) not persisting issue** — same stale ref root cause.

---

### Bug 2: Double-PATCH race condition (WAS present, NOW removed)

An earlier implementation had `handleWasteChange` (in `page.tsx`) that fired a full DB PATCH on every blur of the Wst% cell. Combined with the Save button also firing a PATCH, two concurrent writes were racing:

- PATCH #1 (`handleWasteChange` on blur): writes `waste_percent=20` ← correct
- PATCH #2 (`handleSaveAssembly` on Save click): reads stale `assembliesRef` → writes `waste_percent=10` ← wrong
- PATCH #2 was the LAST write → DB had 10% → reload showed 10% (revert)

**Fix applied:** `handleWasteChange` no longer sends a DB PATCH. It only calls `setMaterialCostingData()` to update local cost calculations for immediate UI feedback. The DB is only written by the Save button.

---

## Current Implementation (as of now)

### Files involved

| File | Role |
|------|------|
| `src/app/(protected)/project/page.tsx` | Holds `materialCostingData` state, `handleWasteChange` (local update only), `handleUnitCostChange` (DB PATCH), `loadAssemblyData` |
| `src/components/features/project/EstimateResult.tsx` | Holds local `assemblies` state, `assembliesRef`, `updateComponent` (with immediate ref update), `handleSaveAssembly` (Save button handler) |
| `src/components/features/project/AssemblyEditorModal.tsx` | Inline table editing, `updateComp` wrapper, `handleSaveClick` |
| `src/app/api/final-output/[id]/route.ts` | PATCH endpoint — writes full `assemblies` array to `final_outputs.data` |
| `src/lib/utils/assemblyJsonMapper.ts` | `mapFinalOutputToWallAssemblies()` — reads `waste_percent` from DB, converts to `wasteFactor` |

### Current flow when user edits Wst%

```
User types "20" in Wst% cell
  → blur fires
  → NumberInput.commit() → onChange(0.2)   [scale=0.01: display 20 ÷ 0.01 = 0.2 stored]
  → updateComp('wasteFactor', 0.2)
      ├── setIsDirty(true)
      ├── handleUpdateComponent()
      │     └── updateComponent() in EstimateResult
      │           └── setAssemblies((prev) => {
      │                 const next = ...;
      │                 assembliesRef.current = next;  ← IMMEDIATE update (React 18 fix)
      │                 return next;
      │               })
      └── onWasteChange('LAB-HNG-HI', 20, true)
            └── handleWasteChange() in page.tsx
                  └── setMaterialCostingData(updatedData)
                        ↑ NO DB write — only updates local state for cost recalculation
```

```
User clicks Save button
  → handleSaveClick()
  → handleSaveAssembly(assembly)
      ├── reads assembliesRef.current (always up-to-date)
      ├── builds matWaste / labWaste / matHeight maps
      ├── maps materialCostingData with overrides applied
      │     ├── waste_percent applied project-wide (all 70 assemblies)
      │     └── height_ft_override applied to edited assembly only
      ├── PATCH /api/final-output/[id] with full assemblies array
      └── onAssemblySaveComplete() → setAssemblyDataRefreshTrigger++
            └── loadAssemblyData() → reload from DB → setAssemblies(initialAssemblies)
```

---

## Known Remaining Issues / Why Major Changes Are Needed

### Issue 1: Every Save rewrites ALL 70 assemblies

`handleSaveAssembly` sends the ENTIRE `materialCostingData` array (70+ assemblies) to the DB on every Save. This is:
- **Slow** — large payload (the JSON is ~20k lines)
- **Risky** — if `materialCostingData` is stale/wrong for any reason, it overwrites good data
- **Fragile** — concurrent edits from multiple sessions would overwrite each other

### Issue 2: `materialCostingData` in `handleSaveAssembly` can be stale

`handleSaveAssembly` is a `useCallback` that captures `materialCostingData` from its closure. `materialCostingData` is only updated by:
1. `loadAssemblyData()` (reload from DB) — after Save + reload
2. `handleWasteChange()` (local state update on Wst% blur)
3. `handleUnitCostChange()` (after DB PATCH for unit cost)

It does NOT include height overrides or other per-assembly field changes (those live only in `assembliesRef.current` / local `assemblies` state). If `materialCostingData` is stale, the Save writes the stale base data before applying the `assembliesRef.current` overrides — which should be fine since overrides win, but it's architecturally fragile.

### Issue 3: `onAssemblySaveComplete()` triggers a full reload every Save

Every Save button click reloads ALL assembly data from the DB. This:
- Resets ALL local `assemblies` state via the assembly-sync `useEffect`
- Closes any pending local edits in other modals
- Creates a visible flash/reload in the UI

### Issue 4: `handleWasteChange` uses stale `materialCostingData`

`handleWasteChange` in `page.tsx` reads `materialCostingData` from its closure and updates only `waste_percent`. If `materialCostingData` was already modified by a previous `handleWasteChange` call but the state hasn't committed yet (React 18 batching), sequential waste % changes on different fields could conflict.

### Issue 5: The "project-wide" waste % logic is fragile

When the user changes waste % for `LAB-HNG-HI` in assembly `P1@15`, `handleSaveAssembly` applies it to **all 70 assemblies** that contain `LAB-HNG-HI`. This relies on:
1. `matWaste`/`labWaste` being populated from `assemblyToSave.components`
2. The material code being present in the edited assembly

If an assembly has a material that's NOT in the edited assembly, its waste % comes from `materialCostingData` (which might be stale or have `null`).

---

## The Ideal Architecture (To Implement)

Instead of saving/loading the full `materialCostingData` array as a monolithic JSONB blob, the overrides should be stored separately:

```
project_material_overrides table (already partially exists)
  ├── project_id
  ├── material_code
  ├── waste_percent          ← project-wide
  ├── unit_cost              ← project-wide
  └── ...

assembly_instance_overrides table (new — per assembly instance)
  ├── final_output_id
  ├── assembly_id + height_ft  ← composite key for the assembly instance
  ├── material_code
  ├── height_ft_override     ← per-instance
  ├── quantity_override      ← per-instance
  ├── layers_override        ← per-instance
  └── oc_spacing_override    ← per-instance
```

This would:
- Allow granular saves (only changed fields)
- Avoid the full-blob overwrite problem
- Support concurrent edits
- Make the `project-wide` vs `per-instance` distinction explicit at the DB level

---

## Files to Focus On for Major Refactor

1. `src/app/(protected)/project/page.tsx` — state management, load/save orchestration
2. `src/components/features/project/EstimateResult.tsx` — `handleSaveAssembly`, `updateComponent`, `assembliesRef`
3. `src/components/features/project/AssemblyEditorModal.tsx` — `updateComp`, `handleSaveClick`
4. `src/lib/utils/assemblyJsonMapper.ts` — `mapFinalOutputToWallAssemblies()` (reads waste%, height overrides from DB JSON)
5. `src/app/api/final-output/[id]/route.ts` — PATCH endpoint
6. `src/lib/db/pipelineOutputs.ts` — `updateFinalOutput()`
7. `supabase/migrations/` — new tables for granular overrides

---

## Quick Reference: Key Constants / Conversions

| UI display | Stored value | Conversion |
|-----------|-------------|-----------|
| `Wst% = 10` | `waste_percent = 10` in DB | `wasteFactor = 10 / 100 = 0.1` in component state |
| `Wst% = 10` | `wasteFactor = 0.1` in component | `NumberInput scale={0.01}`: display = `0.1 / 0.01 = 10` |
| Default waste (Finishing/SC-) | `waste_percent = null` in DB | falls back to `getWasteFactor('Finishing') = 0.05` → displays as `5` |
| Default waste (Drywall/DW-) | `waste_percent = null` in DB | falls back to `getWasteFactor('Drywall') = 0.1` → displays as `10` |
| Default waste (Labor/LAB-) | `waste_percent = null` in DB | falls back to `0` → displays as `0` (or stored value if previously set) |
