# Calculation Rules — Single Source of Truth, Formulas, Aggregation

Consult this file for: **any task that touches a number that feeds into a cost, total, quantity, markup, or project summary**. This includes:
- Labour costs, material costs, assembly quantities
- GC / General Requirements totals
- Markup chain (escalation, tax, burden, overhead, profit)
- Any value that appears in more than one tab or component
- Any `useMemo` that sums, multiplies, or divides cost data

This rule file exists because **calculation mismatches are the most critical bug class in this application**. A cent of difference between the Labour tab and the Markups tab is a bug. Treat it as one.

---

## 0. The Cardinal Law

> **Every calculated value has exactly ONE canonical function that computes it. All views read that function's output — they never re-implement the formula.**

If you find the same formula in two files, that is a bug, not a coincidence. Fix it before adding anything new.

---

## 1. The Canonical Calculation Architecture

Data flows in ONE direction only:

```
DB / AI pipeline output (final_output JSON)
  │
  ▼
src/lib/utils/projectCosting.ts          ← THE single aggregation layer
  │  aggregateProjectCosts(materialCostingData, priceMap)
  │  Returns: ProjectCosts (see shape below)
  │
  ▼
Parent component (e.g. Reports.tsx or a shared context)
  │  Computes ProjectCosts ONCE, stores in useMemo
  │
  ▼
All child tabs receive ProjectCosts as a prop
  │  Labour tab, Materials tab, Markups tab — ALL read the SAME object
  │  NONE of them re-aggregate from raw data
  ▼
Display (format & render only — zero arithmetic here)
```

### The `ProjectCosts` shape — canonical, never deviate from this

```ts
// src/lib/utils/projectCosting.ts

interface TradeCosts {
  material: number;  // sum of all material unit_cost * quantity for this trade
  labor: number;     // sum of all labor unit_cost * quantity for this trade
}

interface CostLineItem {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  isLabor: boolean;
  trade: string;        // normalized trade name (Interior Walls, Ceiling, etc.)
  area: string;         // level / floor
  assemblyId: string;
  section: string;      // cost code section
}

interface ProjectCosts {
  totalMaterial: number;         // sum of all material line item costs
  totalLabor: number;            // sum of all labor line item costs
  netDirectCost: number;         // totalMaterial + totalLabor
  byTrade: Record<string, TradeCosts>;  // breakdown by trade
  lineItems: CostLineItem[];     // flat list — every component & tab reads THIS
}
```

**Rules:**
- `aggregateProjectCosts()` is a **pure function** — no side effects, no React, no API calls.
- It is the ONLY place where `materialCostingData` is traversed to produce cost totals.
- Every report tab that needs a total reads it from `ProjectCosts` — it does not re-traverse `materialCostingData`.

---

## 2. Where Each Calculation Lives

| Value | Canonical Location | What is FORBIDDEN |
|-------|-------------------|-------------------|
| `totalMaterial` | `aggregateProjectCosts()` in `src/lib/utils/projectCosting.ts` | Re-summing in Reports.tsx, MatLabView, LaborView, or Markups |
| `totalLabor` | `aggregateProjectCosts()` in `src/lib/utils/projectCosting.ts` | Re-summing in any component or separate useMemo that re-reads raw data |
| `byTrade` breakdown | `aggregateProjectCosts()` | Computing per-trade totals inline in any component |
| `lineItems[]` | `aggregateProjectCosts()` | Building a flat item list anywhere else |
| GC total (staffing + conditions + travel) | `Markups.tsx` useMemo, using imported `calc*` functions from `markups/types.ts` | GC math anywhere outside `Markups.tsx` |
| Markup chain (escalation → tax → burden → overhead → profit → finalTotal) | `src/lib/utils/markupChain.ts` — `applyMarkupChain(base, config)` | Inline markup math in `Markups.tsx` JSX or anywhere else |
| Per-row GC formula (staffing, conditions, travel) | `markups/types.ts` `calc*` functions | Inline in JSX or component body |
| Assembly quantity | `src/lib/utils/formulaEvaluator.ts` → `evaluateFormula()` | Re-implementing the formula in the component or in the AI pipeline differently |
| Waste-adjusted quantity | `resolveProjectMaterial.ts` | Any `* (1 + wasteFactor)` expression outside this file |

---

## 3. Markup Chain — The Only Correct Formula Order

The markup chain must always be applied in **exactly this order**. Never change the order:

```
netDirectCost = totalMaterial + totalLabor
grossCost     = netDirectCost + gcTotal

escalationCost  = grossCost     × (escalation% / 100)
taxCost         = totalMaterial × (tax% / 100)           ← tax on MATERIAL only
burdenCost      = totalLabor    × (laborBurden% / 100)   ← burden on LABOR only

subTotalWithTaxes = grossCost + escalationCost + taxCost + burdenCost

overheadCost = subTotalWithTaxes × (overhead% / 100)
profitBasis  = subTotalWithTaxes + overheadCost
profitCost   = profitBasis       × (profit% / 100)
finalTotal   = profitBasis + profitCost
```

This sequence **must live in `src/lib/utils/markupChain.ts`** as a pure function:

```ts
export function applyMarkupChain(
  base: { totalMaterial: number; totalLabor: number; gcTotal: number },
  config: MarkupConfig,
): MarkupChainResult { ... }
```

Markups.tsx calls this function — it does NOT inline the chain.

---

## 4. Cross-Tab Consistency — The Labour Example

The Labour tab total and the Labour value in the Markups summary **must always be the same number**. This is achieved by:

1. **Parent computes once:** The shared parent (`Reports.tsx` or a context) calls `aggregateProjectCosts()` once and stores the result.
2. **Both tabs receive the same `ProjectCosts` prop** — they read `projectCosts.totalLabor`, not their own sum.
3. **Filters are a view concern only** — if the Labour tab has level/trade filters, those filters only change what rows are displayed, NOT what total is passed to Markups. The Markups tab always receives the unfiltered total.

If a filter on the Labour tab is supposed to change the Markups total, that is a deliberate product decision that must be documented explicitly — it is not a default.

---

## 5. `useMemo` Rules for Cost Calculations

```tsx
// CORRECT: compute ProjectCosts once at the top, pass down
const projectCosts = useMemo(
  () => aggregateProjectCosts(materialCostingData, priceMap),
  [materialCostingData, priceMap],  // only the raw inputs — never derived values
);

// CORRECT: derive a sub-total from the already-computed object
const staffingTotal = useMemo(
  () => staffingRows.reduce((sum, row) => sum + calcStaffingRowTotal(row, durationWeeks), 0),
  [staffingRows, durationWeeks],
);

// WRONG: re-aggregating from raw data in a child component
const totalLabor = useMemo(
  () => filteredItems.filter(i => i.isLabor).reduce((s, i) => s + i.cost, 0),
  [filteredItems],   // ← this creates a DIFFERENT total than the Labour tab
);
```

**Rules:**
- Every `useMemo` that produces a cost total must list only **primitive inputs** in its dependency array — never `filteredItems` unless the component is explicitly a filtered view and the filter is intentional.
- Never nest a cost `useMemo` inside another cost `useMemo` (use separate memos and compose at the bottom, like the current `totals` memo in Markups.tsx).
- If a `useMemo` re-implements math that exists in a utility function, delete the memo and call the utility function.

---

## 6. Adding a New Calculated Value — Checklist

Follow this order every time:

1. **Define the formula on paper first.** Write out the math with named variables. Get confirmation from Harsh/Dhruv if it's a new business formula.
2. **Add it to `projectCosting.ts` or `markupChain.ts`** (whichever is appropriate) as a pure function, with a JSDoc comment citing the formula source.
3. **Add the result field to the relevant interface** (`ProjectCosts` or `MarkupChainResult`).
4. **Update ALL callers** — grep for every place the old value was computed and replace with the new function call.
5. **Never leave the old inline computation in place** — delete it.

---

## 7. Formula Provenance — Every Formula Must Be Traceable

Every non-trivial formula in `projectCosting.ts`, `markupChain.ts`, and `markups/types.ts` must have a JSDoc comment:

```ts
/**
 * Labor burden: applied to direct labor only (not GC labor).
 * Formula: totalLabor × (laborBurden% / 100)
 * Source: Dhruv's markup formula sheet v2 (2024-11)
 */
export function calcLaborBurden(totalLabor: number, burdenPct: number): number {
  return totalLabor * (burdenPct / 100);
}
```

If a formula comes from Dhruv, note it. If it is a standard industry formula, note that. If the source is unknown, note "source: assumed — verify with Dhruv" and treat it as a pending item.

---

## 8. Aggregation Function Rules

When writing or modifying `aggregateProjectCosts()`:

```ts
// CORRECT — accumulate, don't compute twice
const totalMaterial = lineItems
  .filter(i => !i.isLabor)
  .reduce((sum, i) => sum + i.totalCost, 0);

// then re-use the same lineItems array for byTrade — don't traverse materialCostingData again

// WRONG — traversing the input twice in two separate reduce() calls
const totalMaterial = materialCostingData
  .flatMap(a => a.materials_costing ?? [])
  .flatMap(c => c.matched_materials ?? [])
  .reduce((s, m) => s + (m.unit_cost ?? 0) * (m.quantity ?? 0), 0);

const totalLabor = materialCostingData  // ← second full traversal: inconsistent and slow
  .flatMap(a => a.materials_costing ?? [])
  .flatMap(c => c.matched_labor ?? [])
  .reduce((s, l) => s + (l.unit_cost ?? 0) * (l.quantity ?? 0), 0);
```

Build `lineItems[]` in a single traversal, then derive all totals from that array.

---

## 9. The `priceMap` Contract

`priceMap` is `Record<string, { cost: number; per: number }>` — it holds database prices keyed by material code. The resolution order for a line item's unit cost is:

```
1. mat.unit_cost (AI-set override from the pipeline output) — highest priority
2. priceMap[mat.code]?.cost (database price) — fallback
3. 0 — last resort (never silently NaN)
```

This resolution must happen in `aggregateProjectCosts()` — not in individual components. Never let a component or tab apply its own price override logic.

---

## 10. Forbidden Patterns — Never Do These

- **Never** sum `filteredItems` (post-filter) to produce a total that is then compared to or displayed alongside an unfiltered total from another tab.
- **Never** write `items.reduce((s, i) => s + i.cost, 0)` in a component body — call `aggregateProjectCosts()`.
- **Never** copy-paste the markup chain formula (escalation → tax → burden → overhead → profit) into a new component. It must come from `markupChain.ts`.
- **Never** add a new markup percentage field (`config.newThing`) without: (a) adding it to `MarkupConfig`, (b) adding the formula to `markupChain.ts`, (c) adding it to `MarkupChainResult`, (d) updating the display in `Markups.tsx`.
- **Never** format a cost value (`toLocaleString`, `$`, rounding) before it is used in further arithmetic — format only at the display layer.
- **Never** use `Math.round()` or `toFixed()` on intermediate calculation results — only on the final displayed value.
- **Never** let `NaN` or `undefined` silently propagate through a calculation — use `?? 0` at every data boundary (when reading from DB/AI output), and validate inputs at the start of each calc function.

---

## 11. What to Do When You Find a Mismatch

If two tabs show different values for what should be the same number:

1. **Do not "fix" the display** — do not add a special case to make one number match the other.
2. **Find the canonical source** using this file's table (Section 2).
3. **Delete the non-canonical computation** — the fix is always to remove the duplicate, not to reconcile two competing formulas.
4. **Trace the data path** to confirm both components are now reading the same function's output.
5. **Note the mismatch in a comment** above the fix with `// FIX: was computing X differently from Y — unified to aggregateProjectCosts()`.

---

## 12. When to Read This File

Read this file when:
- Any number is computed, summed, multiplied, or divided in relation to costs
- You are adding a new tab/panel that displays any cost or quantity
- You are touching `Markups.tsx`, `Reports.tsx`, `LaborView.tsx`, `MatLabView.tsx`, `MaterialsView.tsx`
- You are modifying `calculationUtils.ts`, `aggregateMaterialsFromCosting.ts`, `projectCosting.ts`, `markupChain.ts`, or any `calc*` function in `markups/types.ts`
- A user reports a number mismatch between two parts of the UI
