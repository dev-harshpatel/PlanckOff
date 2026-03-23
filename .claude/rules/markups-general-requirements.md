# Markups — General Requirements Pattern

Consult this file for: any work inside the Markups tab (`src/components/features/reports/Markups.tsx`), the General Requirements (Division 01) section, or anything under `src/components/features/reports/markups/`.

---

## 1. Folder Structure

All sub-components for the Markups / General Requirements section live in:

```
src/components/features/reports/markups/
  ├── types.ts              ← All interfaces, defaults, and pure formula functions
  ├── ProjectInfoPanel.tsx  ← Collapsible project header (14 input fields + date-driven duration)
  ├── StaffingSection.tsx   ← Staffing / Supervision table with formula-driven totals
  └── (future sections)     ← e.g. GeneralConditionsSection.tsx, AdminSection.tsx
```

**Rule:** Every new GC section gets its own file in this folder. Never add section logic directly into `Markups.tsx`.

---

## 2. The `types.ts` Contract — Always Update This First

`types.ts` is the single source of truth. Before writing any component, define here:

```ts
// 1. The data shape (interface)
export interface MySection {
  id: string;
  label: string;
  someInput: number;
  anotherInput: number;
}

// 2. The default/initial state
export const DEFAULT_MY_SECTION: MySection[] = [ ... ];

// 3. The pure formula function(s)
export function calcMySectionTotal(row: MySection, durationWeeks: number): number {
  // Formula lives HERE — never inside a component
  return row.someInput * row.anotherInput * durationWeeks;
}
```

**Rules:**
- Formula functions are pure (no side effects, no imports from React or Next.js).
- They accept only primitive inputs (numbers, strings) — never React state directly.
- Return `number` (never `string` — formatting happens in the component).
- If a formula is used in both a sub-component AND in `Markups.tsx` (for totals), import the function from `types.ts` in both places — never duplicate it.

---

## 3. State Lives in `Markups.tsx` — Sub-components Are Controlled

Sub-components are fully controlled (no internal state for data). They receive:
- The data array (e.g. `rows: StaffingRow[]`)
- A change handler (`onRowChange`)
- Any shared inputs they need (e.g. `durationWeeks`)

```tsx
// In Markups.tsx
const [staffingRows, setStaffingRows] = useState<StaffingRow[]>(DEFAULT_STAFFING_ROWS);

const handleStaffingRowChange = useCallback(
  (id: string, field: 'workers' | 'percentTime' | 'hourlyRate', value: number) => {
    setStaffingRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  },
  [],
);
```

**Rule:** The change handler in `Markups.tsx` always uses `field` as a key — never one handler per field.

---

## 4. How Totals Flow Up

Each section's total is computed in `Markups.tsx` as a separate `useMemo`, then added into `gcTotal`:

```ts
// Step 1 — compute section total
const staffingTotal = useMemo(
  () => staffingRows.reduce((sum, row) => sum + calcStaffingRowTotal(row, projectInfo.durationWeeks), 0),
  [staffingRows, projectInfo.durationWeeks],
);

// Step 2 — add into gcTotal inside the main `totals` useMemo
const gcTotal =
  generalConditions.reduce((s, i) => s + i.quantity * i.rate, 0) +
  staffingTotal;
  // + futureSection2Total
  // + futureSection3Total
```

**Rule:** Every new formula-driven section must add its total to `gcTotal` this way. The `totals` useMemo dependency array must include the new section total.

---

## 5. ProjectInfo and Duration

`ProjectInfo` (defined in `types.ts`) holds all project header fields. The key flow:

```
User sets startDate + endDate in ProjectInfoPanel
  → calcWeeksFromDates(start, end) fires automatically in handleField
  → projectInfo.durationWeeks is updated
  → Markups.tsx passes durationWeeks down to all formula-driven sections
  → All formula sections recompute live
```

**Never hardcode a duration value** in a section component — always receive it as a prop from `Markups.tsx`.

```tsx
// Correct
<StaffingSection durationWeeks={projectInfo.durationWeeks} ... />

// Wrong
<StaffingSection durationWeeks={20} ... />
```

---

## 6. Section Component Pattern

Every GC section component follows this exact structure:

```tsx
'use client';

import React, { useCallback } from 'react';
import { SomeIcon } from 'lucide-react';
import { NumberInput } from '@/components/ui';
import { calcMySectionTotal, type MyRow } from './types';

interface MySectionProps {
  rows: MyRow[];
  durationWeeks: number;
  onRowChange: (id: string, field: keyof MyRow & string, value: number) => void;
  currencySymbol?: string;
}

export function MySection({ rows, durationWeeks, onRowChange, currencySymbol = '$' }: MySectionProps) {
  const formatCurrency = useCallback(
    (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [],
  );

  const grandTotal = rows.reduce((sum, row) => sum + calcMySectionTotal(row, durationWeeks), 0);

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2 border-b border-slate-200 pb-1">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Section Name
        </h4>
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            {/* Column headers — text-xs font-semibold text-slate-400 */}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row) => {
            const rowTotal = calcMySectionTotal(row, durationWeeks);
            return (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                {/* Input cells use NumberInput with cellMode */}
                {/* Read-only cells (e.g. duration) use the green badge pattern */}
                {/* Total cell shows '—' when zero, formatted value otherwise */}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50/70">
            <td colSpan={N - 1} className="py-2 pl-1 text-xs font-bold text-slate-600">
              Section Subtotal
            </td>
            <td className="py-2 pr-1 text-right text-xs font-bold text-slate-800 tabular-nums">
              {currencySymbol}{formatCurrency(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Formula hint — shown only when durationWeeks > 0 */}
      {durationWeeks > 0 && (
        <p className="text-[10px] text-slate-400 mt-1 pl-1">
          Formula: ...
        </p>
      )}
    </div>
  );
}
```

---

## 7. Editable Cell Pattern

**All user-input cells** use `NumberInput` from `@/components/ui` with `cellMode`:

```tsx
<NumberInput
  cellMode
  type="float"           // or 'int' for whole numbers
  value={row.someField}
  onChange={(v) => onRowChange(row.id, 'someField', v ?? 0)}
  className="w-full text-center text-xs border border-slate-200 rounded px-1 py-1.5
             focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none
             bg-white tabular-nums"
  placeholder="0"
/>
```

**Currency inputs** get a `$` prefix and `/hr` (or relevant unit) suffix:

```tsx
<div className="flex items-center gap-0.5">
  <span className="text-xs text-slate-400 shrink-0">$</span>
  <NumberInput cellMode type="float" ... />
  <span className="text-xs text-slate-400 shrink-0">/hr</span>
</div>
```

**Percentage inputs** get a `%` suffix:

```tsx
<div className="flex items-center gap-0.5">
  <NumberInput cellMode type="float" ... />
  <span className="text-xs text-slate-400 shrink-0">%</span>
</div>
```

---

## 8. Read-Only Calculated Cells

For cells that display a derived value (e.g. Duration fed from ProjectInfo):

```tsx
// Green badge — used for key derived values
<span className="inline-block text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded tabular-nums">
  {durationWeeks} wks
</span>

// Dash — used when value is zero / not yet available
<span className="text-xs text-slate-300">—</span>
```

---

## 9. Warning / Hint Pattern

Show an amber warning when a required upstream input is missing (e.g. project dates not set):

```tsx
import { AlertTriangle } from 'lucide-react';

{durationWeeks === 0 && (
  <div className="flex items-center gap-1 text-amber-600">
    <AlertTriangle size={11} />
    <span className="text-[10px] font-medium">Set project dates to calculate totals</span>
  </div>
)}
```

---

## 10. Adding a New GC Section — Checklist

Follow these steps in order:

1. **`types.ts`** — add `interface`, `DEFAULT_*` constant, and `calc*Total()` formula function.
2. **New component file** — e.g. `EquipmentSection.tsx` — follow the Section Component Pattern above.
3. **`Markups.tsx` state** — add `useState` for the new section data + a `useCallback` change handler.
4. **`Markups.tsx` totals** — add a `useMemo` for the section total and include it in `gcTotal`.
5. **`Markups.tsx` JSX** — render the new section component inside the GC `<div>`, below `StaffingSection`.
6. **Update `totals` dependency array** — include the new section total.

---

## 11. Do Not Do

- Do NOT put formula logic inside a component — always in `types.ts`.
- Do NOT manage section data state inside a section component — always in `Markups.tsx`.
- Do NOT add new sections to `generalConditions` (the `GeneralRequirement[]` state) — that array is only for the legacy Site and Admin free-form rows. New structured sections get their own typed state.
- Do NOT hardcode `durationWeeks` — always receive it as a prop from `projectInfo.durationWeeks`.
- Do NOT use `any` for the `field` parameter in change handlers — use a union of the specific keys.
- Do NOT show raw `$0` for formula results that are zero — show `—` for cleanliness (matches existing pattern).
