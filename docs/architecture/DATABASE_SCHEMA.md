# Database Schema — Three Matching Databases

These three tables replaced `spec_database` for all matching and costing operations.

---

## `material_database` — 1,213 rows

The master material catalog imported from the Drywall Database Excel.

| Column | Type | Notes |
|--------|------|-------|
| `code` | TEXT UNIQUE | e.g. `GWB-58-TX`, `ST-358-25` |
| `category` | TEXT | `Drywall`, `FRAMING`, `INSULATION`, `SHEATHING`, `ACCESSORIES`, … |
| `parent_section` | TEXT | `Walls` or `Ceiling` — top-level grouping |
| `type` | TEXT | `Type X`, `Type C`, `Regular`, `MR` (for Drywall) |
| `size` | TEXT | Sheet/panel dimension: `4' x 8'` for boards, `92mm` for framing |
| `size_mm` | NUMERIC | Numeric mm (thickness for boards, depth for insulation) |
| `size_imperial` | TEXT | `5/8"`, `3-5/8"` etc. — used for XXXXXXX placeholder matching |
| `wall_labour_code` | TEXT | → `labour_database.labour_code` (wall applications) |
| `ceiling_labour_code` | TEXT | → `labour_database.labour_code` (ceiling applications) |
| `bulkhead_labour_code` | TEXT | → `labour_database.labour_code` (bulkhead applications) |
| `qty1_formula` | TEXT | Wall quantity formula e.g. `[LEN] * [HGT] * [LAYER]` |
| `uom1` | TEXT | Unit of measure for qty1 e.g. `SF`, `LF` |
| `qty1_formula_ceiling` | TEXT | Ceiling quantity formula |
| `unit_price` | NUMERIC | Cost per `uom1` — may be 0 if not yet priced |
| `search_keywords` | TEXT[] | Computed at import time for search UI |
| `row_num` | INTEGER | Position within its parent_section (resets per section) |

**Important**: `SIZE` stores the sheet dimension (`4' x 8'`), NOT the board thickness.
Board thickness is only in the description and `size_imperial`. Matching uses `size_imperial`.

---

## `labour_database` — ~105 rows

Labour rates by activity and height band.

| Column | Type | Notes |
|--------|------|-------|
| `labour_code` | TEXT | e.g. `LAB-HNG-STD`, `LAB-FRM-STD` |
| `code` | TEXT | Short band code: `STD`, `HI`, `VHI`, `EHI`, `MED` |
| `ht_band` | TEXT | `Standard`, `Medium`, `High`, `Very High`, `Extra High`, `All` |
| `ht_min_ft` | NUMERIC | Min height for this band |
| `ht_max_ft` | NUMERIC | Max height (99 = no limit) |
| `rate_per_uom` | NUMERIC | $ per unit (e.g. $/SF) |
| `uom` | TEXT | Unit of measure |
| `qty1_formula` | TEXT | Quantity formula for this labour activity |
| `category` | TEXT | e.g. `Install Framing Wall`, `Hang Drywall Wall` |
| `parent_section` | TEXT | `Walls`, `Ceiling`, `Bulkhead` |

One `labour_code` has multiple rows — one per height band.
`resolveMatchedLabour()` returns ALL bands; the finalize step selects the right one by height.

**Labour code uniqueness**: `labour_code` + `ht_band` is the natural key. The DB has no
composite unique constraint yet. The import script overwrites on `labour_code` conflict —
this only works correctly if `labour_code` is unique per band within the same import run.

---

## `assembly_bunch_database` — ~120–150 rows

BOM templates — one row per item per branch template.

| Column | Type | Notes |
|--------|------|-------|
| `branch_code` | TEXT | e.g. `FR-WALL`, `DW-SGL-WALL`, `INS-CLG` |
| `item_code` | TEXT | Concrete code OR `XXXXXXX` (placeholder) |
| `description` | TEXT | Item description / hint for placeholder resolution |
| `size` | TEXT | Optional size hint for placeholder resolution |
| `layers` | INTEGER | Layer context (NULL = any layer count) |
| `sort_order` | INTEGER | Order within the branch template |
| `labour_code` | TEXT | Reference only — NOT used at match time |

**No natural unique key** — `branch_code + item_code` is NOT unique (XXXXXXX repeats, and
the same concrete code can appear in multiple branches). Import strategy: DELETE all rows
for a branch, then INSERT fresh.

---

## How the Three Tables Work Together

```
assembly_bunch_database (WHAT items belong in this assembly type)
        ↓
  item_code = XXXXXXX?
        ↓                              ↓
  resolvePlaceholder()           materialByCode.get(itemCode)
  (filter material_database      (direct lookup)
   by category + size + type)
        ↓
material_database (WHAT the item costs + WHICH labour to use)
        ↓
  wallLabourCode / ceilingLabourCode / bulkheadLabourCode
        ↓
labour_database (HOW MUCH labour costs by height band)
```

---

## Import Scripts

Located in `scripts/`:
- `importMaterialDatabase.ts` — run with `npx tsx scripts/importMaterialDatabase.ts`
- `importLabourDatabase.ts` — run with `npx tsx scripts/importLabourDatabase.ts`
- `importAssemblyBunchDatabase.ts` — run with `npx tsx scripts/importAssemblyBunchDatabase.ts`

Source files expected in `data/`:
- `Drywall Database (6-22-2026).xlsx` (sheet: Material Data)
- `Labour Database (6-17-2026).xlsx` (sheet: Labour Data)
- `Default_Assembly_Branch (6-17-2026).xlsx` (sheet: by default assembly branch)

After running any import script, invalidate the relevant cache:
```
POST /api/material-database?action=invalidate-cache
POST /api/labour-database?action=invalidate-cache
POST /api/assembly-bunch-database?action=invalidate-cache
```
Or restart the dev server (memory cache clears on restart).
