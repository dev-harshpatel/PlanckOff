# Rule-Based Material Matching — Implementation Plan

## Overview

Replace the AI-based material matching step (Step 2) with a deterministic rule-based system
backed by two new Excel-sourced databases. Also improve the PDF extraction step using a
3-tier parsing approach inspired by the Door-Project pipeline.

**Author:** dev-harshpatel  
**Status:** Planning — do not implement until reviewed  

---

## What Changes vs What Stays the Same

### Changes
- `src/app/api/match/route.ts` — logic inside, NOT the API contract
- `src/services/openrouter/matchMaterials.ts` — replaced entirely
- Two new Supabase tables: `material_database`, `labour_database`
- New import scripts to seed the tables from Excel
- New normalization utility: `src/lib/utils/materialNormalizer.ts`
- New matching engine: `src/services/matching/ruleBasedMatcher.ts`
- New cache functions for the two new tables
- PDF extraction step improvement (pdfjs-dist row reconstruction)

### Does NOT change
- `/api/extract` route contract (inputs/outputs identical)
- `/api/finalize` route contract (inputs/outputs identical)
- `/api/parse-takeoff` route contract (inputs/outputs identical)
- `/api/assembly-data` route contract (inputs/outputs identical)
- `PipelineContext` shape and progress tracking
- `ImportFilesModal` orchestration flow
- All DB table schemas for `assembly_extractions`, `material_matches`, `final_outputs`, `takeoff_outputs`
- `MaterialCosting`, `MatchedMaterial`, `MatchedLabor` type shapes
- `aggregateProjectCosts()` and all calculation utilities
- Reports, Labour, Materials, Markups tabs — zero UI changes in this phase

### The API contract for `/api/match` stays identical
Input:  `{ extraction: { assemblies }, extractionId?, projectId?, runId? }`  
Output: `{ success, result: { assemblies }, matchId, matchedCount }`

Only the internal implementation of how `matched_materials[]` and `matched_labor[]`
are populated changes. Everything downstream is unaffected.

---

## New Database Tables

### Table 1: `material_database`

Replaces / supplements `spec_database`. Sourced from `Drywall Database (6-17-2026).xlsx`.

```sql
CREATE TABLE material_database (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_num               INTEGER,
  category              TEXT NOT NULL,        -- 'FRAMING' | 'Drywall' | 'INSULATION' | etc.
  assembly_code         TEXT,                 -- future use, ignored in this phase
  code                  TEXT NOT NULL UNIQUE, -- primary key for lookups e.g. 'AN-18'
  wall_labour_code      TEXT,                 -- links to labour_database.labour_code
  ceiling_labour_code   TEXT,                 -- links to labour_database.labour_code
  type                  TEXT,                 -- 'Angle' | 'Stud' | 'Track' | 'Board' etc.
  description           TEXT NOT NULL,        -- 'Angle - 18mil (25ga)'
  section               TEXT,                 -- CSI section '05 40 00'
  size                  TEXT,                 -- '1-1/2" x 1-1/2" ( 10'' )'
  size_num              NUMERIC,              -- 10 (numeric part of size for formula calc)
  unit_price            NUMERIC DEFAULT 0,
  container_unit        TEXT,                 -- 'Piece' | 'Bundle' | 'EA'
  qty1_formula          TEXT,                 -- wall formula: '[LEN] * [LAYER] * (1 + [WST_FR])'
  uom1                  TEXT,                 -- 'LF' | 'SF' | 'EA'
  qty2_formula          TEXT,                 -- secondary wall formula
  uom2                  TEXT,
  qty1_formula_ceiling  TEXT,                 -- ceiling formula
  uom1_ceiling          TEXT,
  qty2_formula_ceiling  TEXT,
  uom2_ceiling          TEXT,
  notes                 TEXT,
  -- Computed matching fields (populated at import time, never updated by pipeline)
  search_keywords       TEXT[],               -- normalized terms for fast filtering
  size_mm               NUMERIC,              -- metric equivalent of size (null if not applicable)
  size_imperial         TEXT,                 -- canonical imperial size '5/8"' | '3-5/8"'
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_material_database_category ON material_database(category);
CREATE INDEX idx_material_database_code ON material_database(code);
CREATE INDEX idx_material_database_keywords ON material_database USING GIN(search_keywords);
```

### Table 2: `labour_database`

Sourced from `Labour Database (6-17-2026).xlsx`.

```sql
CREATE TABLE labour_database (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_code     TEXT NOT NULL,   -- 'LAB-FRM-STD' — NOT unique (multiple height bands share prefix)
  code            TEXT,            -- short code 'STD' | 'MED' | 'HI'
  description     TEXT NOT NULL,   -- 'Install Metal Studs (Walls up to 12ft)'
  category        TEXT NOT NULL,   -- 'Install Framing Wall' | 'Drywall Hanging Wall' | etc.
  ht_band         TEXT,            -- 'Standard' | 'Medium' | 'High' | 'Very High' | 'Extra High' | 'All'
  ht_min_ft       NUMERIC DEFAULT 0,
  ht_max_ft       NUMERIC DEFAULT 99,
  uom             TEXT,            -- 'LF' | 'SF' | 'EA'
  rate_per_uom    NUMERIC DEFAULT 0,
  qty1_formula    TEXT,            -- '[LEN] * (1 + [WST_FR])'
  qty1_uom        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_labour_database_code ON labour_database(labour_code);
CREATE INDEX idx_labour_database_category ON labour_database(category);
```

### Migration file
Create: `supabase/migrations/020_create_material_labour_databases.sql`

---

## Excel Import Scripts

### Script 1: `scripts/importMaterialDatabase.ts`

Reads `data/Drywall Database (6-17-2026).xlsx`, normalizes each row,
computes `search_keywords`, `size_mm`, `size_imperial`, then upserts into `material_database`.

**Row parsing rules:**
- Header row is at index 2 (0-based) — find dynamically by looking for row containing 'CODE' and 'DESCRIPTION'
- Skip section-label rows (rows where CODE column is empty)
- Map columns: `ROW_NUM → row_num`, `CATEGORY → category`, `CODE → code`, etc.
- `QTY1_FORMULA2 → qty1_formula_ceiling`, `UOM12 → uom1_ceiling`, etc.

**`search_keywords` computation per row (done at import, not at match time):**
```
keywords = [
  category.toLowerCase(),                  // 'framing' | 'drywall'
  type.toLowerCase(),                      // 'stud' | 'board' | 'angle'
  ...description.toLowerCase().split(' '), // individual words
  size_imperial (if computed),             // '5/8"' | '3-5/8"'
  size_mm (if applicable),                 // '16' | '92'
]
// deduplicated, stopwords removed ('and', 'the', 'of', '-', etc.)
```

### Script 2: `scripts/importLabourDatabase.ts`

Reads `Labour Database (6-17-2026).xlsx`, header at row index 1.
Upserts all rows into `labour_database`.

### How to run
```bash
npx tsx scripts/importMaterialDatabase.ts
npx tsx scripts/importLabourDatabase.ts
```

Both scripts use `supabaseAdmin` directly (not through repositories — these are one-off seed scripts).

---

## Normalization Utility

**File:** `src/lib/utils/materialNormalizer.ts`

This is the most critical utility. It must handle both metric AND imperial input
because different PDFs may use either.

### mm → imperial lookup table (exhaustive for drywall domain)
```typescript
const MM_TO_IMPERIAL: Record<number, string> = {
  13:  '1/2"',    // 12.7mm rounded
  16:  '5/8"',    // 15.9mm rounded
  19:  '3/4"',    // 19.1mm rounded
  25:  '1"',
  38:  '1-1/2"',
  41:  '1-5/8"',
  51:  '2"',
  64:  '2-1/2"',
  76:  '3"',
  89:  '3-1/2"',
  92:  '3-5/8"',
  102: '4"',
  152: '6"',
  203: '8"',
};
```

### Exported functions

```typescript
// Normalize any size expression to imperial string
// Input: '16 mm' | '16mm' | '5/8"' | '5/8 inch' | 16 (number in mm)
// Output: '5/8"' | null if unrecognized
export function normalizeToImperial(raw: string | number | null): string | null

// Extract dimension in mm from a string (returns null if not found)
export function extractMM(raw: string): number | null

// Normalize a material type string
// Input: "TYPE 'X'" | "TYPE X" | "Type-X" | "X"
// Output: 'Type X' | 'Type C' | 'Type MR' | null
export function normalizeBoardType(raw: string | null): string | null

// Map PDF category keywords to DB CATEGORY values
// Input: 'GYPSUM WALLBOARD' | 'STEEL STUDS' | 'BATT INSULATION'
// Output: 'Drywall' | 'FRAMING' | 'INSULATION' | etc.
export function mapToDBCategory(rawText: string): string | null

// Extract layer count from raw_text
// Input: '2 LAYERS 16 mm GYPSUM WALLBOARD TYPE X'
// Output: 2
export function extractLayerCount(rawText: string): number

// Master normalize — returns all extracted attributes from a PDF material line
export function normalizePDFMaterial(extracted: MaterialItem): NormalizedMaterial

export interface NormalizedMaterial {
  rawText: string;
  sizeImperial: string | null;   // '5/8"' | '3-5/8"'
  sizeMM: number | null;         // 16 | 92
  boardType: string | null;      // 'Type X' | 'Type C' | null
  category: string | null;       // 'Drywall' | 'FRAMING' | 'INSULATION'
  layerCount: number;            // 1 (default) | 2 | 3
  keywords: string[];            // normalized tokens for scoring
}
```

---

## Rule-Based Matching Engine

**File:** `src/services/matching/ruleBasedMatcher.ts`

### Scoring algorithm

For each extracted material, score every row in `material_database`:

```
score = 0

// Category match (most important — wrong category = wrong labour)
if (normalized.category === dbRow.category)    score += 4
if (category partial overlap)                  score += 2

// Size match
if (normalized.sizeImperial === dbRow.size_imperial)  score += 4
if (normalized.sizeMM present AND within ±2mm of dbRow.size_mm)  score += 3

// Type match (Type X / Type C / etc.)
if (normalized.boardType !== null AND dbRow.type includes boardType)  score += 3

// Keyword overlap
normalizedKeywords.forEach(kw => {
  if (dbRow.search_keywords.includes(kw))  score += 1
})
```

**Threshold:** score ≥ 6 = matched, score < 6 = flagged as unmatched.

**Tie-breaking:** When two rows have the same score, prefer:
1. Exact description substring match
2. Lower `row_num` (earlier in the DB = more common item)

### Unmatched handling

When no row meets the threshold:
- Set `matched_materials = []`
- Set `matched_labor = []`
- Add a flag to the assembly: `{ _unmatched: true, _raw_text: extracted.raw_text }`
- Pipeline continues — does not throw or fail
- The unmatched items will be visible in the UI (future phase)

### Labour lookup

Once a material DB row is matched:

```typescript
// 1. Get labour code from matched material row
const labourCode = isWall
  ? matchedRow.wall_labour_code
  : matchedRow.ceiling_labour_code;

// 2. If no labour code → no labour for this material (intentional, e.g. Angles)
if (!labourCode) return [];

// 3. Fetch ALL height bands for this labour code from labour_database
const allBands = await getLabourBandsByCode(labourCode);
// e.g. LAB-HNG-STD, LAB-HNG-MED, LAB-HNG-HI, LAB-HNG-VHI, LAB-HNG-XHI

// 4. Default: return the STD band (ht_min_ft = 0, ht_band = 'Standard')
// Store all bands in the output so the UI can swap them when user changes height
const defaultBand = allBands.find(b => b.ht_band === 'Standard') ?? allBands[0];

// 5. Output: matched_labor includes the default band
//    ALL bands stored as _labour_bands for UI height switching (future phase)
```

### Exported function

```typescript
export async function matchAssembliesByRules(
  extraction: { assemblies: unknown[] },
  assemblyType: 'wall' | 'ceiling' | 'auto',
): Promise<{ assemblies: unknown[]; stats: MatchStats }>

export interface MatchStats {
  total: number;
  matched: number;
  unmatched: number;
  unmatchedItems: { assemblyId: string; rawText: string }[];
}
```

---

## Updated `/api/match` Route

**File:** `src/app/api/match/route.ts`

Only the internal logic changes. The function signature, auth wrapper, response format,
and DB write stay identical.

```typescript
// BEFORE (current):
const result = await matchMaterialsToDatabase(extraction, database, apiKey, promptText);

// AFTER (new):
const result = await matchAssembliesByRules(extraction, 'auto');
```

Remove:
- `getMaterialDatabase()` call (replaced by direct `material_database` table query)
- `getResolvedAIPrompt(AI_PROMPT_KEYS.MATERIAL_MATCH)` call
- All OpenRouter/Gemini calls

Keep:
- `withAuth` wrapper
- `success()` / `failure()` response helpers
- `saveMaterialMatch()` repository call
- `updatePipelineRunStep()` tracking call
- Input validation

---

## Cache Layer Updates

**File:** `src/lib/cache/materialDbCache.ts`

Add two new cache functions alongside existing ones:

```typescript
// NEW: cache for material_database table
export async function getMaterialDatabaseNew(): Promise<MaterialDatabaseRow[]>
export async function invalidateMaterialDatabaseCache(): Promise<void>

// NEW: cache for labour_database table
export async function getLabourDatabase(): Promise<LabourDatabaseRow[]>
export async function invalidateLabourDatabaseCache(): Promise<void>
```

Cache keys:
- `material_database:all` — TTL 1 hour (same as existing spec_database cache)
- `labour_database:all` — TTL 1 hour

---

## New Repository Functions

**File:** `src/lib/db/materialDatabase.ts` (new file)

```typescript
export async function getAllMaterialDatabase(): Promise<DbResult<MaterialDatabaseRow[]>>
export async function getMaterialDatabaseByCategory(category: string): Promise<DbResult<MaterialDatabaseRow[]>>
export async function upsertMaterialDatabase(rows: Partial<MaterialDatabaseRow>[]): Promise<DbResult<void>>
```

**File:** `src/lib/db/labourDatabase.ts` (new file)

```typescript
export async function getAllLabourDatabase(): Promise<DbResult<LabourDatabaseRow[]>>
export async function getLabourBandsByCode(labourCode: string): Promise<DbResult<LabourDatabaseRow[]>>
export async function upsertLabourDatabase(rows: Partial<LabourDatabaseRow>[]): Promise<DbResult<void>>
```

Both follow the exact repository pattern from `database.md`:
- `supabaseAdmin` only
- Returns `{ data, error }` — never throws
- `toRow()` and `toDbRow()` transformers for snake_case ↔ camelCase

---

## New TypeScript Types

**File:** `src/types/index.ts` — add alongside existing types

```typescript
export interface MaterialDatabaseRow {
  id: string;
  rowNum: number;
  category: string;
  assemblyCode: string;
  code: string;
  wallLabourCode: string;
  ceilingLabourCode: string;
  type: string;
  description: string;
  section: string;
  size: string;
  sizeNum: number;
  unitPrice: number;
  containerUnit: string;
  qty1Formula: string;
  uom1: string;
  qty2Formula: string;
  uom2: string;
  qty1FormulaCeiling: string;
  uom1Ceiling: string;
  qty2FormulaCeiling: string;
  uom2Ceiling: string;
  notes: string;
  searchKeywords: string[];
  sizeMM: number | null;
  sizeImperial: string | null;
}

export interface LabourDatabaseRow {
  id: string;
  labourCode: string;
  code: string;
  description: string;
  category: string;
  htBand: string;
  htMinFt: number;
  htMaxFt: number;
  uom: string;
  ratePerUom: number;
  qty1Formula: string;
  qty1Uom: string;
  notes: string;
}
```

---

## PDF Extraction Improvement (Step 1)

This is a separate improvement, independent of the matching change. Do this after matching is stable.

**Reference:** `data/Door-Project-Pipeline.md`

### Current problem
Step 1 currently sends the entire PDF to Gemini as base64. For structured table PDFs like
`PlanckOff-Wall-Assembly.pdf`, this is wasteful and can hallucinate.

### 3-Tier approach to adopt

**TIER 0 — Deterministic table parser (no AI, no cost)**
- Use `pdfjs-dist` to extract text with X/Y coordinates
- Group text items at same Y-coordinate (±3px tolerance) into rows
- Sort items within each row left-to-right by X
- Detect table headers: `WALL TYPE NO.`, `WALL ASSEMBLY`, `CONSTRUCTION`, `FIRE RATING`, `STC RATING`
- Parse each row deterministically: assembly_id is first column, materials list is second column
- Output: same shape as current AI extraction

When to use: PDF contains keyword headers matching wall assembly schedule format.

**TIER 1 — AI extraction (current approach, becomes fallback)**
Keep existing Gemini extraction as fallback when TIER 0 detects unstructured text.

**TIER 2 — Visual fallback**
For scanned/image-based PDFs, render pages as images and send to Gemini vision.
Not implementing in this phase — add later if needed.

**New file:** `src/services/extraction/pdfTableParser.ts`
- Export: `tryDeterministicPDFParse(pdfBase64): ExtractionResult | null`
- Returns null if table structure not detected → caller falls through to TIER 1

**Updated `/api/extract`:**
```typescript
// Try TIER 0 first
const tier0Result = await tryDeterministicPDFParse(pdfBase64);
if (tier0Result) {
  // save and return — no Gemini call needed
}
// Fall through to existing TIER 1 (AI) extraction
```

---

## Implementation Order

Do these steps in strict order. Do not skip ahead.

### Phase 1 — Database Setup
1. Write `supabase/migrations/020_create_material_labour_databases.sql`
2. Run migration against Supabase
3. Write `scripts/importMaterialDatabase.ts`
4. Write `scripts/importLabourDatabase.ts`
5. Run both import scripts, verify row counts in Supabase dashboard
6. Write `src/lib/db/materialDatabase.ts` repository
7. Write `src/lib/db/labourDatabase.ts` repository
8. Add types to `src/types/index.ts`

### Phase 2 — Normalization Utility
9. Write `src/lib/utils/materialNormalizer.ts`
10. Write unit tests for: `normalizeToImperial`, `normalizeBoardType`, `mapToDBCategory`
    covering both metric and imperial input cases

### Phase 3 — Matching Engine
11. Write `src/services/matching/ruleBasedMatcher.ts`
12. Test manually against sample extraction output from
    `data/output/debug/*/08_extraction_merged.json`
13. Compare results against existing AI match output in
    `data/output/debug/*/11_match_result.json`
14. Tune scoring thresholds until results are equal or better

### Phase 4 — Wire Into Pipeline
15. Update `src/app/api/match/route.ts` to call `matchAssembliesByRules` instead of AI
16. Add new cache functions to `src/lib/cache/materialDbCache.ts`
17. Remove AI prompt resolution from match route
18. End-to-end test: upload the sample PDF + Excel, verify final_output JSON looks correct

### Phase 5 — PDF Extraction Improvement (separate, after Phase 4 is stable)
19. Write `src/services/extraction/pdfTableParser.ts`
20. Update `/api/extract` with 3-tier logic
21. Test against `PlanckOff-Wall-Assembly.pdf`

---

## What to Watch Out For

### 1. `matched_labor` shape must stay identical
The finalize step (`mergeTakeoffWithMaterialMatch.ts`) reads `matched_labor` from the match
output and calls `expandLaborForHeight()` on it. It matches labor by description keywords
like `"(Walls < 12 ft)"`. The new labour DB rows must produce descriptions in the same
format, OR `expandLaborForHeight()` must be updated to use `ht_band` instead.

**Verify this before Phase 4 step 17.**

### 2. `spec_database` vs `material_database`
`spec_database` still exists and is used by `aggregateProjectCosts()` via the `priceMap`
(to resolve `unit_cost` for display). Do NOT drop `spec_database`.
The new `material_database` is for matching only. After matching, the `code` from
`material_database` is used to look up the price from `spec_database`.

**The two tables must have overlapping `code` values.** When importing `material_database`,
verify that its `code` values either (a) already exist in `spec_database`, or (b) we add
them to `spec_database` too. Decide this during Phase 1 step 5.

### 3. Scoring threshold
The threshold of 6 is an initial estimate. Tune it during Phase 3 step 13.
Too high → too many false unmatcheds. Too low → wrong matches with high confidence.
Run against all debug output files in `data/output/debug/` before finalizing.

### 4. Labour code may be empty (intentional)
Many FRAMING rows have empty `WALL_LABOUR_CODE`. This is intentional — Angles, special
tracks etc. don't have direct install labour. The matcher must handle `null`/empty labour
code gracefully and simply return `matched_labor = []`.

### 5. Do not change `MatchedMaterial` or `MatchedLabor` type shapes
`projectCosting.ts` reads specific fields: `code`, `unit_cost`, `quantity` from
`MatchedMaterial`, and `code`, `unit_cost`, `quantity` from `MatchedLabor`.
Any new fields we add (like `_labour_bands`, `_unmatched`) must be optional extras
that the existing calculation code simply ignores.

### 6. The `_labour_bands` field is for future UI only
When we store all height bands in the match output, wrap them in a field prefixed with `_`
to signal it is UI metadata, not a calculation input. This prevents `aggregateProjectCosts`
from accidentally picking it up.

---

## Files Created / Modified Summary

| Action | File |
|--------|------|
| NEW | `supabase/migrations/020_create_material_labour_databases.sql` |
| NEW | `scripts/importMaterialDatabase.ts` |
| NEW | `scripts/importLabourDatabase.ts` |
| NEW | `src/lib/db/materialDatabase.ts` |
| NEW | `src/lib/db/labourDatabase.ts` |
| NEW | `src/lib/utils/materialNormalizer.ts` |
| NEW | `src/services/matching/ruleBasedMatcher.ts` |
| NEW | `src/services/extraction/pdfTableParser.ts` (Phase 5) |
| MODIFIED | `src/app/api/match/route.ts` (internal logic only) |
| MODIFIED | `src/lib/cache/materialDbCache.ts` (add 2 new cache functions) |
| MODIFIED | `src/types/index.ts` (add 2 new interfaces) |
| NO CHANGE | `src/app/api/extract/route.ts` (until Phase 5) |
| NO CHANGE | `src/app/api/finalize/route.ts` |
| NO CHANGE | `src/app/api/parse-takeoff/route.ts` |
| NO CHANGE | `src/app/api/assembly-data/route.ts` |
| NO CHANGE | `src/context/PipelineContext.tsx` |
| NO CHANGE | `src/components/features/project/ImportFilesModal.tsx` |
| NO CHANGE | `src/lib/utils/projectCosting.ts` |
| NO CHANGE | All Reports, Labour, Materials, Markups components |
| DELETED | `src/services/openrouter/matchMaterials.ts` (after Phase 4 confirmed working) |
