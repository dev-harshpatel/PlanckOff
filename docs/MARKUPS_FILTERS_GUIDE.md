# Markups Tab — Filter Breakdown & Data Flow Guide

This document explains how the three filters in the **Markups** tab work, how data and total costs are calculated, and where the data comes from.

---

## Overview

The Markups tab has three breakdown types (filters):

1. **Trade Breakdown (Division 05-09)** — Costs grouped by trade (Dry Wall, Framing, Insulation, Other)
2. **Floor Wise Breakdown** — Costs grouped by level/floor (Material + Labor per level)
3. **Interior and Exterior Envelop** — Costs grouped by assembly category (Interior Walls, Exterior Walls, Ceiling, BulkHead, etc.)

All three share the same underlying data source and cost calculation logic. The **Level / Area** filter applies across all breakdown types to restrict which levels are included.

---

## Data Sources

### Primary: `materialCostingData` (Pipeline Final Output)

- **Source:** `GET /api/assembly-data?projectId=xxx` → `materialData.assemblies`
- **Origin:** Pipeline **final output** (merge of material match + takeoff)
- **Format:** Array of assemblies, each with:
  - `assembly_id`, `assembly_type`, `level`, `height_ft`, `total_length`, `ceiling_area`
  - `materials_costing[]` — `matched_materials[]` and `matched_labor[]` with `quantity`, `unit`, `unit_cost`, `description`

When `materialCostingData` exists, it is flattened into line items via `flattenMaterialCostingToItems()`:
- Each `matched_material` → item with `category: 'Other'`, `overridePrice: mat.unit_cost`
- Each `matched_labor` → item with `category: 'Labor'`, `overridePrice: lab.unit_cost`
- `assemblyType` comes from `assembly_type` (normalized: wall → Interior Walls, Ceiling → Ceiling, etc.)
- `area` comes from `level` (e.g. "Level 1", "Level 2, Level 3")

### Fallback: `markupItems` (Report Line Items from calculateMaterials)

- **Source:** `Reports.tsx` → `reportLineItems` (built from `assemblies` + `takeoffs` + `calculateMaterials()`)
- **Origin:** Formula-based calculation using assembly components, takeoff quantities, and material definitions
- **When used:**
  - When `materialCostingData` is empty
  - When a category (e.g. Ceiling, BulkHead) has **$0** from `materialCostingData` — those assemblies often have empty `materials_costing` ("Assembly not found in material match"), so we fall back to `markupItems` for that category

### Price Map

- **Source:** `materials` (spec database) → `priceMap[item.description] = { cost, per }`
- **Usage:** `getItemCost(item, priceMap)` uses `overridePrice` when present (from pipeline), otherwise looks up by `item` in `priceMap`

---

## Cost Calculation

### `getItemCost(item, priceMap)`

```
cost = quantity × (unit_cost / per)
```

- If `item.overridePrice` is set (from pipeline): use it as unit cost
- Otherwise: look up `priceMap[item.item]` or `priceMap[item.item.split('@')[0]]`
- For sheets: `quantity` is multiplied by 48 (SF per sheet)

### Labor vs Material Classification

An item is treated as **labor** if:

- `item.category === 'Labor'`, or
- `item.item` includes `"install"` or `"labor"` (case-insensitive)

Otherwise it is **material**.

---

## Filter 1: Trade Breakdown (Division 05-09)

### What it shows

- **Dry Wall** — Ceiling, drywall, finishing (board, mud, tape, hang drywall)
- **Framing** — Studs, track
- **Insulation** — Rockwool, fiberglass, batt, etc.
- **Other** — Everything else

### How it’s calculated

1. Start from `filteredItems` (see [Filtered Items](#filtered-items))
2. For each item:
   - `cost = getItemCost(item, priceMap)`
   - `trade = getTradeFromCategory(item.category, item.item)`
   - If labor → add to `trades[trade].labor`
   - Else → add to `trades[trade].material`
3. **Total** per row = Material Cost + Labor Cost

### Trade classification (`getTradeFromCategory`)

| Condition | Trade |
|-----------|-------|
| `category` includes "framing" OR `item` includes "stud"/"track" | Framing |
| `category` includes "ceiling"/"drywall"/"finishing" OR `item` includes "board"/"drywall"/"mud"/"tape" | Dry Wall |
| `category` includes "insulation" OR `item` includes "insulation"/"rockwool"/"fiberglass"/"batt"/"mineral wool"/"comfortbatt" | Insulation |
| Else | Other |

### Level filter

- If **Level / Area** is set: only items whose `area` contains at least one selected level are included
- If empty: all items are included

---

## Filter 2: Floor Wise Breakdown

### What it shows

- One row per level (e.g. Level 1, Level 2, Level 3)
- Material Cost and Labor Cost per level
- Total = Material + Labor per level

### How it’s calculated

1. Start from `effectiveMarkupItems` (not `filteredItems` — floor breakdown uses all items, then applies level logic)
2. For each item:
   - Parse `item.area` → list of levels (e.g. "Level 1, Level 2" → ["Level 1", "Level 2"])
   - If **Level filter** is set: only process levels that are in the filter
   - If no level filter: use all levels from the item (or `["Unknown"]` if none)
   - `cost = getItemCost(item, priceMap)`
   - Split cost across levels: if item spans N levels, add `cost / N` to each level’s material or labor
3. Sort levels naturally (Level 1, Level 2, … Level 10)
4. Exclude "Unknown"

### Level filter

- If **Level / Area** is set: only those levels are included in the breakdown
- If empty: all levels from the data are shown

---

## Filter 3: Interior and Exterior Envelop

### What it shows

- **Interior Walls**, **Exterior Walls**, **Ceiling**, **BulkHead**, **Access Pannel**, **HM Frames**
- Material Cost and Labor Cost per category
- Total = Material + Labor per category
- All six categories are always shown (including $0)

### How it’s calculated

1. Start from `filteredItems`
2. For each item:
   - `cat = item.assemblyType` (or "Interior Walls" if not in ASSEMBLY_CATEGORIES)
   - Normalize: "Interior Wall" → "Interior Walls", "Bulkhead" → "BulkHead", etc.
   - `cost = getItemCost(item, priceMap)`
   - If labor → add to `byCategory[norm].labor`
   - Else → add to `byCategory[norm].material`
3. **Total** per row = Material Cost + Labor Cost

### Assembly type mapping

| `assembly_type` (from data) | Display category |
|----------------------------|------------------|
| wall, Interior Wall        | Interior Walls   |
| Exterior Wall              | Exterior Walls   |
| Ceiling                    | Ceiling          |
| Bulkhead                   | BulkHead         |
| Access Panel               | Access Pannel    |
| HM, Hollow Metal           | HM Frames        |

### Level filter

- Same as Trade Breakdown: only items whose `area` contains at least one selected level

---

## Filtered Items

`filteredItems` is used by **Trade Breakdown** and **Interior and Exterior Envelop**:

```
filteredItems = effectiveMarkupItems (if no level filter)
             OR effectiveMarkupItems filtered to items whose area includes at least one selected level
```

`effectiveMarkupItems` is the merged dataset:

1. Flatten `materialCostingData` → `fromCosting`
2. If `fromCosting` is empty → use `markupItems`
3. Else:
   - Compute total cost per category from `fromCosting`
   - For categories with $0, add items from `markupItems` that match that category
   - `effectiveMarkupItems = fromCosting + fallbackItems`

---

## Total Cost (Cost Distribution & Final Calculations)

### Direct costs

- **Total Material** = sum of all `tradeBreakdown[trade].material`
- **Total Labor** = sum of all `tradeBreakdown[trade].labor`
- **Net Direct Cost** = Total Material + Total Labor

### General requirements

- **Gen. Req.** = sum of `quantity × rate` for all General Requirement items (Staffing, Site, Admin)

### Gross cost

- **Gross Cost (Base)** = Net Direct Cost + Gen. Req.

### Markups (configurable)

- Escalation: `grossCost × (escalation% / 100)`
- Tax: `totalMaterial × (tax% / 100)`
- Labor Burden: `totalLabor × (laborBurden% / 100)`
- Subtotal with taxes = Gross Cost + Escalation + Tax + Burden
- Overhead: `subTotalWithTaxes × (overhead% / 100)`
- Profit: `(subTotalWithTaxes + Overhead) × (profit% / 100)`
- **Final Total** = Subtotal + Overhead + Profit

### Cost Distribution pie chart

- Material, Labor, Gen. Req., Markups (Final Total − Gross Cost)
- Only slices with value > 0 are shown

---

## Summary Table

| Filter                    | Grouping          | Data used       | Level filter effect                          |
|---------------------------|-------------------|-----------------|----------------------------------------------|
| Trade Breakdown           | Trade (4 groups)  | filteredItems   | Restricts items to selected levels           |
| Floor Wise Breakdown      | Level             | effectiveMarkupItems | Restricts which levels appear in the table |
| Interior and Exterior Envelop | Category (6)  | filteredItems   | Restricts items to selected levels           |

---

## File References

- **Markups view:** `src/components/features/reports/Markups.tsx`
- **Filter UI:** `src/components/features/reports/MarkupFilterDropdown.tsx`
- **Reports / data wiring:** `src/components/features/reports/Reports.tsx`
- **Assembly data API:** `src/app/api/assembly-data/route.ts`
- **Material calculation:** `src/services/gemini/calculateMaterials.ts`
- **Final output merge:** `src/services/finalize/mergeTakeoffWithMaterialMatch.ts`
