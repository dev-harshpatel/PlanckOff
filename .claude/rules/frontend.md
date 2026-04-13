# Frontend Rules — Components, UI, and Styling

Consult this file for: React components, layouts, modals, forms, tables, Tailwind styling, state access, icons, loading/error/empty states.

---

## 1. Component Architecture

### File Placement
- **Reusable primitives** (Button, Input, Modal, etc.) → `src/components/ui/`
- **Feature components** (specific to a domain) → `src/components/features/<domain>/`
- **Layout components** → `src/components/layout/`
- **Page components** → `src/app/(protected)/(app)/<page>/page.tsx`

### Component Template
```tsx
'use client'; // Only add this if the component uses hooks, browser APIs, or event handlers

import { useState, useCallback } from 'react';
import { SomeIcon } from 'lucide-react';
import { Button, Modal, ModalBody, ModalFooter } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

interface MyComponentProps {
  title: string;
  onClose: () => void;
  isOpen: boolean;
}

export function MyComponent({ title, onClose, isOpen }: MyComponentProps) {
  const { toast } = useToast();
  // ...
}
```

### Rules
- Always use `interface` for props — never `type` for prop shapes.
- Use named exports, not default exports, for feature components.
- Mark with `'use client'` only when the component uses React hooks, event handlers, or browser APIs. Server components (data fetching wrappers, layouts) must NOT have `'use client'`.
- Do NOT use `React.FC<Props>` — just type the function parameters directly.
- Memoize event handlers with `useCallback` when passed as props to child components.
- Co-locate sub-components in the same file if they are not reused elsewhere.

---

## 2. UI Component Library — Always Reuse

**Import from `@/components/ui` (the barrel export).** Never rebuild a primitive — check this list first.

### Button
```tsx
import { Button } from '@/components/ui';

// Variants: primary (default), secondary, ghost, danger, success
// Sizes: sm, md (default), lg
// Props: isLoading, disabled, fullWidth, icon, iconPosition ('left'|'right')

<Button variant="primary" size="md" onClick={handleSave} isLoading={saving}>
  Save
</Button>

<Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={handleDelete}>
  Delete
</Button>

<Button variant="danger" onClick={handleConfirm}>
  Confirm Delete
</Button>
```

### Modal
```tsx
import { Modal, ModalBody, ModalFooter } from '@/components/ui';

// Sizes: sm, md (default), lg, xl, 2xl, full
// Always use ModalBody for scrollable content and ModalFooter for action buttons

<Modal isOpen={isOpen} onClose={onClose} title="Edit Assembly" size="lg">
  <ModalBody>
    {/* content here */}
  </ModalBody>
  <ModalFooter>
    <Button variant="ghost" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={handleSave} isLoading={saving}>Save</Button>
  </ModalFooter>
</Modal>
```

### Input
```tsx
import { Input } from '@/components/ui';

// Always provide label. Use error for validation messages.
<Input
  label="Material Code"
  value={code}
  onChange={(e) => setCode(e.target.value)}
  error={errors.code}
  required
/>
```

### Select
```tsx
import { Select } from '@/components/ui';

// Variants: default, filter, ghost, table
// options: Array<{ value: string; label: string }>

<Select
  label="Category"
  value={selectedCategory}
  options={[{ value: 'framing', label: 'Framing' }]}
  onValueChange={(val) => setSelectedCategory(val)}
  variant="default"
/>

// In table cells: use variant="table"
<Select variant="table" value={row.type} options={typeOptions} onValueChange={...} />
```

### Card
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

<Card padding="md" hoverable onClick={handleClick}>
  <CardHeader>
    <CardTitle>Assembly Name</CardTitle>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</Card>
```

### NumberInput
```tsx
import { NumberInput } from '@/components/ui';

// type: 'float' | 'int'
// cellMode: true for table cells (removes border/label styling)

<NumberInput
  label="Waste Factor"
  value={wasteFactor}
  onChange={(val) => setWasteFactor(val)}
  type="float"
/>
```

### StatusBadge
```tsx
import { StatusBadge } from '@/components/ui';

// Status values: 'Working' | 'Project Progress' | 'Under Review' | 'Submitted' | 'Hold' | 'Archive' | 'Active' | 'Invited'
<StatusBadge status="Active" size="sm" />
```

### EmptyState
```tsx
import { EmptyState } from '@/components/ui';

<EmptyState
  icon={<Database size={48} />}
  title="No materials found"
  description="Import materials from Excel or add them manually."
  action={<Button onClick={handleAdd}>Add Material</Button>}
/>
```

### Toast
```tsx
import { useToast } from '@/components/ui/Toast';

const { toast } = useToast();

toast.success('Assembly saved successfully');
toast.error('Failed to save. Please try again.');
toast.warning('No materials found for this assembly.');
toast.info('Changes will take effect on next run.');
```

### SearchInput
```tsx
import { SearchInput } from '@/components/ui';

<SearchInput
  value={searchTerm}
  onValueChange={setSearchTerm}
  showClear
/>
```

### ConfirmModal
```tsx
import { ConfirmModal } from '@/components/ui';

<ConfirmModal
  isOpen={showConfirm}
  title="Delete Assembly"
  message="This cannot be undone. Are you sure?"
  onConfirm={handleDelete}
  onCancel={() => setShowConfirm(false)}
  variant="danger"
/>
```

---

## 3. Tailwind Color Palette

**Only use these tokens. Never introduce arbitrary colors or hex codes in className.**

| Purpose | Token |
|---------|-------|
| Primary action (buttons, focus rings, links) | `emerald-600`, `emerald-700` |
| Primary light background | `emerald-50`, `emerald-100` |
| Primary text on emerald | `emerald-700`, `emerald-800` |
| Neutral backgrounds | `slate-50`, `slate-100`, `slate-200` |
| Borders | `slate-200`, `slate-300` |
| Body text | `slate-900`, `slate-700` |
| Secondary/muted text | `slate-500`, `slate-400` |
| Danger (errors, delete) | `red-600`, `red-50`, `red-200` |
| Warning | `amber-600`, `amber-50`, `amber-200` |
| Info | `blue-600`, `blue-50` |
| Success (same as primary) | `emerald-600`, `emerald-50` |
| Archive/special | `purple-600`, `purple-50` |

### Focus States — Always Consistent
```tsx
// On inputs, selects, textareas:
className="focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
```

---

## 4. Typography Scale

```tsx
// Page/section headings
className="text-lg font-bold text-slate-900"
className="text-base font-semibold text-slate-800"

// Table headers
className="text-xs font-semibold text-slate-500 uppercase tracking-wider"

// Body text
className="text-sm text-slate-700"
className="text-sm text-slate-600"

// Muted/helper text
className="text-xs text-slate-500"
className="text-xs text-slate-400"

// Labels on inputs
className="text-xs font-medium text-slate-700"
```

---

## 5. Layout and Spacing

```tsx
// Page padding
className="p-6"

// Section gaps
className="flex flex-col gap-4"
className="flex flex-col gap-6"

// Row layouts
className="flex items-center gap-3"
className="flex items-center justify-between"

// Card-like containers
className="bg-white border border-slate-200 rounded-lg p-4"
className="bg-slate-50 border border-slate-200 rounded-lg p-3"

// Dividers
<div className="border-t border-slate-200 my-4" />

// Full-height panels
className="flex flex-col h-full overflow-hidden"

// Scrollable content area
className="flex-1 overflow-y-auto"
```

---

## 6. Table Patterns

Tables are common in this app. Always structure them like this:

```tsx
<div className="overflow-x-auto">
  <table className="w-full text-sm">
    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
      <tr>
        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Column Name
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      {rows.map((row) => (
        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
          <td className="px-3 py-2 text-sm text-slate-700">
            {row.value}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

For editable table cells, use `NumberInput` with `cellMode` or `Select` with `variant="table"`.

---

## 7. Form Patterns

```tsx
// Form layout: always vertical stack with consistent gaps
<div className="flex flex-col gap-4">
  <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
  <Select label="Type" value={type} options={typeOptions} onValueChange={setType} />
  <Input label="Cost" value={cost} onChange={(e) => setCost(e.target.value)} />
</div>

// Two-column form grid
<div className="grid grid-cols-2 gap-4">
  <Input label="First Name" ... />
  <Input label="Last Name" ... />
</div>

// Validation: show inline errors under fields
<Input
  label="Email"
  value={email}
  onChange={...}
  error={errors.email}   // Displays red helper text below input
/>
```

---

## 8. Icons

**Only use `lucide-react`. Never add another icon library.**

```tsx
import { Trash2, Plus, Edit2, ChevronDown, Search, X, Check, AlertTriangle } from 'lucide-react';

// Standard sizes
size={14}  // inside compact buttons / table cells
size={16}  // default inline
size={18}  // prominent actions
size={20}  // section icons
size={24}  // large standalone icons
size={48}  // EmptyState illustrations
```

---

## 9. Loading, Error, and Empty States

Always handle all three states — never leave a loading or error scenario unaddressed.

```tsx
// Loading
if (isLoading) {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
    </div>
  );
}

// Error
if (error) {
  return (
    <div className="flex items-center justify-center h-48">
      <p className="text-sm text-red-600">{error}</p>
    </div>
  );
}

// Empty
if (items.length === 0) {
  return (
    <EmptyState
      icon={<SomeIcon size={48} className="text-slate-300" />}
      title="No items yet"
      description="Add your first item to get started."
      action={<Button onClick={handleAdd}>Add Item</Button>}
    />
  );
}
```

---

## 10. State Management in Components

**Access app-wide state via context hooks — never prop-drill more than one level.**

```tsx
import { useApp, useMaterials, useAppSettings } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useRBAC } from '@/hooks/useRBAC';

// Materials database
const [materials, setMaterials] = useMaterials();

// Auth user
const { user } = useAuth();

// Role-based rendering
const { isAdmin, hasRole, canManageTeam } = useRBAC();

if (!isAdmin) return null; // or show restricted message
```

**Local state rules:**
- Use `useState` for UI-only state (open/close, selected row, input value).
- Use `useCallback` for handlers passed as props.
- Use `useMemo` for expensive derived values in render.
- Never store server-fetched data in `localStorage` — use context or component state.

---

## 11. Data Fetching in Components

Always fetch inside `useEffect` with proper cleanup. Show loading/error states.

```tsx
const [data, setData] = useState<MyType[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;

  async function fetchData() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/my-endpoint');
      const json = await res.json();
      if (!cancelled) {
        if (json.success) setData(json.data);
        else setError(json.error ?? 'Something went wrong');
      }
    } catch {
      if (!cancelled) setError('Failed to load data');
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  }

  fetchData();
  return () => { cancelled = true; };
}, []);
```

---

## 12. Tab Navigation Pattern

Every multi-tab feature uses this exact structure — no exceptions. Do not invent a different pattern.

```tsx
// 1. Define the tab IDs as a union type
type TabId = 'overview' | 'details' | 'history';

// 2. Define the tab config array (label maps to ID)
const TABS: { id: TabId; label: string; icon?: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'history', label: 'History' },
];

// 3. State
const [activeTab, setActiveTab] = useState<TabId>('overview');

// 4. Tab bar JSX
<div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
  {TABS.map(tab => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        activeTab === tab.id
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {tab.icon}
      {tab.label}
    </button>
  ))}
</div>

// 5. Content switching — use explicit equality checks, not a map
{activeTab === 'overview' && <OverviewPanel />}
{activeTab === 'details' && <DetailsPanel />}
{activeTab === 'history' && <HistoryPanel />}
```

**Rules:**
- Tab state is always `useState<TabId>` with the union type — never `useState<string>`.
- TABS array is always defined as a `const` outside the component render.
- Active state: `bg-white shadow-sm` pill on `bg-slate-100` tray — never underline or colored border.
- When tab state should survive navigation, use `useReportFilters()` (URL params) instead of `useState`.

---

## 13. Page Layout Pattern

Every full page inside `app/(protected)/(app)/` uses this outer wrapper:

```tsx
// Full-height page with header + scrollable content
<div className="h-full flex flex-col overflow-hidden">
  {/* Page header — always fixed at top */}
  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
    <div>
      <h1 className="text-lg font-bold text-slate-900">Page Title</h1>
      <p className="text-xs text-slate-500 mt-0.5">Optional subtitle</p>
    </div>
    <div className="flex items-center gap-2">
      {/* Action buttons */}
    </div>
  </div>

  {/* Scrollable content */}
  <div className="flex-1 overflow-y-auto p-6">
    {/* Page content */}
  </div>
</div>
```

For pages that do NOT scroll (e.g. split-panel layouts):
```tsx
<div className="h-full flex overflow-hidden">
  <aside className="w-64 border-r border-slate-200 flex flex-col overflow-hidden shrink-0">
    {/* Left panel */}
  </aside>
  <main className="flex-1 flex flex-col overflow-hidden">
    {/* Right panel */}
  </main>
</div>
```

**Rules:**
- The outer `div` is always `h-full` — never `h-screen` inside a layout that already controls height.
- `overflow-hidden` on the outer wrapper + `overflow-y-auto` on the scroll target — never both on the same element.
- Header is always `shrink-0` so it never collapses.
- Never use `min-h-screen` inside the app shell — the shell already fills the viewport.

---

## 14. Section Headers

```tsx
// Primary section header — used at the top of a card or panel section
<div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4 shrink-0">
  <h3 className="text-sm font-semibold text-slate-800">Section Title</h3>
  {/* Optional: count badge or action button */}
</div>

// Sub-section header — inside tables, below a primary header
<h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
  Sub-section
</h4>

// Inline label — next to a value in a detail panel
<span className="text-xs font-medium text-slate-500 mr-2">Label:</span>
<span className="text-sm text-slate-800">Value</span>
```

---

## 15. Do Not Do

- Do NOT use inline `style={{}}` for things achievable with Tailwind.
- Do NOT introduce new color values (hex, rgb) in classNames.
- Do NOT use `className` concatenation with template literals for conditional classes that become unreadable — extract to a variable or use a helper.
- Do NOT add `console.log` statements in committed code.
- Do NOT create wrapper divs without purpose — keep DOM depth minimal.
- Do NOT duplicate UI patterns that already exist in the UI component library.
- Do NOT use `any` for event handler types — use `React.ChangeEvent<HTMLInputElement>`, etc.
- Do NOT invent a new tab navigation pattern — use the exact structure from Section 12.
- Do NOT use `h-screen` inside the app shell layout — use `h-full` instead.
- Do NOT use underlines or colored borders for active tab state — use the white pill on `bg-slate-100` tray.
