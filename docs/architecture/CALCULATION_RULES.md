# Calculation Rules

> This is a concise reference. The full rules are in `.claude/rules/calculations.md`.
> Read that file before touching ANY code that produces a number.

---

## The Cardinal Law

> Every calculated value has exactly ONE canonical function. All views read that function's output.

---

## Formula Evaluation — Where It Happens

Formulas are evaluated **exactly once** — in the finalize step (`mergeTakeoffWithMaterialMatch.ts`).

```
Match step sets:           qty1Formula (stored on MatchedMaterial/MatchedLabor)
                           unit_cost   (from material_database.unitPrice / labour_database.ratePerUom)

Finalize step evaluates:   qty1Formula against takeoff tokens → quantity (stored)

Reports reads:             quantity * unit_cost → totalCost (computed at display only)
```

**Formula tokens:**
- `[LEN]`    = takeoff row length (ft)
- `[HGT]`    = takeoff row height (ft)
- `[LAYER]`  = layer count (default 1)
- `[WST_FR]` = waste factor (from constants)
- `[OC]`     = stud spacing (default 16")

---

## Cost Architecture

```
material_database.unitPrice → MatchedMaterial.unit_cost  (set at match time, never changed)
labour_database.ratePerUom  → MatchedLabor.unit_cost     (set at match time, STD band default)

finalize evaluates qty1Formula → MatchedMaterial.quantity / MatchedLabor.quantity

aggregateProjectCosts() reads:
  lineItem.totalCost = lineItem.quantity * lineItem.unitCost   ← only arithmetic in the whole system
  totalMaterial = sum of material line items
  totalLabor    = sum of labour line items
```

---

## Forbidden Patterns

- `Math.round()` or `toFixed()` on intermediate values — format only at display layer
- Re-summing `materialCostingData` in a component — use `projectCosts` from context
- Inline markup chain — use `applyMarkupChain()` from `markupChain.ts`
- Storing `total_cost` — it is always `quantity * unit_cost` at read time
- `NaN` or `undefined` propagating through calculations — use `?? 0` at every data boundary
