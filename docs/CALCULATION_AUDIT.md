# Calculation Audit — PlanckOff Drywall Estimator

> **Purpose:** Single source of truth for every calculation mismatch, override propagation failure, and formula bug in the codebase.
>
> **Last updated:** 2026-03-31 | Branch: testing

---

## Part 1 — How the Application Is Supposed to Work

```
1. IMPORT
   Upload PDF (assembly specs) + Excel (takeoff dimensions)
   → click "Run Pipeline"
   → /api/extract → /api/match → /api/finalize
   → final_outputs table: INSERT new record (replaces old one)

2. MATERIAL LOOKUP — two sources, strict priority
   For every material code in the output:
     1st: project_material_overrides  (per-project changes — always preferred)
     2nd: spec_database               (global — READ ONLY per project, never modified)

3. QUANTITY CALCULATION
   Parsed dimensions × formulas stored in spec_database
   → material quantities
   → labour quantities (via productivity rate)
   Results stored as materialCostingData in final_outputs.data

4. ASSEMBLY EDITOR SAVE (not a pipeline re-run)
   User edits overrides in the Assembly Editor modal → clicks Save
   → PATCH /api/final-output/{id}  (updates existing final_outputs record, no pipeline re-run)
   → upsert into project_material_overrides (for waste %, unit cost)

5. DISPLAY
   ALL tabs must read from the SAME materialCostingData with the SAME overrides applied.
   No tab should re-price or re-quantity from raw sources independently.
```

---

## Part 2 — Active Code Paths Confirmed

### Which path is active per tab

| Tab | Primary source | Fallback (when materialCostingData.length === 0) |
|-----|---------------|------------------------------------------------|
| MaterialsView | `materialCostingData` (pipeline) | `items` prop from `calculateMaterials.ts` |
| LaborView | `materialCostingData` (pipeline) | `items` prop from `calculateMaterials.ts` |
| MatLabView | `materialCostingData` (pipeline) | **No fallback — shows error message** |
| Markups | `materialCostingData` (pipeline) | `markupItems` prop from `calculateMaterials.ts` |
| Proposal/Reports | `materialCostingData` (pipeline) | `calculateMaterials.ts` runs inline |

**Key flag:** `const useCostingData = materialCostingData.length > 0;`
Used in MaterialsView (line 156), LaborView (line 176). Same logic in Markups.

### What `calculateMaterials.ts` is

It is the **fallback-only legacy path**. It runs when the pipeline has not been run for a project yet. Once the pipeline has been run and `materialCostingData` is populated, `calculateMaterials` output is ignored by all tabs — except for one critical exception (see Issue-01 below).

### When "Run Pipeline" executes

Button → `openImportModal()` → `/api/extract` → `/api/match` → `/api/finalize` → **INSERT** new `final_outputs` record → `onImportComplete()` → `setAssemblyDataRefreshTrigger(t + 1)` → page re-fetches and calls `setMaterialCostingData(effectiveCostingData)`.

### When Assembly Editor "Save" executes

Save → `handleSaveAssembly()` → applies overrides locally to `materialCostingDataRef.current` → **PATCH** `/api/final-output/{id}` (updates existing record, does NOT re-run pipeline) → syncs to `project_material_overrides` → updates React state via `syncUiFromCostingData`.

---

## Part 3 — The Core Mismatch: Why Labour Total Differs Between Tabs

### Labour Tab (`LaborView`)
```
Source:  materialCostingData  (with project_material_overrides applied on page load)
Formula: aggregatedItems = group by (itemCode|item|unit), sum qty
         displayItems = apply session-local unitCostOverrides
         displayTotal = Σ (qty × unitCost)
```

### Markups Tab (`Markups.tsx`)
```
Source:  effectiveMarkupItems → filteredItems
Formula: tradeBreakdown[trade].labor += item.cost  for isLabor items
         totalLaborFromTrades = Σ tradeBreakdown[*].labor
```

### Where `effectiveMarkupItems` comes from (the hybrid problem)

```typescript
// Markups.tsx lines 223–247 (confirmed):
if (materialCostingData.length > 0) {
    pipelineItems = flattenMaterialCostingToItems(materialCostingData)
}
// If pipelineItems for a trade category is empty → fall back to markupItems for that category
// RESULT: effectiveMarkupItems can be a MIX of pipeline items and legacy items
```

This means a project that has pipeline data for "Dry Wall" but not for "Framing" will price Dry Wall from `materialCostingData` (with per-project overrides) and Framing from `calculateMaterials` (global DB prices). The Markups labour total is computed from this **mixed dataset**.

The Labour tab uses 100% pipeline data. The Markups tab uses a mix. **They will never match for a project with partial pipeline coverage or any per-project overrides.**

---

## Part 4 — All Confirmed Issues

---

### ISSUE-01 — Markups Hybrid Mode Silently Mixes Pipeline and Legacy Pricing
**Severity: P0 — Critical**

**File:** `src/components/features/reports/Markups.tsx:223–247`

When `materialCostingData` is present but a trade category has zero-cost items in it, Markups falls back to `markupItems` (legacy `calculateMaterials` output) **for that specific category**. The final `effectiveMarkupItems` is a mix of:
- Pipeline items (with `overridePrice = mat.unit_cost` — respects per-project overrides)
- Legacy items (no `overridePrice` — priced from global `priceMap` via `getItemCost`)

**Consequences:**
- Labour tab total and Markups labour total diverge for any project with trade-level partial pipeline coverage
- Per-project unit cost overrides from `project_material_overrides` are silently ignored for the legacy-fallback categories
- The user has no indication this is happening

**Fix:** Remove the per-category hybrid fallback. If `materialCostingData.length > 0`, use pipeline data only. If it is empty, use legacy only. No mixing.

---

### ISSUE-02 — Markups `totalLaborFromTrades` Uses `filteredItems`, Making GC Total Filter-Sensitive
**Severity: P0 — Critical**

**File:** `src/components/features/reports/Markups.tsx:426–434`

```typescript
const totalLaborFromTrades = useMemo(
    () => Object.values(tradeBreakdown).reduce((sum, v) => sum + v.labor, 0),
    [tradeBreakdown],
);
const travelHotelTotal = useMemo(
    () => calcTravelHotel(travelHotelConfig, totalLaborFromTrades).total,
    [travelHotelConfig, totalLaborFromTrades],
);
```

`tradeBreakdown` is built from `filteredItems` (level-filtered view). Applying a floor filter reduces `totalLaborFromTrades` → reduces Travel/Hotel → reduces `gcTotal` → reduces the final bid price. **The bid price changes when a view filter is changed.**

**Fix:** Compute `totalLaborFromTrades` from `markupBaseData.items` (the unfiltered complete list). Filters are view-only and must never affect totals.

---

### ISSUE-03 — `getEffectiveProjectUnitCost` Uses `productivity` as a Price for Non-Labour Materials
**Severity: P0 — Critical**

**File:** `src/lib/utils/projectPricing.ts:22`

```typescript
// Non-labour branch:
return safe(material.productivity) ?? safe(material.matCost) ?? 0;
```

Context: `project_material_overrides` intentionally stores unit cost overrides in the `productivity` JSONB field. This is stored at the DB level and applied correctly via `applyProjectUnitCostOverrides`.

**The bug is downstream:** `getEffectiveProjectUnitCost` — used to build the global `priceMap` — also reads `material.productivity` as a cost fallback. But here `material` is a `MaterialDefinition` from `spec_database`, where `productivity` means "installation speed in SF/hr", not a dollar amount.

**Example:** A framing stud with `productivity = 150` (SF/hr installation rate) will be priced at $150/unit in the `priceMap` instead of its actual `matCost`.

**Fix:** Remove `productivity` from the non-labour branch of `getEffectiveProjectUnitCost`:
```typescript
return safe(material.matCost) ?? 0;
```
The `productivity`-as-unit-cost convention is correct in `projectWasteOverrides.ts` (override layer). It is wrong in `projectPricing.ts` (global pricing layer).

---

### ISSUE-04 — Changing Waste % Updates the Display Field But Stored `quantity` Is Never Recomputed
**Severity: P0 — Critical**

**File:** `src/lib/utils/projectWasteOverrides.ts:19–31`

Assembly Editor Save → PATCH final_outputs → `applyProjectWasteOverrides` updates `waste_percent` on each `MatchedMaterial` record. But `quantity` was baked in at pipeline finalization time with the old waste factor and **is never recalculated**.

All cost calculations use `qty × unit_cost`. After a waste % change:
- `waste_percent` column: updated ✓
- `quantity` column: still the old value ✗
- `totalCost = qty × unit_cost`: computed from stale quantity ✗

The waste override has zero effect on actual cost totals.

**Fix:** After patching `waste_percent`, recompute `quantity = computeQuantityFromExtracted(mat, newWaste)` and write it back to `mat.quantity` and `mat.sec_quantity`.

---

### ISSUE-05 — Ceiling Quantities Have Zero Waste Applied
**Severity: P0 — Critical**

**File:** `src/lib/utils/quantityFromExtracted.ts:44–57`

```typescript
if (u === "SF" || u === "SQFT" || u === "SQF") {
    if (ceilingArea && ceilingArea > 0) return ceilingArea;              // raw — no waste, no layers
    const fallback = totalLength * heightFt * (1 + wastage) * layers;   // walls get waste ✓
```

Every ceiling material (board, tile, insulation) is understated by ~5–10% on every project. The same applies to `sec_quantity` (sheet counts for ceilings).

**Fix:** `return ceilingArea * (1 + wastage) * layers;`

---

### ISSUE-06 — `overrideLaborCost` Means $/unit in Assembly Editor But $/hr in Legacy Path
**Severity: P0 — Critical (affects all projects using default assemblies)*

**Files:**
- `src/lib/utils/calculationUtils.ts:375` — used as `$/unit` install rate ✓
- `src/services/gemini/calculateMaterials.ts:446` — used as hourly rate ✗
- `src/constants/defaultAssemblies.ts` — values are `0.45`, `0.85`, `2.50` (clearly $/unit)

In the Assembly Editor: `laborTotal = quantity × overrideLaborCost` → `100 SF × $0.45 = $45` ✓

In the legacy Proposal path: `laborCost = hours × overrideLaborCost` → `2 hr × 0.45 = $0.90` ✗

Since the legacy path is the fallback when `materialCostingData` is empty (i.e., pipeline not yet run), any project where the user views the Proposal tab before running the pipeline sees near-zero labour costs.

**Fix:** In `calculateMaterials.ts`, when `overrideLaborCost` is set, treat it as a unit install rate:
`laborCost = quantity × comp.overrideLaborCost` (same as `calculationUtils.ts`).

---

### ISSUE-07 — Stud Count +2 End Studs in Legacy Path Only
**Severity: P0 — affects legacy fallback path**

**Files:**
- `src/services/gemini/calculateMaterials.ts:207` — adds `(instances.length * 2)` end studs
- `src/lib/utils/calculationUtils.ts:217` — no end studs (removed by explicit decision)

When viewing the Proposal tab before the pipeline runs (legacy active), stud counts are ~8% higher than what the pipeline will produce. A user comparing the two will see inconsistency.

**Fix:** Remove `+ (instances.length * 2)` from all stud case blocks in `calculateMaterials.ts`.

---

### ISSUE-08 — Escalation Applied to GC Costs in Markup Chain
**Severity: P0 — Critical**

**File:** `src/components/features/reports/Markups.tsx:450`

```typescript
const escalationCost = grossCost * (config.escalation / 100);
// grossCost = netDirectCost + gcTotal  ← escalation incorrectly applied to GC too
```

Escalation covers material and labour price inflation (direct costs only). Applying it to `gcTotal` (staffing, travel, equipment) inflates the bid by `escalation% × gcTotal`.

**Fix:** `const escalationCost = netDirectCost * (config.escalation / 100);`

---

### ISSUE-09 — Proposal Tab and Markups Tab Use Different Markup Formulas with Independent Configs
**Severity: P1 — High**

**Files:** `src/components/features/reports/Reports.tsx:229–238`, `Markups.tsx:450–521`

```
Markups tab formula:  escalation → tax(material only) → burden(labour only) → overhead → profit
Proposal tab formula: tax → overhead → profit   ← missing escalation and laborBurden
```

Both tabs have independent `useState<Config>` initialized to different hardcoded defaults. Changing tax% in Markups does not update Proposal. The user has no way to reconcile the two numbers.

**Fix:** Create `src/lib/utils/markupChain.ts` — single `applyMarkupChain(materialTotal, laborTotal, gcTotal, config)` function. Both tabs call this. Config stored once in project state, not two independent component states.

---

### ISSUE-10 — `floorWiseBreakdown` Uses Unfiltered Items; `tradeBreakdown` Uses Filtered Items
**Severity: P1 — High**

**File:** `src/components/features/reports/Markups.tsx:353–393`

`tradeBreakdown` processes `filteredItems`. `floorWiseBreakdown` processes `markupBaseData.items`. When a level filter is active, the per-trade totals and per-floor totals are computed from different datasets. Summing all floor totals will not equal the trade total on screen.

**Fix:** Both breakdowns must use `markupBaseData.items` (unfiltered). The filter controls which rows are *displayed*, not which items are *summed*.

---

### ISSUE-11 — MatLabView Has Its Own Quantity Function That Ignores Waste and Layers
**Severity: P1 — High**

**File:** `src/components/features/reports/MatLabView.tsx:94–111`

```typescript
// Local stub — no waste, no layers applied:
const getQuantityFromExtracted = (ext, unit) => {
    if (u === 'SF') return ceilingArea > 0 ? ceilingArea : totalLength * heightFt;
};
```

Used as a fallback when `mat.quantity` is null (backward-compat records). MaterialsView uses `computeQuantityFromExtracted` (applies waste + layers). For old records, MatLabView and MaterialsView show different quantities for the same material.

**Fix:** Delete the local stub. Use `computeQuantityFromExtracted` from `@/lib/utils/quantityFromExtracted`.

---

### ISSUE-12 — `sec_quantity` (Sheet Count) Not Recomputed When `overrideQuantity` Is Saved
**Severity: P1 — High**

**File:** `src/lib/utils/assemblyOverrideUtils.ts:197`

```typescript
if (matQty.has(mat.code)) base.quantity = matQty.get(mat.code);
// base.sec_quantity is NOT updated
```

Override 150 SF → 200 SF: Materials tab shows 200 SF ✓, sheet count still shows `150/48 = 3.1` ✗ (should be `200/48 = 4.2`). Ordering sheets from this number is wrong.

**Fix:** After writing `base.quantity`, recompute `base.sec_quantity` using `computeSecQuantityFromExtracted`.

---

### ISSUE-13 — `overrideQuantity` Map Keyed by `materialCode` — Same Code in Multiple Spec Lines Collides
**Severity: P1 — High**

**File:** `src/lib/utils/assemblyOverrideUtils.ts:72`

`matQty.set(comp.materialCode, comp.overrideQuantity)` — if the same material code appears in two spec-line groups within one assembly (e.g., gypsum board on both sides of a wall), the second overwrites the first. Both spec-line groups receive the same override.

**Fix:** Key the map by `componentId` or `materialCode + ':' + specLineIndex`, not just `materialCode`.

---

### ISSUE-14 — Legacy Path Ignores `heightCondition` Slicing on Wall Area
**Severity: P1 — affects legacy fallback path**

**File:** `src/services/gemini/calculateMaterials.ts:87–98`

`getRowDetails` (pipeline) clamps height per component using `heightCondition.min/max`. The legacy path uses `totalWallArea = length × full_height` with no clamping. Components with height restrictions (e.g., a mid-wall blocking that covers only 0–4 ft) are over-quantified in the legacy Proposal path.

**Fix:** Apply the same `heightCondition.min/max` clamping from `getRowDetails` to each instance.

---

### ISSUE-15 — Legacy Path Uses `Math.ceil` on Intermediate Quantities
**Severity: P1 — affects legacy fallback path**

**File:** `src/services/gemini/calculateMaterials.ts` (many lines)

Legacy path applies `Math.ceil` to nearly every quantity. Pipeline returns floats. Aggregated across a project, the Proposal tab (when showing legacy data) is consistently and silently higher than Materials/Labour tabs (which use pipeline data).

**Rule:** Rounding is display-only. Never round intermediate calculation values.

**Fix:** Remove all `Math.ceil` from quantity calculations in `calculateMaterials.ts`.

---

### ISSUE-16 — `applyGlobal` Updates DB But Not In-Memory `AppContext.materials`
**Severity: P1 — High**

**File:** `src/hooks/useFieldOverride.ts:84–106`

When an admin uses "Apply Global" to update a material in `spec_database`, `AppContext.materials` (loaded once at session start) is not refreshed. All formula evaluations and `buildProjectPriceMap` calls for the rest of the session use the stale value.

**Fix:** After a successful global update, invalidate `AppContext.materials` by calling `setMaterials([])`. The existing `useEffect` will re-fetch automatically.

---

### ISSUE-17 — GC Formulas Hardcode 40 Hours/Week
**Severity: P2 — Medium**

**File:** `src/components/features/reports/markups/types.ts:143, 212`

```typescript
return durationWeeks * row.cleaners * row.hourlyRate * 40;       // hardcoded 40
return row.workers * (row.percentTime / 100) * durationWeeks * row.hourlyRate * 40;
```

`ProjectInfo.workingHoursPerWeek` exists and defaults to 40 but is never used in any formula. Non-standard hours (union contracts, shift work) produce wrong GC costs.

**Fix:** Pass `projectInfo.workingHoursPerWeek` into GC formula functions. Replace both `* 40`.

---

### ISSUE-18 — `per = 0` on a Material Handled Inconsistently Across Tabs
**Severity: P2 — Medium**

- `Reports.tsx:204`: `pricing.per || 1` → if `per = 0`, treats as "per 1 unit"
- `MatLabView.tsx:122`: `pricing.per > 0` check → if `per = 0`, returns 0 (cost skipped)

Same input, opposite results in two tabs.

**Fix:** Decide the correct behaviour (likely `|| 1`) and apply it consistently everywhere `pricing.per` is used.

---

### ISSUE-19 — Labour Hours Computed From Display Quantity (Possibly Metric) Against Imperial `productionRate`
**Severity: P2 — Medium**

**File:** `src/lib/utils/calculationUtils.ts:381–384`

`quantity` passed to `manHours = quantity / productionRate` can be in m² (metric display mode). `productionRate` is always stored in SF/HR. Man-hours are 10.76× too low in metric mode.

**Fix:** Always use the raw imperial quantity for hour computation. Convert units at render only.

---

### ISSUE-20 — Sheet Size Always Assumes 4×12 (48 SF) — 4×8 Boards Get Wrong Sheet Count
**Severity: P2 — Medium**

**Files:** `calculateMaterials.ts:234`, `calculationUtils.ts:243`

Both hardcode `/ 48` or `refArea = 48`. The pipeline path (`computeSecQuantityFromExtracted`) correctly handles `4x8` (32 SF) vs `4x12` (48 SF). If the project uses 4×8 boards, sheet counts are understated by 33% in the legacy path and the Assembly Editor.

**Fix:** Detect `4x8` in the material description and use `refArea = 32`.

---

### ISSUE-21 — Duplicate `DEFAULT_WASTE_FACTORS` in `calculateMaterials.ts`
**Severity: P2 — Medium**

Local copy in `calculateMaterials.ts` duplicates `src/constants/wasteFactor.ts`. A future update to the canonical constant won't propagate to the legacy path.

**Fix:** Delete the local copy. Import `getWasteFactor` from `@/constants`.

---

### ISSUE-22 — Insulation Hardcodes `1.05` Waste; `Fixed Qty` Always Produces `2`
**Severity: P2 — Medium**

- `calculateMaterials.ts:339`: `* 1.05` — ignores component-level waste overrides
- `calculateMaterials.ts:395`: `Math.ceil(1 * 1.05) = 2` always

**Fix:** Use `getWaste(comp, 'Insulation')` and `(comp.overrideQuantity ?? effectiveCount) * (1 + getWaste(comp, 'Other'))`.

---

### ISSUE-23 — Default Labour Rate `$65` Hardcoded in 4 Places
**Severity: P2 — Medium**

`calculationUtils.ts:379`, `calculateMaterials.ts:446`, `calculateMaterials.ts:495`, `projectPricing.ts:18`.

**Fix:** `export const DEFAULT_LABOR_RATE = 65` in `src/constants/index.ts`. Import at all four sites.

---

### ISSUE-24 — `GeneralRequirement.total` Is Stale Dead Code
**Severity: P3 — Low**

Updated in `updateGcItem` only for numeric field changes. The `totals` useMemo always computes `i.quantity × i.rate` inline and never reads `.total`. Dead field that will give wrong values if ever read directly.

**Fix:** Remove `total` from `GeneralRequirement`.

---

### ISSUE-25 — `parseLevels` / `sortLevels` Duplicated in 4 Components
**Severity: P3 — Low**

Defined in `LaborView`, `MaterialsView`, `MatLabView`, `Markups`. One copy diverging silently breaks level-filter consistency.

**Fix:** Move to `src/lib/utils/reportFilterState.ts`.

---

### ISSUE-26 — "filters" Label Typo in `GeneralConditionsSection`
**Severity: P3 — Low**

`GeneralConditionsSection.tsx:178` — column labelled `"filters"` should be `"units"`.

---

## Part 5 — Override Propagation Failures

| ID | File | What Goes Wrong |
|----|------|----------------|
| OPF-1 | `assemblyOverrideUtils.ts:197` | Saving `overrideQuantity` writes `quantity` but not `sec_quantity` — sheet count stays stale |
| OPF-2 | `useFieldOverride.ts:84` | `applyGlobal` updates DB but not `AppContext.materials` — whole session priced from old values |
| OPF-3 | `projectWasteOverrides.ts` | Waste % change updates `waste_percent` display field but never recomputes `quantity` |
| OPF-4 | `project/page.tsx:424` | `handleWasteChange` updates `materialCostingData` state but not `overrideMap` — reverts on next page load |

---

## Part 6 — Fix Priority Backlog

### P0 — Fix before anything else (active wrong numbers)

| # | Issue | File | Change |
|---|-------|------|--------|
| P0-1 | Markups hybrid mixes pipeline + legacy pricing | `Markups.tsx:223–247` | No per-category fallback — use pipeline OR legacy, never both |
| P0-2 | Filter changes GC total | `Markups.tsx:426` | `totalLaborFromTrades` from `markupBaseData.items`, not `filteredItems` |
| P0-3 | `productivity` used as price in `priceMap` | `projectPricing.ts:22` | Return `safe(material.matCost) ?? 0` for non-labour |
| P0-4 | Waste % change doesn't recompute quantity | `projectWasteOverrides.ts` | Recompute `quantity` + `sec_quantity` after waste change |
| P0-5 | Ceiling qty has zero waste | `quantityFromExtracted.ts:46` | `ceilingArea * (1 + wastage) * layers` |
| P0-6 | Escalation on GC costs | `Markups.tsx:450` | `netDirectCost * (escalation/100)` only |

### P1 — Cross-tab mismatches

| # | Issue | File | Change |
|---|-------|------|--------|
| P1-1 | Two markup formulas, two configs | `Reports.tsx` + `Markups.tsx` | Create `markupChain.ts`, shared config |
| P1-2 | `sec_quantity` stale after override | `assemblyOverrideUtils.ts:197` | Recompute `sec_quantity` on quantity save |
| P1-3 | Override quantity key collision | `assemblyOverrideUtils.ts:72` | Key by `componentId` not `materialCode` |
| P1-4 | Floor vs trade breakdown diverge | `Markups.tsx:353–393` | Both use `markupBaseData.items` |
| P1-5 | MatLabView local qty stub | `MatLabView.tsx:94–111` | Delete, use `computeQuantityFromExtracted` |
| P1-6 | `applyGlobal` stale session | `useFieldOverride.ts:84` | Invalidate `AppContext.materials` after global update |
| P1-7 | `overrideLaborCost` semantic flip (legacy) | `calculateMaterials.ts:446` | Treat as `$/unit`, not `$/hr` |
| P1-8 | Stud +2 end studs (legacy) | `calculateMaterials.ts:207,214,221` | Remove `+ (instances.length * 2)` |
| P1-9 | Legacy ignores height condition | `calculateMaterials.ts:87–98` | Apply `heightCondition.min/max` |

### P2 — Accuracy and consistency

| # | Change |
|---|--------|
| P2-1 | Remove `Math.ceil` from all intermediate calculations in `calculateMaterials.ts` |
| P2-2 | GC formulas: replace `* 40` with `projectInfo.workingHoursPerWeek` |
| P2-3 | `per = 0` guard: align across all tabs to `|| 1` |
| P2-4 | Labour hours: use imperial quantity, not `displayQuantity` |
| P2-5 | Sheet size: detect `4x8` → use 32 SF, not 48 |
| P2-6 | Delete duplicate `DEFAULT_WASTE_FACTORS` in `calculateMaterials.ts` |
| P2-7 | Insulation: `getWaste(comp, 'Insulation')` instead of `1.05` |
| P2-8 | `Fixed Qty`: actual count × waste instead of `Math.ceil(1.05) = 2` |
| P2-9 | `$65` default: `DEFAULT_LABOR_RATE` constant, import everywhere |

### P3 — Hygiene

| # | Change |
|---|--------|
| P3-1 | Remove `GeneralRequirement.total` dead field |
| P3-2 | Move `parseLevels`/`sortLevels` to `reportFilterState.ts` |
| P3-3 | Fix "filters" typo in `GeneralConditionsSection.tsx:178` |

---

*Last updated: 2026-03-31 | Branch: testing*
