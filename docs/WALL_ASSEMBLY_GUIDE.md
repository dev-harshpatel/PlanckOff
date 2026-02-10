# Wall Assembly Builder - Implementation Guide

> Master reference for building the Wall Assembly Generation feature.
> **Work style**: Build one phase end-to-end, test it, mark done, move to next.

---

## Progress Tracker

| Phase       | Description                                | Status    |
| ----------- | ------------------------------------------ | --------- |
| **Phase 1** | Upload UI + Excel Parser (instant preview) | `DONE`    |
| **Phase 2** | OpenRouter PDF Parser (AI extraction)      | `TESTING` |
| **Phase 3** | Database Matching Service                  | `TODO`    |
| **Phase 4** | Assembly Generator (merge all 3 inputs)    | `TODO`    |
| **Phase 5** | Unit System Toggle (Imperial/Metric)       | `TODO`    |
| **Phase 6** | Three-View Toggle (Assembly/Takeoff/Both)  | `TODO`    |
| **Phase 7** | Project Trash + CRON (15-day cleanup)      | `TODO`    |

---

## UX Decision: Single Upload Zone

Both files are uploaded in **one place**. Auto-detected by extension:

- `.pdf` -> Wall Spec (sent to AI later)
- `.xlsx` / `.xls` -> Takeoff Schedule (parsed instantly)

The **"Generate Assemblies"** button is disabled until both files are present.
Excel is parsed on upload for instant preview. PDF is sent to AI only on "Generate" click.

```
┌─────────────────────────────────────────────────────────┐
│  Upload Files                                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │     Drop files here or click to browse          │    │
│  │     Accepts .pdf and .xlsx                      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  📄 Wall-Spec.pdf                    ✅  ✕              │
│  📊 OST-Takeoff.xlsx                 ✅  ✕              │
│                                                         │
│  ┌─ Takeoff Preview ─────────────────────────────┐      │
│  │ Assembly: P1                                   │      │
│  │   Wall @ 9.7'  →  1717 LF  →  16655 SF       │      │
│  │   Wall @ 10'   →   264 LF  →   2640 SF       │      │
│  │   Wall @ 15'   →    68 LF  →   1020 SF       │      │
│  │ Assembly: W4                                   │      │
│  │   Wall @ 12'   →   530 LF  →   6360 SF       │      │
│  └────────────────────────────────────────────────┘      │
│                                                         │
│              [ Generate Assemblies ]                     │
│          (disabled until both files uploaded)            │
└─────────────────────────────────────────────────────────┘
```

---

## 1. High-Level Data Flow

```
 ┌─────────────────┐     ┌────────────────────┐     ┌──────────────────┐
 │  Wall Spec PDF   │     │  OST Takeoff Excel  │     │  spec_database    │
 │  (AI parsed)     │     │  (xlsx parsed)       │     │  (Supabase DB)    │
 └────────┬────────┘     └────────┬─────────────┘     └────────┬─────────┘
          │                       │                             │
          │  OpenRouter API       │  xlsx library               │  API query
          │  (on Generate click)  │  (on file upload)           │
          ▼                       ▼                             ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                   WALL ASSEMBLY PROCESSOR                       │
    │  Merges PDF data + Takeoff data + DB data into assembly rows   │
    └─────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │   Wall Assembly Table  │
                          │   (one per wall type   │
                          │    per height variant)  │
                          └───────────────────────┘
```

### The Three Inputs

| #   | Input                    | Format         | What We Extract                                                   |
| --- | ------------------------ | -------------- | ----------------------------------------------------------------- |
| 1   | **Wall Spec PDF**        | PDF            | Wall type descriptions, OC spacing, layers, material keywords     |
| 2   | **OST Takeoff Schedule** | Excel (.xlsx)  | Assembly codes (P1, W4...), heights, wall lengths / ceiling areas |
| 3   | **spec_database**        | Supabase table | Material codes, CSI sections, costs, units, productivity          |

---

## 2. Assembly Table Columns

| Column            | Label           | Source      | Logic                                              |
| ----------------- | --------------- | ----------- | -------------------------------------------------- |
| **#**             | Sr. No.         | Auto        | Sequential row number                              |
| **Sect**          | CSI Section     | DB          | Match material -> DB `section` (e.g., `092216`)    |
| **Code**          | Material Code   | DB          | Match material -> DB `code`                        |
| **Description**   | Material        | PDF + DB    | AI keyword matched against DB `description`        |
| **Hgt**           | Height          | Excel       | Each unique height = separate assembly variant     |
| **OC**            | On-Center       | PDF         | Default 16". AI extracts from PDF (convert mm->in) |
| **Layers**        | Layer Count     | PDF         | "Two Layers" -> 2, default -> 1                    |
| **Wst%**          | Waste %         | Default 5%  | Editable per row                                   |
| **Qty**           | Quantity        | Calculated  | Formulas (pending from Dhruv Bhai)                 |
| **UOM**           | Unit of Measure | Unit toggle | Imperial: LF/SF/EA, Metric: M/M2/EA                |
| **Unit Mat.**     | Unit Price      | DB          | `mat_cost / per` converted to per-1-unit           |
| **Total Mat.**    | Total Cost      | Calculated  | `Qty * Unit Mat.`                                  |
| **Formula Basis** | Formula         | Pending     | From Dhruv Bhai                                    |

---

## 3. Keywords for AI PDF Parsing

The AI should search for these in the wall spec PDF:

- `GYPSUM WALLBOARD`
- `POLY VAPOUR BARRIER`
- `INSULATION`
- `METAL STUDS`
- `GYPSUM SHEATHING`
- `CROSS BRACING`

---

## Phase 1: Upload UI + Excel Parser

> **Status**: `TESTING` - See `docs/PHASE_1_TEST.md` for test plan
> **Goal**: Single upload zone UI + parse Excel on upload for instant takeoff preview.

### What gets built:

1. **Upload component** - drag-and-drop zone accepting .pdf and .xlsx
2. **File slot display** - shows uploaded files with status indicators and remove button
3. **Excel parser service** - reads .xlsx, extracts assembly codes, heights, wall lengths
4. **Takeoff preview panel** - shows grouped data (Assembly -> Height -> LF -> SF)
5. **API route** for server-side Excel parsing

### Files:

- [x] `src/types/takeoff.ts` - Takeoff types
- [x] `src/services/takeoff/parseOSTSheet.ts` - Excel parsing logic
- [x] `src/app/api/parse-takeoff/route.ts` - API route
- [x] `src/components/features/project/FileUploadZone.tsx` - Upload UI component
- [x] `src/components/features/project/TakeoffPreview.tsx` - Preview panel
- [x] `src/components/features/project/EstimateResult.tsx` - Integrated into project right panel
- **Location**: Inside each project's page (right panel of EstimateResult)

### Types:

```ts
interface TakeoffEntry {
  assemblyCode: string; // "P1", "W4"
  height: number; // 9.7, 10, 15
  wallLength: number; // LF per row
  ceilingArea?: number; // SF for ceiling types
}

interface HeightVariant {
  height: number;
  totalLF: number; // Sum of wall lengths for this height
  totalSF: number; // height * totalLF
  count: number; // How many rows were summed
}

interface AggregatedTakeoff {
  assemblyCode: string;
  heightVariants: HeightVariant[];
}

interface UploadedFiles {
  pdf: File | null;
  excel: File | null;
}
```

### Excel Parsing Logic:

1. Read xlsx using `xlsx` library
2. Find columns by header matching (fuzzy): Assembly Code, Height, Wall Length/Ceiling Area
3. Group rows by assembly code
4. For each code, group by unique height, sum wall length
5. Calculate SF = height \* totalLF

### Test Plan:

See `docs/PHASE_1_TEST.md` after build is complete.

### Acceptance Criteria:

- [ ] Can drag-and-drop or click-to-browse files
- [ ] .pdf is detected and placed in the PDF slot
- [ ] .xlsx is detected, parsed, and placed in the Excel slot
- [ ] Takeoff preview shows correct assembly codes
- [ ] Heights are correctly grouped and deduplicated
- [ ] LF sums are correct for each height variant
- [ ] SF = height \* totalLF is calculated correctly
- [ ] Files can be removed (X button) and re-uploaded
- [ ] "Generate Assemblies" button is disabled until both files are present
- [ ] UI is clean and matches the project's Tailwind styling

---

## Phase 2: OpenRouter PDF Parser

> **Status**: `TESTING`
> **Goal**: Send PDF to OpenRouter AI, get back structured wall type data.

### What gets built:

1. **OpenRouter client** - API wrapper with key from env
2. **PDF parsing service** - structured prompt, returns parsed wall types
3. **API route** for server-side PDF parsing
4. **Loading state in UI** - "Processing PDF..." after Generate click

### Files:

- [x] `.env.local` - Add `OPENROUTER_API_KEY`
- [x] `src/types/wallSpec.ts` - Parsed PDF types
- [x] `src/services/openrouter/client.ts` - OpenRouter client
- [x] `src/services/openrouter/parseWallSpec.ts` - Parsing service
- [x] `src/app/api/parse-pdf/route.ts` - API route
- [x] Update `WallAssemblyBuilder.tsx` - wire Generate button to PDF parsing

### AI Prompt Template:

```
You are a construction document analyst. Analyze this wall specification PDF.
Extract for each wall type:
- Wall Type ID (P1, W4, etc.)
- Materials used (with keywords: GYPSUM WALLBOARD, METAL STUDS, INSULATION, etc.)
- OC spacing (convert mm to inches if needed)
- Layer count (default 1, "Two Layers" = 2)
- Fire rating, STC rating if mentioned

Return JSON only.
```

### Acceptance Criteria:

- [ ] PDF is sent to OpenRouter API on "Generate" click
- [ ] Wall types are correctly extracted with IDs
- [ ] Materials are identified with correct keywords
- [ ] OC spacing is extracted (mm converted to inches)
- [ ] Layer count is correct
- [ ] Loading state shown during processing
- [ ] Errors are handled gracefully (API failure, bad PDF)

---

## Phase 3: Database Matching Service

> **Status**: `TODO`
> **Goal**: Match AI-extracted materials to `spec_database`, pull codes and costs.

### What gets built:

1. **Material matcher** - keyword search against DB descriptions
2. **Unit price converter** - normalize `mat_cost/per` to per-1-unit
3. **Section code mapper** - extend `csiSections.ts` if needed

### Files:

- [ ] `src/services/assembly/matchMaterials.ts`
- [ ] `src/services/assembly/unitConversion.ts`

### Key Logic:

```ts
// "1,000 LF" + matCost=450 -> unitPrice=0.45, unit="LF"
// "1 EA" + matCost=12.50 -> unitPrice=12.50, unit="EA"
function convertToUnitPrice(
  matCost: number,
  per: string,
): { unitPrice: number; unit: string };
```

### Acceptance Criteria:

- [ ] "METAL STUDS" matches correct DB row
- [ ] Unit prices correctly converted
- [ ] All 6 keywords find DB matches
- [ ] Graceful fallback when no match found

---

## Phase 4: Assembly Generator

> **Status**: `TODO`
> **Goal**: Combine PDF + Excel + DB into final assembly table rows.

### What gets built:

1. **Generator function** - takes all 3 inputs, produces assembly rows
2. **Assembly result table UI** - renders generated assemblies
3. **Editable cells** - Wst%, Qty overrides

### Files:

- [ ] `src/services/assembly/generateAssembly.ts`
- [ ] `src/components/features/project/AssemblyResultTable.tsx`
- [ ] `src/types/assembly.ts` (or extend `types/index.ts`)

### Key Logic:

- For each wall type (from PDF) x each height variant (from Excel):
  - Create assembly variant: `P1@10`, `P1@15`, etc.
  - For each material component: fill all columns from the 3 sources
  - Qty formulas: **placeholder until Dhruv Bhai provides**

### Acceptance Criteria:

- [ ] Assemblies generated for all wall type + height combos
- [ ] All columns populated correctly
- [ ] Wst% is editable
- [ ] Table renders cleanly

---

## Phase 5: Unit System Toggle

> **Status**: `TODO`
> **Goal**: Imperial/Metric toggle changes UOM column.

### Files:

- [ ] `src/hooks/useUnitSystem.ts`
- [ ] Update project toolbar
- [ ] Update assembly table UOM dropdown

### Acceptance Criteria:

- [ ] Toggle switches between Imperial and Metric
- [ ] UOM dropdown shows correct units per system
- [ ] Persists per project

---

## Phase 6: Three-View Toggle

> **Status**: `TODO`
> **Goal**: Wall Assembly | Takeoff Schedule | Both view buttons.

### Files:

- [ ] View toggle component
- [ ] Update project page layout

### Acceptance Criteria:

- [ ] Three buttons in project toolbar
- [ ] Each view renders correctly
- [ ] State persists during session

---

## Phase 7: Project Trash + CRON

> **Status**: `TODO`
> **Goal**: Soft delete with 15-day auto-cleanup.

### Files:

- [ ] Migration: add `deleted_at` to projects
- [ ] `src/app/api/projects/trash/route.ts`
- [ ] Supabase CRON/Edge Function
- [ ] Trash view UI

### Acceptance Criteria:

- [ ] Delete moves to trash (soft delete)
- [ ] Trash view shows deleted projects
- [ ] Restore works
- [ ] CRON cleans up after 15 days

---

## Database Schema (when needed)

```sql
-- Wall assemblies table (Phase 4)
CREATE TABLE wall_assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  assembly_code TEXT NOT NULL,
  height_variant NUMERIC,
  display_name TEXT NOT NULL,
  global_params JSONB,
  rows JSONB NOT NULL,
  unit_system TEXT DEFAULT 'imperial',
  source_pdf_name TEXT,
  source_excel_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Soft delete for projects (Phase 7)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
```

---

## File Map

```
src/
├── services/
│   ├── openrouter/
│   │   ├── client.ts                 # Phase 2
│   │   └── parseWallSpec.ts          # Phase 2
│   ├── takeoff/
│   │   └── parseOSTSheet.ts          # Phase 1  ← CURRENT
│   └── assembly/
│       ├── matchMaterials.ts         # Phase 3
│       ├── unitConversion.ts         # Phase 3
│       └── generateAssembly.ts       # Phase 4
├── types/
│   ├── takeoff.ts                    # Phase 1  ← CURRENT
│   ├── wallSpec.ts                   # Phase 2
│   └── assembly.ts                   # Phase 4
├── components/features/project/
│   ├── FileUploadZone.tsx            # Phase 1  ← CURRENT
│   ├── TakeoffPreview.tsx            # Phase 1  ← CURRENT
│   ├── WallAssemblyBuilder.tsx       # Phase 1  ← CURRENT
│   └── AssemblyResultTable.tsx       # Phase 4
├── hooks/
│   └── useUnitSystem.ts              # Phase 5
└── app/api/
    ├── parse-takeoff/route.ts        # Phase 1  ← CURRENT
    └── parse-pdf/route.ts            # Phase 2
```

---

## Pending Items

| Item                             | Owner      | Needed By |
| -------------------------------- | ---------- | --------- |
| Qty formulas                     | Dhruv Bhai | Phase 4   |
| Formula Basis column             | Dhruv Bhai | Phase 4   |
| OpenRouter API key               | Harsh      | Phase 2   |
| Sample OST Excel for testing     | Harsh      | Phase 1   |
| Sample Wall Spec PDF for testing | Harsh      | Phase 2   |

---

_Last updated: 2026-02-07_
