# Architecture 1 — Implementation Plan

> **How to use this document:** Each phase is a self-contained unit of work. When you say "build phase N", implementation starts on that phase only. Phases must be executed in order — each phase depends on the previous one being complete. Never skip a phase or merge two phases into one session.

---

## Quick Reference — Phase Summary

| Phase | Name | LLM Calls Changed | Behavior Change | Risk |
|-------|------|-------------------|-----------------|------|
| 1 | Infrastructure & Constants | None | None | Zero |
| 2 | Chunked Extraction | extract: 1→7 | Yes (behind flag) | Low |
| 3 | Code Matching Engine | match: N→0 | Yes (behind flag) | Medium |
| 4 | Debug Output Wiring | None | Dev-only files | Zero |
| 5 | UI Sub-Step Progress | None | Visual only | Low |
| 6 | Promote & Clean Up | None | Flag removed | Low |

---

## Baseline — Current State (Before Any Changes)

| File | Current Role |
|------|-------------|
| `src/app/api/extract/route.ts` | Receives PDF → calls `extractAssembliesFromPDF()` (1 Pro LLM call) → saves to DB |
| `src/app/api/match/route.ts` | Receives extraction → calls `matchMaterialsToDatabase()` (N÷15 Flash LLM calls) → saves to DB |
| `src/app/api/finalize/route.ts` | Code merge (Strategy 1) or AI fallback (Strategy 2) — **unchanged in all phases** |
| `src/services/openrouter/extractAssemblies.ts` | Single LLM call: PDF + full prompt → JSON |
| `src/services/openrouter/matchMaterials.ts` | Batched LLM: extractions + full DB → matched JSON |
| `src/lib/db/aiPrompts.ts` | Two prompt keys: `pdf_extraction`, `material_match` |
| `src/lib/utils/localJsonStorage.ts` | Writes `data/output/{folder}/{filename}.json` in dev |
| `src/context/PipelineContext.tsx` | Tracks `step: 0|1|2|3`, `status`, `runId` |
| `prompt/extractAssemblies.txt` | Single extraction prompt (all 10 categories at once) |
| `prompt/matchMaterials.txt` | Single matching prompt (full DB + all assemblies) |

---

## Phase 1 — Infrastructure & Constants

**Goal:** Add all new constants, prompt keys, type definitions, and extend existing utilities. Zero behavior change. Everything behind this phase is infrastructure that later phases build on.

**When complete:** The app still works exactly as before. No pipeline behavior changes.

---

### 1.1 — Extend `AI_PROMPT_KEYS` in `src/lib/db/aiPrompts.ts`

**File:** `src/lib/db/aiPrompts.ts`  
**Change type:** Modify existing file

Add 7 new prompt keys alongside the existing two. Also add them to `PROMPT_FILE_BY_KEY` so the file-based fallback works.

**Exact changes:**

```typescript
// BEFORE:
export const AI_PROMPT_KEYS = {
  PDF_EXTRACTION: "pdf_extraction",
  MATERIAL_MATCH: "material_match",
} as const;

const PROMPT_FILE_BY_KEY: Record<AIPromptKey, string> = {
  [AI_PROMPT_KEYS.PDF_EXTRACTION]: path.join(process.cwd(), "prompt", "extractAssemblies.txt"),
  [AI_PROMPT_KEYS.MATERIAL_MATCH]: path.join(process.cwd(), "prompt", "matchMaterials.txt"),
};

// AFTER:
export const AI_PROMPT_KEYS = {
  PDF_EXTRACTION:    "pdf_extraction",
  MATERIAL_MATCH:    "material_match",   // kept — legacy mode still uses it
  EXTRACT_SKELETON:          "extract_skeleton",
  EXTRACT_GYPSUM:            "extract_gypsum",
  EXTRACT_STEEL_FRAMING:     "extract_steel_framing",
  EXTRACT_INSULATION:        "extract_insulation",
  EXTRACT_MOISTURE_CONTROL:  "extract_moisture_control",
  EXTRACT_WOOD_SUBSTRATES:   "extract_wood_substrates",
  EXTRACT_SPECIALTY:         "extract_specialty",
} as const;

const PROMPT_FILE_BY_KEY: Record<AIPromptKey, string> = {
  [AI_PROMPT_KEYS.PDF_EXTRACTION]:           path.join(process.cwd(), "prompt", "extractAssemblies.txt"),
  [AI_PROMPT_KEYS.MATERIAL_MATCH]:           path.join(process.cwd(), "prompt", "matchMaterials.txt"),
  [AI_PROMPT_KEYS.EXTRACT_SKELETON]:         path.join(process.cwd(), "prompt", "extract_skeleton.txt"),
  [AI_PROMPT_KEYS.EXTRACT_GYPSUM]:           path.join(process.cwd(), "prompt", "extract_gypsum.txt"),
  [AI_PROMPT_KEYS.EXTRACT_STEEL_FRAMING]:    path.join(process.cwd(), "prompt", "extract_steel_framing.txt"),
  [AI_PROMPT_KEYS.EXTRACT_INSULATION]:       path.join(process.cwd(), "prompt", "extract_insulation.txt"),
  [AI_PROMPT_KEYS.EXTRACT_MOISTURE_CONTROL]: path.join(process.cwd(), "prompt", "extract_moisture_control.txt"),
  [AI_PROMPT_KEYS.EXTRACT_WOOD_SUBSTRATES]:  path.join(process.cwd(), "prompt", "extract_wood_substrates.txt"),
  [AI_PROMPT_KEYS.EXTRACT_SPECIALTY]:        path.join(process.cwd(), "prompt", "extract_specialty.txt"),
};
```

> `AIPromptKey` type is derived from `typeof AI_PROMPT_KEYS[keyof typeof AI_PROMPT_KEYS]` — this update automatically widens the union type. No other type changes needed.

---

### 1.2 — Create `src/constants/extractionCategories.ts`

**File:** `src/constants/extractionCategories.ts`  
**Change type:** New file

This is the single source of truth for all category-related constants used by both the extraction and matching engines.

```typescript
// src/constants/extractionCategories.ts

/**
 * The 10 material categories the pipeline extracts and matches.
 * Order here = order in merged output (do not change without updating UI).
 */
export const EXTRACT_CATEGORIES = [
  'gypsum_board',
  'gypsum_sheathing',
  'steel_framing',
  'insulation',
  'vapor_barriers',
  'sealants',
  'plywood',
  'blocking_and_bracing',
  'steel_deck',
  'trim_and_accessories',
] as const;

export type ExtractCategory = typeof EXTRACT_CATEGORIES[number];

/**
 * Maps each extraction chunk ID → the categories it is responsible for.
 * Used by mergeExtractionChunks to know which category keys to copy from each chunk result.
 */
export const CHUNK_CATEGORY_MAP: Record<string, ExtractCategory[]> = {
  gypsum:          ['gypsum_board', 'gypsum_sheathing'],
  steel_framing:   ['steel_framing'],
  insulation:      ['insulation'],
  moisture_control:['vapor_barriers', 'sealants'],
  wood_substrates: ['plywood', 'blocking_and_bracing'],
  specialty:       ['steel_deck', 'trim_and_accessories'],
};

/**
 * Maps extraction category → DB category column values (spec_database.category).
 * Used by buildMaterialDbIndex to filter DB rows per category.
 * Keep in sync with actual category values in spec_database.
 */
export const CATEGORY_DB_MAP: Record<ExtractCategory, string[]> = {
  gypsum_board:          ['GWB', 'Drywall', 'Gypsum Board', 'Gypsum Wallboard'],
  gypsum_sheathing:      ['Gypsum Sheathing', 'Sheathing', 'Glass Mat Sheathing'],
  steel_framing:         ['Framing', 'Steel Framing', 'Light Gauge Framing', 'Metal Stud'],
  insulation:            ['Insulation', 'Batt Insulation', 'Spray Foam', 'Mineral Wool', 'Rock Wool'],
  vapor_barriers:        ['Vapor Barrier', 'Air Barrier', 'Polyethylene'],
  sealants:              ['Sealant', 'Acoustical Sealant', 'Firestop Sealant', 'Caulk'],
  plywood:               ['Plywood', 'OSB', 'Wood Panel', 'Wood Sheathing'],
  blocking_and_bracing:  ['Blocking', 'Bracing', 'Wood Blocking', 'Solid Blocking'],
  steel_deck:            ['Steel Deck', 'Metal Deck', 'Roof Deck'],
  trim_and_accessories:  ['Trim', 'Corner Bead', 'Control Joint', 'Accessories', 'J-Trim'],
};

/**
 * Semantic mapping: for each category, which DB column holds each physical property.
 * Used by the code scoring engine to know where to find thickness, depth, spacing, r_value.
 *
 * null = that property does not exist as a column for this category (look in description or skip).
 */
export const DB_FIELD_SEMANTICS: Record<ExtractCategory, {
  /** DB column that holds the thickness/size of this product */
  thickness: 'size' | 'width' | 'description' | null;
  /** DB column that holds the depth (stud cavity, framing depth) */
  depth: 'width' | 'size' | null;
  /** DB column that holds OC spacing */
  spacing: 'size' | 'screw_spacing' | null;
  /** Where R-value is stored */
  rValue: 'description' | null;
}> = {
  gypsum_board:          { thickness: 'size',        depth: null,    spacing: null,           rValue: null },
  gypsum_sheathing:      { thickness: 'size',        depth: null,    spacing: null,           rValue: null },
  steel_framing:         { thickness: null,           depth: 'width', spacing: 'size',         rValue: null },
  insulation:            { thickness: 'size',        depth: 'width', spacing: null,           rValue: 'description' },
  vapor_barriers:        { thickness: 'size',        depth: null,    spacing: null,           rValue: null },
  sealants:              { thickness: null,           depth: null,    spacing: null,           rValue: null },
  plywood:               { thickness: 'size',        depth: null,    spacing: null,           rValue: null },
  blocking_and_bracing:  { thickness: 'size',        depth: 'width', spacing: null,           rValue: null },
  steel_deck:            { thickness: null,           depth: null,    spacing: 'screw_spacing', rValue: null },
  trim_and_accessories:  { thickness: null,           depth: null,    spacing: null,           rValue: null },
};

/**
 * R-value lookup by stud cavity depth (inches).
 * Used when extracted insulation item has no r_value but has depth.
 * Source: ASHRAE / industry standard batt sizing.
 * Tolerance: ±0.25" for match.
 */
export const CAVITY_DEPTH_TO_RVALUE: Array<{ depthIn: number; rValue: number }> = [
  { depthIn: 3.5,   rValue: 11 },  // 2x4 stud (nominal)
  { depthIn: 3.625, rValue: 13 },  // 3-5/8" metal stud
  { depthIn: 4.0,   rValue: 13 },  // 4" stud
  { depthIn: 5.5,   rValue: 21 },  // 5-1/2" stud
  { depthIn: 6.0,   rValue: 19 },  // 6" stud
  { depthIn: 7.25,  rValue: 25 },  // 7-1/4" stud
  { depthIn: 9.25,  rValue: 30 },  // 9-1/4" stud
];

/**
 * Default steel framing gauge by wall height.
 * Source: USA baseline — IBC, ASTM C645, ASTM C955.
 */
export const HEIGHT_TO_GAUGE: Array<{ maxFt: number; gauge: string; milThickness: number }> = [
  { maxFt: 12,  gauge: '25', milThickness: 18 },
  { maxFt: 20,  gauge: '20', milThickness: 30 },
  { maxFt: 9999, gauge: '18', milThickness: 43 },
];

/** Returns the default gauge string (e.g. "25") for a given height in feet. */
export function getDefaultGaugeForHeight(heightFt: number): string {
  return HEIGHT_TO_GAUGE.find(h => heightFt <= h.maxFt)?.gauge ?? '18';
}
```

---

### 1.3 — Extend `src/lib/utils/localJsonStorage.ts`

**File:** `src/lib/utils/localJsonStorage.ts`  
**Change type:** Modify existing file

Add new folder types for chunked extraction sub-steps and per-run debug output. The existing folders and behavior are unchanged.

**Exact changes — add to the `JsonOutputFolder` union type and add new `writeDebugFile` helper:**

```typescript
// BEFORE:
export type JsonOutputFolder =
  | "assembly"
  | "takeoff"
  | "final_output"
  | "material_match";

// AFTER:
export type JsonOutputFolder =
  | "assembly"
  | "takeoff"
  | "final_output"
  | "material_match"
  | "debug_extraction"
  | "debug_matching";
```

Also add a new function `writeRunDebugFile` at the bottom of the file (existing `writeJsonToLocal` is unchanged):

```typescript
/**
 * Write a debug file scoped to a specific pipeline run.
 * Creates: data/output/debug/{runId}/{filename}.json
 * Only runs in development. Non-fatal if it fails.
 */
export const writeRunDebugFile = async (
  runId: string,
  filename: string,
  data: unknown,
): Promise<void> => {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const dir = path.join(OUTPUT_BASE, "debug", runId);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`[debug] Written: data/output/debug/${runId}/${filename}`);
  } catch {
    // Non-fatal — DB always has the real data
  }
};
```

---

### 1.4 — Add `subStepLabel` to `src/context/PipelineContext.tsx`

**File:** `src/context/PipelineContext.tsx`  
**Change type:** Modify existing file

Add three new fields to the context: `subStepLabel`, `subStepIndex`, `subStepTotal`. These are set by the route handler via `setProgress` extension and allow the UI to show fine-grained progress. All new fields are nullable so there is no breaking change.

**Exact changes:**

```typescript
// In PipelineContextValue interface — add after `error: string | null`:
subStepLabel: string | null;
subStepIndex: number | null;
subStepTotal: number | null;
setSubStep: (label: string | null, index: number | null, total: number | null) => void;

// New useState hooks in PipelineProvider:
const [subStepLabel, setSubStepLabelState] = useState<string | null>(null);
const [subStepIndex, setSubStepIndexState] = useState<number | null>(null);
const [subStepTotal, setSubStepTotalState] = useState<number | null>(null);

// New callback:
const setSubStep = useCallback(
  (label: string | null, index: number | null, total: number | null) => {
    setSubStepLabelState(label);
    setSubStepIndexState(index);
    setSubStepTotalState(total);
  },
  [],
);

// In resetProgress — add:
setSubStepLabelState(null);
setSubStepIndexState(null);
setSubStepTotalState(null);

// In the value object — add:
subStepLabel,
subStepIndex,
subStepTotal,
setSubStep,
```

---

### 1.5 — Create 7 Extraction Prompt Files

**Location:** `prompt/` directory  
**Change type:** New files (text prompts only, no TypeScript)

Create the following empty-but-valid placeholder prompt files. They will be written with real content during Phase 2. Placeholders allow `getResolvedAIPrompt()` to resolve them without errors.

**Files to create:**

**`prompt/extract_skeleton.txt`**
```
You are a construction document reader. Read this PDF and list every wall and ceiling assembly.

For each assembly, return ONLY:
- assembly_id (e.g. W14, WE3, C01 — the short alphanumeric tag)
- assembly_type ("Interior Walls" | "Exterior Walls" | "Ceiling" | "BulkHead")
- fire_rating (exact text or null)
- stc_rating (exact text or null)

Do NOT extract any materials yet. Only IDs, types, and ratings.
Untagged assemblies: "UN-TAGGED-WALL-1", "UN-TAGGED-CEILING-1", etc.

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","assembly_type":"string","fire_rating":"string|null","stc_rating":"string|null"}]}
```

**`prompt/extract_gypsum.txt`**
```
You are a construction document reader. Read this PDF and extract ONLY gypsum_board and gypsum_sheathing items.

gypsum_board = interior gypsum wallboard, drywall, Type X, Type C, shaftliner (used as interior finish).
gypsum_sheathing = exterior glass-mat faced gypsum sheathing (used on exterior side of studs).
Do NOT extract: steel framing, insulation, plywood, vapor barriers, sealants, trim, or any other materials.

You will be given the assembly list (IDs only). For each assembly, extract its gypsum_board and gypsum_sheathing arrays.
If an assembly has no items in a category, return an empty array for that category.

Each item: raw_text (exact verbatim), thickness (mm or inches as shown — do not convert), type (e.g. "Type X", "Regular", "Shaftliner"), layers (integer, default 1), description (brief).

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","gypsum_board":[{"raw_text":"string","thickness":number|null,"type":"string|null","layers":number,"description":"string|null"}],"gypsum_sheathing":[...same shape...]}]}
```

**`prompt/extract_steel_framing.txt`**
```
You are a construction document reader. Read this PDF and extract ONLY steel_framing items.

steel_framing = metal studs, metal tracks, CH studs, furring channels, steel joists, steel angles, wire ties.
Do NOT extract: gypsum board, insulation, plywood, vapor barriers, sealants, trim, or any other materials.

Each item: raw_text (exact verbatim), type ("stud"|"track"|"ch_stud"|"furring"|"joist"|"angle"), depth (inches as shown), gauge (e.g. "20", "25", "18" — digits only, no "ga"), spacing (OC spacing — mm or inches as shown), description (brief).

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","steel_framing":[{"raw_text":"string","type":"string|null","depth":number|null,"gauge":"string|null","spacing":number|null,"description":"string|null"}]}]}
```

**`prompt/extract_insulation.txt`**
```
You are a construction document reader. Read this PDF and extract ONLY insulation items.

insulation = batt insulation, rock wool batt, semi-rigid mineral wool, spray foam, sound batts.
A single assembly can have BOTH batt insulation AND semi-rigid mineral wool — extract each as a SEPARATE entry.
Do NOT extract: rigid insulation boards, gypsum, framing, vapor barriers, sealants, or other materials.

Each item: raw_text (exact verbatim), type ("batt"|"semi_rigid"|"spray_foam"|"sound_batt"), r_value (e.g. "R-19", "R19" — include the R prefix), depth (stud cavity depth in inches or mm as shown), thickness (if stated separately from depth), description (brief).

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","insulation":[{"raw_text":"string","type":"string|null","r_value":"string|null","depth":number|null,"thickness":number|null,"description":"string|null"}]}]}
```

**`prompt/extract_moisture_control.txt`**
```
You are a construction document reader. Read this PDF and extract ONLY vapor_barriers and sealants items.

vapor_barriers = poly vapour barrier, polyethylene sheeting, air barriers.
sealants = acoustic sealant, firestop sealant, caulk. (Do NOT extract the sealant type — just capture what the spec says verbatim.)
Do NOT extract: gypsum, framing, insulation, plywood, trim, or other materials.

Each item: raw_text (exact verbatim), type (brief descriptor from spec text), description (brief).

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","vapor_barriers":[{"raw_text":"string","type":"string|null","description":"string|null"}],"sealants":[{"raw_text":"string","type":"string|null","description":"string|null"}]}]}
```

**`prompt/extract_wood_substrates.txt`**
```
You are a construction document reader. Read this PDF and extract ONLY plywood and blocking_and_bracing items.

plywood = plywood sheets, OSB panels, wood sheathing panels.
blocking_and_bracing = wood blocking, wood bracing, solid blocking between studs.
Do NOT extract: gypsum, framing, insulation, vapor barriers, sealants, trim, or other materials.

Each item: raw_text (exact verbatim), thickness (inches or mm as shown), type (grade or species if stated), description (brief).

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","plywood":[{"raw_text":"string","thickness":number|null,"type":"string|null","description":"string|null"}],"blocking_and_bracing":[{"raw_text":"string","thickness":number|null,"type":"string|null","description":"string|null"}]}]}
```

**`prompt/extract_specialty.txt`**
```
You are a construction document reader. Read this PDF and extract ONLY steel_deck and trim_and_accessories items.

steel_deck = steel roof deck, metal floor deck, corrugated metal deck panels.
trim_and_accessories = corner bead, J-trim, control joints, expansion joints, reveal moulding.
Do NOT extract: gypsum, framing, insulation, plywood, vapor barriers, sealants, or other materials.

Each item: raw_text (exact verbatim), type (brief descriptor), description (brief).

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","steel_deck":[{"raw_text":"string","type":"string|null","description":"string|null"}],"trim_and_accessories":[{"raw_text":"string","type":"string|null","description":"string|null"}]}]}
```

---

### 1.6 — Update `.gitignore`

**File:** `.gitignore`  
**Change type:** Append one line

```
# Pipeline debug output (local dev only)
data/output/debug/
```

> The existing `/data-extract` entry is separate — do not remove it.

---

### Phase 1 — Acceptance Criteria

- [ ] App starts and runs without TypeScript errors
- [ ] `AI_PROMPT_KEYS.EXTRACT_SKELETON` is defined and importable
- [ ] `getResolvedAIPrompt(AI_PROMPT_KEYS.EXTRACT_GYPSUM)` returns the placeholder prompt text without error
- [ ] `EXTRACT_CATEGORIES`, `CHUNK_CATEGORY_MAP`, `CATEGORY_DB_MAP`, `DB_FIELD_SEMANTICS` are importable from `@/constants/extractionCategories`
- [ ] `usePipeline()` returns `subStepLabel`, `subStepIndex`, `subStepTotal`, `setSubStep` without TypeScript errors
- [ ] `writeRunDebugFile()` is importable from `@/lib/utils/localJsonStorage`
- [ ] Existing pipeline (extract → match → finalize) still works exactly as before

### Phase 1 — Do NOT Touch

- `src/app/api/extract/route.ts`
- `src/app/api/match/route.ts`
- `src/app/api/finalize/route.ts`
- `src/services/openrouter/extractAssemblies.ts`
- `src/services/openrouter/matchMaterials.ts`
- `src/components/features/project/ImportFilesModal.tsx`
- Any existing prompt files

---

## Phase 2 — Chunked Extraction

**Goal:** Replace the single `extractAssembliesFromPDF()` call with 7 focused sub-step calls. The extraction route gets a `mode` query parameter: `?mode=chunked` (new behaviour) and `?mode=legacy` (current behaviour, kept forever as fallback).

The final `ExtractionResult` saved to DB is identical in shape regardless of mode. The match step receives the same data either way.

**Prerequisite:** Phase 1 complete.

---

### 2.1 — Create `src/services/extraction/extractAssemblySkeleton.ts`

**File:** `src/services/extraction/extractAssemblySkeleton.ts`  
**Change type:** New file

```typescript
/**
 * Sub-step 1.0 — Extract assembly skeleton (IDs, types, ratings only).
 * One lightweight LLM call. Output anchors all subsequent category sub-steps.
 */
import { repairJSONForAssemblyExtraction, stripMarkdownAndTrim } from "@/lib/utils/jsonRepair";

export interface AssemblySkeleton {
  assembly_id: string;
  assembly_type: string;
  fire_rating: string | null;
  stc_rating: string | null;
}

export async function extractAssemblySkeleton(
  pdfBase64: string,
  apiKey: string,
  promptText: string,
): Promise<AssemblySkeleton[]> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 4096,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`[skeleton] OpenRouter error (${response.status}): ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage ?? {};
  console.log(`[skeleton] ${usage.total_tokens ?? "?"} tokens — ${raw.length} chars`);

  const cleaned = stripMarkdownAndTrim(raw);
  let parsed: { assemblies?: AssemblySkeleton[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = JSON.parse(repairJSONForAssemblyExtraction(cleaned));
  }

  const assemblies = (parsed.assemblies ?? []).filter(
    (a) => typeof a.assembly_id === "string" && a.assembly_id.trim() !== "",
  );

  console.log(`[skeleton] Found ${assemblies.length} assemblies: ${assemblies.map(a => a.assembly_id).join(", ")}`);
  return assemblies;
}
```

---

### 2.2 — Create `src/services/extraction/extractCategoryChunk.ts`

**File:** `src/services/extraction/extractCategoryChunk.ts`  
**Change type:** New file

```typescript
/**
 * Sub-steps 1.1–1.6 — Extract one category group from the PDF.
 * Each call receives: PDF + skeleton (assembly list) + focused category prompt.
 * Returns partial assembly objects containing only the extracted category fields.
 */
import { repairJSONForAssemblyExtraction, stripMarkdownAndTrim } from "@/lib/utils/jsonRepair";
import type { AssemblySkeleton } from "./extractAssemblySkeleton";
import type { ExtractCategory } from "@/constants/extractionCategories";

export interface CategoryChunkResult {
  assembly_id: string;
  [category: string]: unknown; // e.g. steel_framing: [...], insulation: [...]
}

export async function extractCategoryChunk(
  pdfBase64: string,
  apiKey: string,
  promptText: string,
  skeleton: AssemblySkeleton[],
  chunkLabel: string, // e.g. "gypsum", "steel_framing" — for logging only
): Promise<CategoryChunkResult[]> {
  // Append skeleton to the prompt so the model knows which assembly IDs to fill
  const skeletonContext = `\nASSEMBLY LIST (IDs only — populate these):\n${JSON.stringify(
    skeleton.map(s => ({ assembly_id: s.assembly_id, assembly_type: s.assembly_type })),
  )}`;

  const fullPromptText = promptText + skeletonContext;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 16384,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: fullPromptText },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`[chunk:${chunkLabel}] OpenRouter error (${response.status}): ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage ?? {};
  console.log(`[chunk:${chunkLabel}] ${usage.total_tokens ?? "?"} tokens — ${raw.length} chars`);

  const cleaned = stripMarkdownAndTrim(raw);
  let parsed: { assemblies?: CategoryChunkResult[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = JSON.parse(repairJSONForAssemblyExtraction(cleaned));
  }

  const validIds = new Set(skeleton.map(s => s.assembly_id));
  const results = (parsed.assemblies ?? []).filter(
    (a) => typeof a.assembly_id === "string" && validIds.has(a.assembly_id),
  );

  console.log(`[chunk:${chunkLabel}] Populated ${results.length}/${skeleton.length} assemblies`);
  return results;
}
```

---

### 2.3 — Create `src/services/extraction/mergeExtractionChunks.ts`

**File:** `src/services/extraction/mergeExtractionChunks.ts`  
**Change type:** New file

```typescript
/**
 * Merge extraction skeleton + category chunk results into a single AssemblyData[].
 * The output shape is identical to what extractAssembliesFromPDF() produces today.
 */
import type { AssemblySkeleton } from "./extractAssemblySkeleton";
import type { CategoryChunkResult } from "./extractCategoryChunk";
import { CHUNK_CATEGORY_MAP, EXTRACT_CATEGORIES, type ExtractCategory } from "@/constants/extractionCategories";

function buildEmptyMaterials(): Record<ExtractCategory, unknown[]> {
  return Object.fromEntries(EXTRACT_CATEGORIES.map(c => [c, []])) as Record<ExtractCategory, unknown[]>;
}

export function mergeExtractionChunks(
  skeleton: AssemblySkeleton[],
  chunks: Record<string, CategoryChunkResult[]>,
): unknown[] {
  return skeleton.map((skel) => {
    const materials = buildEmptyMaterials();

    for (const [chunkId, chunkResults] of Object.entries(chunks)) {
      const chunkAssembly = chunkResults.find(r => r.assembly_id === skel.assembly_id);
      if (!chunkAssembly) continue;

      const ownedCategories = CHUNK_CATEGORY_MAP[chunkId] ?? [];
      for (const cat of ownedCategories) {
        const items = chunkAssembly[cat];
        if (Array.isArray(items)) {
          materials[cat] = items.filter(
            // Drop items with null/empty raw_text — same pre-filter as current matchMaterials.ts
            (item: unknown) => {
              const i = item as Record<string, unknown>;
              return i.raw_text != null && String(i.raw_text).trim() !== "";
            },
          );
        }
      }
    }

    return {
      assembly_id: skel.assembly_id,
      assembly_type: skel.assembly_type,
      fire_rating: skel.fire_rating,
      stc_rating: skel.stc_rating,
      materials,
    };
  });
}
```

---

### 2.4 — Modify `src/app/api/extract/route.ts`

**File:** `src/app/api/extract/route.ts`  
**Change type:** Modify existing file — add `?mode=chunked` path alongside existing `?mode=legacy`

**Logic to add:**

```typescript
// At the top — add new imports:
import { AI_PROMPT_KEYS, getResolvedAIPrompt } from "@/lib/db/aiPrompts";
import { extractAssemblySkeleton } from "@/services/extraction/extractAssemblySkeleton";
import { extractCategoryChunk } from "@/services/extraction/extractCategoryChunk";
import { mergeExtractionChunks } from "@/services/extraction/mergeExtractionChunks";
import { CHUNK_CATEGORY_MAP } from "@/constants/extractionCategories";
import { writeRunDebugFile } from "@/lib/utils/localJsonStorage";

// In the POST handler, after parsing body and validating pdfBase64:
const url = new URL(req.url);
const mode = url.searchParams.get("mode") ?? "chunked"; // chunked is default from Phase 6

// --- LEGACY MODE (unchanged current behaviour) ---
if (mode === "legacy") {
  // ... existing code exactly as-is, no changes ...
}

// --- CHUNKED MODE (new) ---
// Sub-step 1.0 — Skeleton
console.log("[extract:chunked] Sub-step 1.0 — skeleton");
setSubStep via setProgress if runId available (server-side: log only; client setSubStep is called from ImportFilesModal)

const skeletonPrompt = await getResolvedAIPrompt(AI_PROMPT_KEYS.EXTRACT_SKELETON);
const skeleton = await extractAssemblySkeleton(pdfBase64, apiKey, skeletonPrompt);
await writeRunDebugFile(runId ?? "no-run", "01_skeleton.json", skeleton);

if (skeleton.length === 0) {
  throw new Error("Skeleton extraction returned no assemblies — PDF may be unsupported or empty");
}

// Sub-steps 1.1–1.6 — Category chunks
const CHUNK_STEPS = [
  { id: "gypsum",           promptKey: AI_PROMPT_KEYS.EXTRACT_GYPSUM,           label: "gypsum board + sheathing", debugFile: "02_extraction_gypsum.json" },
  { id: "steel_framing",    promptKey: AI_PROMPT_KEYS.EXTRACT_STEEL_FRAMING,    label: "steel framing",            debugFile: "03_extraction_framing.json" },
  { id: "insulation",       promptKey: AI_PROMPT_KEYS.EXTRACT_INSULATION,       label: "insulation",               debugFile: "04_extraction_insulation.json" },
  { id: "moisture_control", promptKey: AI_PROMPT_KEYS.EXTRACT_MOISTURE_CONTROL, label: "vapor barriers + sealants",debugFile: "05_extraction_moisture.json" },
  { id: "wood_substrates",  promptKey: AI_PROMPT_KEYS.EXTRACT_WOOD_SUBSTRATES,  label: "plywood + blocking",       debugFile: "06_extraction_wood.json" },
  { id: "specialty",        promptKey: AI_PROMPT_KEYS.EXTRACT_SPECIALTY,        label: "steel deck + trim",        debugFile: "07_extraction_specialty.json" },
];

const chunkResults: Record<string, unknown[]> = {};

for (let i = 0; i < CHUNK_STEPS.length; i++) {
  const chunk = CHUNK_STEPS[i];
  console.log(`[extract:chunked] Sub-step 1.${i + 1} — ${chunk.label} (${i + 1}/${CHUNK_STEPS.length})`);
  try {
    const chunkPrompt = await getResolvedAIPrompt(chunk.promptKey);
    const chunkResult = await extractCategoryChunk(pdfBase64, apiKey, chunkPrompt, skeleton, chunk.id);
    chunkResults[chunk.id] = chunkResult;
    await writeRunDebugFile(runId ?? "no-run", chunk.debugFile, chunkResult);
  } catch (chunkErr) {
    // Non-fatal: log warning, leave this category empty, continue to next chunk
    console.warn(`[extract:chunked] Sub-step ${chunk.id} failed — skipping:`, chunkErr);
    chunkResults[chunk.id] = [];
    await writeRunDebugFile(runId ?? "no-run", chunk.debugFile, { error: String(chunkErr), assemblies: [] });
  }
}

// Merge all chunks into final extraction shape
const assemblies = mergeExtractionChunks(skeleton, chunkResults as Record<string, import("@/services/extraction/extractCategoryChunk").CategoryChunkResult[]>);
await writeRunDebugFile(runId ?? "no-run", "08_extraction_merged.json", { assemblies });

// Save merged result — identical shape to legacy mode
const timestamp = Date.now();
const filename = `assembly-data-${timestamp}.json`;
const { data: savedData, error: saveError } = await saveAssemblyExtraction(
  { assemblies },
  filename,
  projectId,
);
// ... rest of save/response logic same as legacy ...
```

> **Important:** The `mode` defaults to `"legacy"` during Phase 2 so production is unaffected. It becomes `"chunked"` by default only in Phase 6.

---

### 2.5 — Write Real Prompt Content

In Phase 2, replace the placeholder prompts created in Phase 1 with the actual production-quality prompts. The placeholders in Phase 1.5 are intentionally minimal — expand each one to include:
- Explicit "do NOT extract" list (all other 9 categories named)
- Self-check instruction ("Before returning, verify you covered every assembly in the list")
- Any category-specific edge cases from the current `extractAssemblies.txt`

The existing `prompt/extractAssemblies.txt` is the reference. Mine it for rules that apply to specific categories and move each rule to the relevant per-category prompt file.

---

### Phase 2 — Acceptance Criteria

- [ ] `GET /api/extract?mode=legacy` produces same output as before
- [ ] `POST /api/extract?mode=chunked` runs 7 sub-steps and returns `{ assemblies: [...] }` in same shape as legacy
- [ ] Debug files `01_skeleton.json` through `08_extraction_merged.json` appear in `data/output/debug/{runId}/` during dev
- [ ] If one chunk sub-step fails (e.g., model timeout), the rest continue — partial extraction is saved
- [ ] TypeScript compiles with no errors
- [ ] Default mode is still `"legacy"` — production pipeline is unchanged

### Phase 2 — Do NOT Touch

- `src/app/api/match/route.ts`
- `src/app/api/finalize/route.ts`
- `src/services/openrouter/matchMaterials.ts`
- `src/services/openrouter/extractAssemblies.ts` (legacy still uses this)
- `prompt/extractAssemblies.txt` (legacy prompt — do not modify)

---

## Phase 3 — Code Matching Engine

**Goal:** Replace `matchMaterialsToDatabase()` (LLM) with a deterministic TypeScript scoring engine. The match route gets a `mode` query parameter: `?mode=code` (new) and `?mode=legacy` (existing LLM behaviour).

The output `MaterialCosting[]` shape is identical in both modes. Finalize and all downstream code are unchanged.

**Prerequisite:** Phase 1 complete. Phase 2 is independent — can be done in parallel or after.

---

### 3.1 — Create `src/lib/utils/buildMaterialDbIndex.ts`

**File:** `src/lib/utils/buildMaterialDbIndex.ts`  
**Change type:** New file

```typescript
import { CATEGORY_DB_MAP, type ExtractCategory } from "@/constants/extractionCategories";
import type { MaterialDefinition } from "@/types";

export interface MaterialDbIndex {
  /** Material rows grouped by extraction category */
  byCategory: Record<ExtractCategory, MaterialDefinition[]>;
  /** All rows where type === 'labor' */
  labor: MaterialDefinition[];
  /** Screw, fastener, anchor rows */
  fasteners: MaterialDefinition[];
}

const LABOR_TYPE_VALUES = ["labor", "Labour", "Labor"];

const FASTENER_KEYWORDS = ["screw", "fastener", "anchor", "nail", "tek", "drywall screw"];

function isFastener(m: MaterialDefinition): boolean {
  const desc = (m.description ?? "").toLowerCase();
  return FASTENER_KEYWORDS.some(k => desc.includes(k));
}

/**
 * Build a category index from the full material DB in O(n).
 * Called once per match request — takes ~2ms for 1000 rows.
 */
export function buildMaterialDbIndex(materials: MaterialDefinition[]): MaterialDbIndex {
  const byCategory: Partial<Record<ExtractCategory, MaterialDefinition[]>> = {};

  for (const cat of Object.keys(CATEGORY_DB_MAP) as ExtractCategory[]) {
    const dbCategories = CATEGORY_DB_MAP[cat].map(c => c.toLowerCase());
    byCategory[cat] = materials.filter(
      m => dbCategories.some(c => (m.category ?? "").toLowerCase() === c),
    );
  }

  return {
    byCategory: byCategory as Record<ExtractCategory, MaterialDefinition[]>,
    labor: materials.filter(m => LABOR_TYPE_VALUES.includes(m.type ?? "")),
    fasteners: materials.filter(isFastener),
  };
}
```

---

### 3.2 — Create `src/lib/matching/confidenceUtils.ts`

**File:** `src/lib/matching/confidenceUtils.ts`  
**Change type:** New file

```typescript
export type MatchConfidence = "exact" | "high" | "medium" | "low" | "unmatched";

/** Score thresholds — tune these as scoring engine is calibrated */
const THRESHOLDS = {
  exact:     80,
  high:      50,
  medium:    20,
  low:       1,
} as const;

export function toConfidence(score: number): MatchConfidence {
  if (score >= THRESHOLDS.exact)   return "exact";
  if (score >= THRESHOLDS.high)    return "high";
  if (score >= THRESHOLDS.medium)  return "medium";
  if (score >= THRESHOLDS.low)     return "low";
  return "unmatched";
}

/** Returns true if the match should be accepted (any score > 0) */
export function isAcceptable(confidence: MatchConfidence): boolean {
  return confidence !== "unmatched";
}
```

---

### 3.3 — Create `src/lib/matching/descriptionTokenizer.ts`

**File:** `src/lib/matching/descriptionTokenizer.ts`  
**Change type:** New file

```typescript
/**
 * Tokenize a material description string for fuzzy keyword matching.
 * Handles: fraction → decimal, removes punctuation, lowercases.
 *
 * Examples:
 *   '5/8" Type X Gypsum Wallboard' → Set{'0.625', 'type', 'x', 'gypsum', 'wallboard'}
 *   '3-5/8" 20ga Stud @ 16" OC'   → Set{'3.625', '20', 'stud', '16', 'oc'}
 */
export function tokenize(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      // Convert fractions: "5/8" → "0.625", "3-5/8" → "3.625"
      .replace(/(\d+)-(\d+)\/(\d+)/g, (_, whole, num, den) =>
        (parseInt(whole) + parseInt(num) / parseInt(den)).toFixed(3))
      .replace(/(\d+)\/(\d+)/g, (_, num, den) =>
        (parseInt(num) / parseInt(den)).toFixed(3))
      // Remove quote chars and special punctuation
      .replace(/['"\\@#]/g, " ")
      .split(/[\s,.\-_/]+/)
      .map(t => t.trim())
      .filter(t => t.length > 1 && !/^\d{4,}$/.test(t)), // drop very long numbers (codes)
  );
}

/** Score keyword overlap between two token sets. Returns 0–1. */
export function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let matches = 0;
  for (const token of a) {
    if (b.has(token)) matches++;
  }
  return matches / Math.max(a.size, b.size);
}
```

---

### 3.4 — Create Scorer Files

**Location:** `src/lib/matching/scorers/`  
**Change type:** New directory + new files

Create one file per category. Each scorer is a pure function: `(extracted: MaterialItem, db: MaterialDefinition, ctx: MatchContext) => number`.

**`src/lib/matching/scorers/types.ts`** — shared types

```typescript
export interface MaterialItem {
  raw_text?: string | null;
  thickness?: number | null;
  type?: string | null;
  layers?: number | null;
  size?: string | number | null;
  gauge?: string | null;
  spacing?: number | null;
  description?: string | null;
  r_value?: string | null;
  depth?: number | null;
}

export interface MatchContext {
  /** Assembly height in feet — used for gauge selection in steel framing */
  assemblyHeightFt: number;
  /** Assembly fire_rating — used in sealant selection */
  fireRating: string | null;
}
```

**`src/lib/matching/scorers/scoreGwb.ts`**

```typescript
import { tokenize, overlapScore } from "../descriptionTokenizer";
import type { MaterialItem, MatchContext } from "./types";
import type { MaterialDefinition } from "@/types";

export function scoreGwb(extracted: MaterialItem, db: MaterialDefinition, _ctx: MatchContext): number {
  let score = 0;

  // ── Thickness (most important — GWB is identified by its thickness) ───────
  if (extracted.thickness != null && db.size != null) {
    const dbThk = parseFloat(String(db.size));
    if (!isNaN(dbThk)) {
      const extractedInch = toInches(extracted.thickness); // may already be inches
      const diff = Math.abs(extractedInch - dbThk);
      if (diff < 0.005)       score += 60; // exact (e.g. 0.625 == 0.625)
      else if (diff < 0.0625) score += 30; // within 1/16"
      else if (diff > 0.125)  score -= 40; // wrong thickness — significant penalty
    }
  }

  // ── Type keyword overlap ──────────────────────────────────────────────────
  const extTokens = tokenize(extracted.type);
  const dbTokens  = tokenize(db.description);
  const overlap = overlapScore(extTokens, dbTokens);
  score += Math.round(overlap * 30);

  // ── Shaftliner hard rule: must match exactly ──────────────────────────────
  const isShaftliner = /shaftliner|shaft.liner/i.test(extracted.type ?? "");
  const dbIsShaftliner = /shaftliner|shaft.liner/i.test(db.description ?? "");
  if (isShaftliner && !dbIsShaftliner) return -999;
  if (!isShaftliner && dbIsShaftliner) return -999;

  return score;
}

/** Convert thickness to inches — handles mm if value > 2 (heuristic: typical GWB in inches ≤ 1.5) */
function toInches(v: number): number {
  return v > 2 ? v / 25.4 : v;
}
```

**`src/lib/matching/scorers/scoreFraming.ts`**

```typescript
import { tokenize, overlapScore } from "../descriptionTokenizer";
import { getDefaultGaugeForHeight } from "@/constants/extractionCategories";
import type { MaterialItem, MatchContext } from "./types";
import type { MaterialDefinition } from "@/types";

const STUD_KEYWORDS  = ["stud", " cs ", "c-stud", "ch stud", "chstud", "furring"];
const TRACK_KEYWORDS = ["track", "runner", "rnu", "c-track", "angle"];

function isStudType(s: string)  { return STUD_KEYWORDS.some(k  => s.toLowerCase().includes(k)); }
function isTrackType(s: string) { return TRACK_KEYWORDS.some(k => s.toLowerCase().includes(k)); }

export function scoreFraming(extracted: MaterialItem, db: MaterialDefinition, ctx: MatchContext): number {
  let score = 0;
  const dbDesc = db.description ?? "";

  // ── Stud vs Track — must match (hard exclude if wrong) ───────────────────
  const extIsStud  = isStudType(extracted.type  ?? "");
  const extIsTrack = isTrackType(extracted.type ?? "");
  const dbIsStud   = isStudType(dbDesc);
  const dbIsTrack  = isTrackType(dbDesc);
  if (extIsStud  && dbIsTrack) return -999;
  if (extIsTrack && dbIsStud)  return -999;

  // ── Depth (most important structural dimension) ───────────────────────────
  if (extracted.depth != null && db.width != null) {
    const dbDepth = parseFloat(String(db.width));
    if (!isNaN(dbDepth)) {
      const extDepth = extracted.depth > 10 ? extracted.depth / 25.4 : extracted.depth; // mm→in
      const diff = Math.abs(extDepth - dbDepth);
      if (diff < 0.005)       score += 60;
      else if (diff < 0.0625) score += 20;
      else                    return -999; // wrong depth = hard exclude
    }
  }

  // ── Gauge — use extracted if available, else derive from height ───────────
  const targetGauge = (extracted.gauge?.replace(/[^0-9]/g, "") ?? "") || getDefaultGaugeForHeight(ctx.assemblyHeightFt);
  if (db.gauge) {
    const dbGauge = db.gauge.replace(/[^0-9]/g, "");
    if (dbGauge === targetGauge) score += 40;
    else                         score -= 15;
  }

  // ── Spacing (studs only) ──────────────────────────────────────────────────
  if (extIsStud && extracted.spacing != null && db.size != null) {
    const dbSpacing = parseInt(String(db.size), 10);
    if (!isNaN(dbSpacing) && extracted.spacing === dbSpacing) score += 20;
  }

  // ── CH stud / furring type match ──────────────────────────────────────────
  const extType = (extracted.type ?? "").toLowerCase();
  if (extType.includes("ch") && !dbDesc.toLowerCase().includes("ch")) score -= 25;
  if (extType.includes("furring") && !dbDesc.toLowerCase().includes("furring")) score -= 25;

  return score;
}
```

**`src/lib/matching/scorers/scoreInsulation.ts`**

```typescript
import { CAVITY_DEPTH_TO_RVALUE } from "@/constants/extractionCategories";
import type { MaterialItem, MatchContext } from "./types";
import type { MaterialDefinition } from "@/types";

function parseRValue(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/R[-\s]?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function inferSubtype(item: MaterialItem | MaterialDefinition, desc?: string): string | null {
  const text = ((item as MaterialItem).type ?? (desc ?? "") ?? "").toLowerCase();
  if (/spray|foam/i.test(text))     return "spray";
  if (/semi.?rigid|mineral|rock/i.test(text)) return "semi_rigid";
  if (/batt|sound batt/i.test(text)) return "batt";
  return null;
}

export function scoreInsulation(extracted: MaterialItem, db: MaterialDefinition, _ctx: MatchContext): number {
  let score = 0;
  const dbDesc = db.description ?? "";

  // ── Subtype (batt / semi-rigid / spray) — hard exclude if wrong ──────────
  const extSubtype = inferSubtype(extracted);
  const dbSubtype  = inferSubtype({} as MaterialItem, dbDesc);
  if (extSubtype && dbSubtype && extSubtype !== dbSubtype) return -999;

  // ── R-value ───────────────────────────────────────────────────────────────
  let extractedR = parseRValue(extracted.r_value);
  if (extractedR === null && extracted.depth != null) {
    // Infer from cavity depth
    const depthIn = extracted.depth > 10 ? extracted.depth / 25.4 : extracted.depth;
    const matched = CAVITY_DEPTH_TO_RVALUE.find(r => Math.abs(r.depthIn - depthIn) < 0.25);
    extractedR = matched?.rValue ?? null;
  }
  const dbR = parseRValue(dbDesc);
  if (extractedR !== null && dbR !== null) {
    if (extractedR === dbR)                    score += 60;
    else if (Math.abs(extractedR - dbR) <= 2)  score += 20; // close
    else                                        score -= 40; // wrong R-value
  }

  // ── Depth match ───────────────────────────────────────────────────────────
  if (extracted.depth != null && db.width != null) {
    const dbDepth = parseFloat(String(db.width));
    if (!isNaN(dbDepth)) {
      const extDepth = extracted.depth > 10 ? extracted.depth / 25.4 : extracted.depth;
      const diff = Math.abs(extDepth - dbDepth);
      if (diff < 0.25) score += 20;
    }
  }

  return score;
}
```

**`src/lib/matching/scorers/scoreGeneric.ts`** — used for categories without complex rules

```typescript
import { tokenize, overlapScore } from "../descriptionTokenizer";
import type { MaterialItem, MatchContext } from "./types";
import type { MaterialDefinition } from "@/types";

/** Generic scorer: keyword overlap on description + type. Used for low-complexity categories. */
export function scoreGeneric(extracted: MaterialItem, db: MaterialDefinition, _ctx: MatchContext): number {
  const extTokens = tokenize((extracted.raw_text ?? "") + " " + (extracted.type ?? ""));
  const dbTokens  = tokenize(db.description);
  const overlap = overlapScore(extTokens, dbTokens);
  return Math.round(overlap * 60);
}
```

**`src/lib/matching/scorers/index.ts`**

```typescript
import type { MaterialDefinition } from "@/types";
import type { ExtractCategory } from "@/constants/extractionCategories";
import type { MaterialItem, MatchContext } from "./types";
import { scoreGwb }      from "./scoreGwb";
import { scoreFraming }  from "./scoreFraming";
import { scoreInsulation } from "./scoreInsulation";
import { scoreGeneric }  from "./scoreGeneric";

export type ScorerFn = (
  extracted: MaterialItem,
  db: MaterialDefinition,
  ctx: MatchContext,
) => number;

export const CATEGORY_SCORERS: Record<ExtractCategory, ScorerFn> = {
  gypsum_board:          scoreGwb,
  gypsum_sheathing:      scoreGwb,        // same logic — sheathing also ID'd by thickness + type
  steel_framing:         scoreFraming,
  insulation:            scoreInsulation,
  vapor_barriers:        scoreGeneric,
  sealants:              () => 0,         // sealants handled entirely by autoAddEngine
  plywood:               scoreGeneric,
  blocking_and_bracing:  scoreGeneric,
  steel_deck:            scoreGeneric,
  trim_and_accessories:  scoreGeneric,
};

export type { MaterialItem, MatchContext };
```

---

### 3.5 — Create `src/lib/matching/autoAddEngine.ts`

**File:** `src/lib/matching/autoAddEngine.ts`  
**Change type:** New file

```typescript
/**
 * Auto-add rules engine.
 * Runs after primary scoring. Adds: tracks, screws, sealants, layout labor.
 * All rules are deterministic code — no LLM involved.
 */
import type { MaterialDefinition } from "@/types";
import type { MaterialDbIndex } from "@/lib/utils/buildMaterialDbIndex";
import type { AssemblySkeleton } from "@/services/extraction/extractAssemblySkeleton";

export interface CostingItemIntermediate {
  extracted_material: unknown;
  matched_materials: Array<{ code: string; description?: string; [key: string]: unknown }>;
  matched_labor: unknown[];
  _category: string;
  _confidence: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isStud(code: string, desc?: string): boolean {
  const d = (desc ?? code).toLowerCase();
  return /\bstud\b|[- ]cs[- ]|ch stud/.test(d) && !/track|rnu|runner/.test(d);
}

function isTrack(code: string, desc?: string): boolean {
  const d = (desc ?? code).toLowerCase();
  return /track|runner|rnu/.test(d);
}

function makeAutoAddItem(
  source: unknown,
  db: MaterialDefinition,
  reason: string,
  category: string,
): CostingItemIntermediate {
  return {
    extracted_material: source,
    matched_materials: [{
      code: db.code,
      section: db.section ?? "",
      description: db.description ?? "",
      manufacturer: db.manufacturer ?? "",
      unit: db.per ?? "",
      unit_cost: db.matCost ?? 0,
      _autoAdded: reason,
    }],
    matched_labor: [],
    _category: category,
    _confidence: "auto",
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function applyAutoAddRules(
  items: CostingItemIntermediate[],
  skeleton: AssemblySkeleton,
  dbIndex: MaterialDbIndex,
): CostingItemIntermediate[] {
  const additions: CostingItemIntermediate[] = [];
  const existingCodes = new Set(items.flatMap(i => i.matched_materials.map(m => m.code)));

  // ── Rule 1: For every matched stud → add track with same depth + gauge ───
  for (const item of items) {
    if (item._category !== "steel_framing") continue;
    for (const mat of item.matched_materials) {
      if (!isStud(mat.code, mat.description)) continue;

      // Extract depth and gauge from matched stud code/description
      const studGauge  = (mat as Record<string, unknown>).gauge as string | undefined ?? "";
      const studWidth  = (mat as Record<string, unknown>).width as string | undefined ?? "";

      const matchingTrack = dbIndex.byCategory.steel_framing.find(
        db => isTrack(db.code, db.description) &&
              db.gauge === studGauge &&
              (studWidth ? db.width === studWidth : true),
      );
      if (matchingTrack && !existingCodes.has(matchingTrack.code)) {
        existingCodes.add(matchingTrack.code);
        additions.push(makeAutoAddItem(item.extracted_material, matchingTrack, "auto:track", "steel_framing"));
      }
    }
  }

  // ── Rule 2: Sealant — exactly one per assembly, type driven by fire_rating ─
  const hasFireRating =
    skeleton.fire_rating !== null &&
    skeleton.fire_rating !== undefined &&
    !["na", "n/a", "none", ""].includes((skeleton.fire_rating ?? "").toLowerCase().trim());

  const sealantKeyword = hasFireRating ? "firestop" : "acoustical";
  const sealantEntry = dbIndex.byCategory.sealants.find(
    m => (m.description ?? "").toLowerCase().includes(sealantKeyword),
  );
  if (sealantEntry && !existingCodes.has(sealantEntry.code)) {
    existingCodes.add(sealantEntry.code);
    additions.push(makeAutoAddItem(null, sealantEntry, "auto:sealant", "sealants"));
  }

  return [...items, ...additions];
}
```

---

### 3.6 — Create `src/lib/matching/laborEngine.ts`

**File:** `src/lib/matching/laborEngine.ts`  
**Change type:** New file

```typescript
/**
 * Labor attachment engine.
 * Attaches labor entries from the DB to matched materials based on:
 * - Material category
 * - Assembly height category
 * - Material type (stud vs track, batt vs spray, etc.)
 */
import type { MaterialDefinition } from "@/types";
import type { CostingItemIntermediate } from "./autoAddEngine";

/** Mirrors the existing height category strings in the DB labor descriptions */
function getHeightCategory(heightFt: number): string {
  if (heightFt <= 12) return "(Walls < 12 ft)";
  if (heightFt <= 24) return "(High 12 ft to 24 ft)";
  return "(High Above 24 ft)";
}

interface LaborPattern {
  codeKeyword: string;
  heightDependent: boolean;
  condition: (matCode: string, matDesc: string) => boolean;
}

const LABOR_PATTERNS: Record<string, LaborPattern[]> = {
  gypsum_board: [
    { codeKeyword: "HANG",   heightDependent: true,  condition: () => true },
    { codeKeyword: "FINISH", heightDependent: true,  condition: () => true },
  ],
  gypsum_sheathing: [
    { codeKeyword: "SHEATHING", heightDependent: false, condition: () => true },
  ],
  steel_framing: [
    { codeKeyword: "STUDS",   heightDependent: true,  condition: (c, d) => /stud/i.test(d) && !/track/.test(d) },
    { codeKeyword: "FURRING", heightDependent: true,  condition: (c, d) => /furring/i.test(d) },
    { codeKeyword: "SHAFT",   heightDependent: true,  condition: (c, d) => /ch stud|shaftwall/i.test(d) },
  ],
  insulation: [
    { codeKeyword: "BATT",   heightDependent: false, condition: (c, d) => !/spray|foam/i.test(d) },
    { codeKeyword: "SPRAY",  heightDependent: false, condition: (c, d) => /spray|foam/i.test(d) },
  ],
};

export function attachLabor(
  items: CostingItemIntermediate[],
  assemblyHeightFt: number,
  laborDb: MaterialDefinition[],
): CostingItemIntermediate[] {
  const heightCat = getHeightCategory(assemblyHeightFt);

  return items.map(item => {
    const patterns = LABOR_PATTERNS[item._category] ?? [];
    if (patterns.length === 0) return item;

    const laborItems: unknown[] = [];

    for (const mat of item.matched_materials) {
      for (const pattern of patterns) {
        if (!pattern.condition(mat.code, mat.description ?? "")) continue;

        const laborEntry = laborDb.find(l => {
          const hasKeyword = (l.code + " " + (l.description ?? ""))
            .toUpperCase()
            .includes(pattern.codeKeyword.toUpperCase());
          if (!hasKeyword) return false;
          if (pattern.heightDependent) {
            return (l.description ?? "").includes(heightCat);
          }
          return true;
        });

        if (laborEntry) {
          laborItems.push({
            code: laborEntry.code,
            section: laborEntry.section ?? "",
            description: laborEntry.description ?? "",
            unit: laborEntry.per ?? "",
            unit_cost: laborEntry.matCost ?? 0,
            height_ft: assemblyHeightFt,
            height_category: heightCat,
          });
        }
      }
    }

    return { ...item, matched_labor: laborItems };
  });
}
```

---

### 3.7 — Create `src/lib/matching/matchOrchestrator.ts`

**File:** `src/lib/matching/matchOrchestrator.ts`  
**Change type:** New file

```typescript
/**
 * Main entry point for the code-based matching engine.
 * Replaces matchMaterialsToDatabase() entirely.
 * Input/output shapes are identical to the LLM version.
 */
import type { MaterialDefinition } from "@/types";
import type { MaterialDbIndex } from "@/lib/utils/buildMaterialDbIndex";
import { EXTRACT_CATEGORIES, type ExtractCategory } from "@/constants/extractionCategories";
import { CATEGORY_SCORERS, type MaterialItem } from "./scorers/index";
import { toConfidence } from "./confidenceUtils";
import { applyAutoAddRules, type CostingItemIntermediate } from "./autoAddEngine";
import { attachLabor } from "./laborEngine";
import type { AssemblySkeleton } from "@/services/extraction/extractAssemblySkeleton";

interface MatchOrchestratorResult {
  assemblies: unknown[];
  scoredDebug?: unknown[]; // populated when debugMode=true
}

export function matchAssemblies(
  extractedAssemblies: unknown[],
  dbIndex: MaterialDbIndex,
  options: { debugMode?: boolean; assemblyHeightMap?: Record<string, number> } = {},
): MatchOrchestratorResult {
  const { debugMode = false, assemblyHeightMap = {} } = options;

  const resultAssemblies: unknown[] = [];
  const debugRecords: unknown[] = [];

  for (const raw of extractedAssemblies) {
    const assembly = raw as Record<string, unknown>;
    const assemblyId = String(assembly.assembly_id ?? "");
    const fireRating = (assembly.fire_rating as string | null) ?? null;
    const stcRating  = (assembly.stc_rating  as string | null) ?? null;
    const heightFt   = assemblyHeightMap[assemblyId] ?? 10; // default 10ft when no takeoff
    const materials  = (assembly.materials ?? {}) as Record<string, unknown[]>;

    const ctx = { assemblyHeightFt: heightFt, fireRating };
    const costingItems: CostingItemIntermediate[] = [];
    const debugItems: unknown[] = [];

    for (const cat of EXTRACT_CATEGORIES) {
      if (cat === "sealants") continue; // handled by autoAddEngine
      const scorer   = CATEGORY_SCORERS[cat];
      const dbSlice  = dbIndex.byCategory[cat] ?? [];
      const extracted = (materials[cat] ?? []) as MaterialItem[];

      for (const extractedItem of extracted) {
        if (!extractedItem.raw_text?.trim()) continue; // skip null raw_text (existing filter)

        const candidates = dbSlice
          .map(db => ({ db, score: scorer(extractedItem, db, ctx) }))
          .filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score);

        const top = candidates[0];
        const confidence = toConfidence(top?.score ?? 0);

        const matchedMaterials = top
          ? [{
              code: top.db.code,
              section: top.db.section ?? "",
              description: top.db.description ?? "",
              manufacturer: top.db.manufacturer ?? "",
              unit: top.db.per ?? "",
              unit_cost: top.db.matCost ?? 0,
              _confidence: confidence,
            }]
          : [];

        costingItems.push({
          extracted_material: extractedItem,
          matched_materials: matchedMaterials,
          matched_labor: [],
          _category: cat,
          _confidence: confidence,
        });

        if (debugMode) {
          debugItems.push({
            category: cat,
            extracted: extractedItem,
            topCandidates: candidates.slice(0, 5).map(c => ({
              code: c.db.code,
              description: c.db.description,
              score: c.score,
            })),
            selected: matchedMaterials[0] ?? null,
            confidence,
          });
        }
      }
    }

    // Auto-add: tracks, sealants, screws
    const skeletonStub: AssemblySkeleton = {
      assembly_id: assemblyId,
      assembly_type: String(assembly.assembly_type ?? ""),
      fire_rating: fireRating,
      stc_rating: stcRating,
    };
    const withAutoAdds = applyAutoAddRules(costingItems, skeletonStub, dbIndex);

    // Attach labor
    const withLabor = attachLabor(withAutoAdds, heightFt, dbIndex.labor);

    // Strip internal _category, _confidence fields before output
    const cleanedCosting = withLabor.map(({ _category: _c, _confidence: _conf, ...item }) => item);

    resultAssemblies.push({
      assembly_id: assemblyId,
      fire_rating: fireRating,
      stc_rating:  stcRating,
      materials_costing: cleanedCosting,
    });

    if (debugMode) debugRecords.push({ assembly_id: assemblyId, items: debugItems });
  }

  return { assemblies: resultAssemblies, scoredDebug: debugMode ? debugRecords : undefined };
}
```

---

### 3.8 — Modify `src/app/api/match/route.ts`

**File:** `src/app/api/match/route.ts`  
**Change type:** Modify existing file — add `?mode=code` path

**Add new imports at the top:**

```typescript
import { buildMaterialDbIndex } from "@/lib/utils/buildMaterialDbIndex";
import { matchAssemblies }      from "@/lib/matching/matchOrchestrator";
import { writeRunDebugFile }    from "@/lib/utils/localJsonStorage";
```

**Add code-mode branch inside the POST handler, after the extraction validation and DB load:**

```typescript
const url = new URL(req.url);
const mode = url.searchParams.get("mode") ?? "legacy"; // becomes "code" default in Phase 6

if (mode === "code") {
  console.log("[match:code] Building DB index...");
  const dbIndex = buildMaterialDbIndex(database);
  console.log(`[match:code] Index built — framing: ${dbIndex.byCategory.steel_framing.length}, gwb: ${dbIndex.byCategory.gypsum_board.length}`);

  const { assemblies: matchedAssemblies, scoredDebug } = matchAssemblies(
    extraction.assemblies,
    dbIndex,
    { debugMode: process.env.NODE_ENV === "development" },
  );

  await writeRunDebugFile(runId ?? "no-run", "10_match_scored.json", scoredDebug ?? []);
  await writeRunDebugFile(runId ?? "no-run", "11_match_auto_adds.json", matchedAssemblies);

  const result = { assemblies: matchedAssemblies };
  // ... same save/response logic as legacy mode (saveMaterialMatch, updatePipelineRunStep, etc.)
}
// else: existing LLM path runs unchanged
```

---

### Phase 3 — Acceptance Criteria

- [ ] `POST /api/match?mode=legacy` produces same output as before (LLM call unchanged)
- [ ] `POST /api/match?mode=code` runs in under 100ms (no network calls)
- [ ] `matched_materials` arrays have the same schema as LLM output (`code`, `section`, `description`, `manufacturer`, `unit`, `unit_cost`)
- [ ] Debug files `10_match_scored.json`, `11_match_auto_adds.json` appear in `data/output/debug/{runId}/`
- [ ] For a known test extraction, the code engine selects the same (or better) DB codes as the LLM
- [ ] TypeScript compiles with no errors
- [ ] Default mode is still `"legacy"` — production pipeline unchanged

### Phase 3 — Do NOT Touch

- `src/app/api/extract/route.ts`
- `src/app/api/finalize/route.ts`
- `src/services/openrouter/matchMaterials.ts`
- `src/services/openrouter/extractAssemblies.ts`
- `src/lib/utils/enrichFinalOutputWithQuantities.ts`
- `src/services/finalize/mergeTakeoffWithMaterialMatch.ts`

---

## Phase 4 — Debug Output Wiring

**Goal:** Wire debug file writes into the finalize route so the full 14-file run output is available. Also ensure all existing `writeJsonToLocal` calls in extract and finalize are consistent with the new naming.

**Prerequisite:** Phases 1, 2, and 3 complete.

---

### 4.1 — Add debug writes to `src/app/api/finalize/route.ts`

**File:** `src/app/api/finalize/route.ts`  
**Change type:** Add two `writeRunDebugFile` calls (non-blocking, development-only)

```typescript
// Add import:
import { writeRunDebugFile } from "@/lib/utils/localJsonStorage";

// After mergeTakeoffWithMaterialMatch() or AI finalize:
await writeRunDebugFile(runId ?? "no-run", "12_match_with_labor.json", result);

// After enrichFinalOutputWithQuantities():
await writeRunDebugFile(runId ?? "no-run", "14_finalize_output.json", result);
```

---

### 4.2 — Fix local material DB path in `src/app/api/finalize/route.ts`

**Current (bug):** The finalize route reads from `data/material-database.json` (a local file) for the labor index, with a silent fallback if the file doesn't exist.

```typescript
// CURRENT (lines 183–188):
const dbRaw = await readFile(path.join(process.cwd(), "data", "material-database.json"), "utf-8");
materialDb = JSON.parse(dbRaw) as unknown[];
```

**Fix:** Use `getMaterialDatabase()` (same Redis-cached source as the match route) instead of the local file.

```typescript
// AFTER:
import { getMaterialDatabase } from "@/lib/cache/materialDbCache";

// Replace the readFile block with:
try {
  materialDb = await getMaterialDatabase();
} catch {
  console.warn("[finalize] Could not load material DB from cache — height segmentation will use fallback");
}
```

Also remove the `readFile` and `path` imports from finalize if they are no longer used after this change.

---

### Phase 4 — Acceptance Criteria

- [ ] Running a full pipeline in dev mode (extract → match → finalize) produces a complete set of debug files in `data/output/debug/{runId}/`
- [ ] Finalize route no longer reads from `data/material-database.json` — uses `getMaterialDatabase()` 
- [ ] `data/output/debug/` is in `.gitignore`
- [ ] No behavior change in production

### Phase 4 — Do NOT Touch

- `src/services/finalize/mergeTakeoffWithMaterialMatch.ts`
- `src/lib/utils/enrichFinalOutputWithQuantities.ts`
- Anything in `src/components/`

---

## Phase 5 — UI Sub-Step Progress

**Goal:** Update `ImportFilesModal.tsx` to display the current extraction sub-step label and a fine-grained progress indicator inside the step 1 progress display. Uses the `subStepLabel`, `subStepIndex`, `subStepTotal` fields added in Phase 1.

**Prerequisite:** Phase 1 complete.

---

### 5.1 — Update `src/components/features/project/ImportFilesModal.tsx`

**File:** `src/components/features/project/ImportFilesModal.tsx`  
**Change type:** Modify existing file — two targeted additions

**Addition 1 — Read sub-step state from context:**

```typescript
// Add to the existing usePipeline() destructure:
const { step, status, error, setProgress, subStepLabel, subStepIndex, subStepTotal, setSubStep } = usePipeline();
```

**Addition 2 — Display sub-step progress below the Step 1 indicator:**

Find the existing Step 1 progress display in the JSX (wherever step === 1 is indicated). Add below it:

```tsx
{step === 1 && subStepLabel && (
  <div className="mt-2 pl-4">
    <p className="text-xs text-slate-500">{subStepLabel}</p>
    {subStepIndex !== null && subStepTotal !== null && (
      <div className="mt-1 h-1 w-full rounded-full bg-slate-100">
        <div
          className="h-1 rounded-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${Math.round((subStepIndex / subStepTotal) * 100)}%` }}
        />
      </div>
    )}
  </div>
)}
```

**Addition 3 — Call `setSubStep` from the extract fetch calls in the modal:**

The modal currently calls the extract API and polls for results. Add `setSubStep` calls before and after each sub-step (the route will log sub-step progress server-side; the client-side `setSubStep` is driven by SSE or polling).

Since the current pipeline is request-response (not streaming), the sub-step updates happen at the client by watching the `subStepLabel` returned in the response body (optional enhancement). At minimum, set a generic "Extracting assemblies..." label on step 1 start:

```typescript
// When extract call starts:
setSubStep("Extracting assembly list...", 0, 7);

// When extract call completes:
setSubStep(null, null, null);
```

> Full per-sub-step progress requires Server-Sent Events (SSE) from the extract route — this is a future enhancement. For Phase 5, the progress bar shows 0% on start and fills to 100% on completion. This is still an improvement over no progress display at all.

---

### Phase 5 — Acceptance Criteria

- [ ] When step 1 is in progress, a sub-label and progress bar appear in the modal
- [ ] Progress bar fills from 0% to 100% across the extract step
- [ ] No TypeScript errors
- [ ] Modal close and re-open resets sub-step display correctly (via `resetProgress()`)

### Phase 5 — Do NOT Touch

- `src/context/PipelineContext.tsx` (already updated in Phase 1)
- Any API routes

---

## Phase 6 — Promote to Default & Clean Up

**Goal:** Make `chunked` the default for extraction and `code` the default for matching. Archive old prompt and deprecate old service. Production now runs the new architecture.

**Prerequisite:** Phases 2 and 3 both passing acceptance criteria with real project data.

---

### 6.1 — Switch defaults in `src/app/api/extract/route.ts`

```typescript
// BEFORE:
const mode = url.searchParams.get("mode") ?? "legacy";

// AFTER:
const mode = url.searchParams.get("mode") ?? "chunked";
```

---

### 6.2 — Switch defaults in `src/app/api/match/route.ts`

```typescript
// BEFORE:
const mode = url.searchParams.get("mode") ?? "legacy";

// AFTER:
const mode = url.searchParams.get("mode") ?? "code";
```

---

### 6.3 — Deprecate `src/services/openrouter/matchMaterials.ts`

**File:** `src/services/openrouter/matchMaterials.ts`  
**Change type:** Add JSDoc — do NOT delete the file (legacy mode still uses it)

Add at the top of the file:

```typescript
/**
 * @deprecated
 * This service is superseded by the code matching engine in src/lib/matching/.
 * Still used when ?mode=legacy is explicitly passed to /api/match.
 * Will be removed in a future cleanup — do not expand usage.
 */
```

---

### 6.4 — Archive old prompts

Move prompt files that are no longer the primary path to `prompt/archive/`:

```
prompt/matchMaterials.txt  →  prompt/archive/matchMaterials.txt
```

> Do NOT move or modify `prompt/extractAssemblies.txt` — it is still used by `?mode=legacy` on the extract route.

---

### 6.5 — Remove `AI_PROMPT_KEYS.MATERIAL_MATCH` from active use (optional)

If the legacy match mode is no longer needed at all, remove `MATERIAL_MATCH` from `AI_PROMPT_KEYS`. However, keep it commented out with a `@deprecated` note rather than deleting — in case of emergency rollback.

---

### Phase 6 — Acceptance Criteria

- [ ] `POST /api/extract` with no query params now runs chunked mode
- [ ] `POST /api/match` with no query params now runs code engine
- [ ] Full pipeline run (extract → match → finalize) produces correct final output without any `?mode` params
- [ ] `?mode=legacy` on both routes still works as emergency fallback
- [ ] No TypeScript errors
- [ ] Old `matchMaterials.ts` has `@deprecated` JSDoc

---

## Appendix A — Complete File Inventory After All Phases

### New files created

```
src/
├── constants/
│   └── extractionCategories.ts          ← Phase 1
├── services/
│   └── extraction/
│       ├── extractAssemblySkeleton.ts   ← Phase 2
│       ├── extractCategoryChunk.ts      ← Phase 2
│       └── mergeExtractionChunks.ts     ← Phase 2
└── lib/
    ├── utils/
    │   └── buildMaterialDbIndex.ts      ← Phase 3
    └── matching/
        ├── matchOrchestrator.ts         ← Phase 3
        ├── confidenceUtils.ts           ← Phase 3
        ├── autoAddEngine.ts             ← Phase 3
        ├── laborEngine.ts               ← Phase 3
        ├── descriptionTokenizer.ts      ← Phase 3
        └── scorers/
            ├── types.ts                 ← Phase 3
            ├── scoreGwb.ts              ← Phase 3
            ├── scoreFraming.ts          ← Phase 3
            ├── scoreInsulation.ts       ← Phase 3
            ├── scoreGeneric.ts          ← Phase 3
            └── index.ts                 ← Phase 3

prompt/
├── extract_skeleton.txt                 ← Phase 1
├── extract_gypsum.txt                   ← Phase 1
├── extract_steel_framing.txt            ← Phase 1
├── extract_insulation.txt               ← Phase 1
├── extract_moisture_control.txt         ← Phase 1
├── extract_wood_substrates.txt          ← Phase 1
├── extract_specialty.txt                ← Phase 1
└── archive/
    └── matchMaterials.txt               ← Phase 6
```

### Modified files

```
src/lib/db/aiPrompts.ts                  ← Phase 1 (new prompt keys)
src/lib/utils/localJsonStorage.ts        ← Phase 1 (writeRunDebugFile added)
src/context/PipelineContext.tsx          ← Phase 1 (subStep fields added)
src/app/api/extract/route.ts             ← Phase 2 (chunked mode added)
src/app/api/match/route.ts              ← Phase 3 (code mode added)
src/app/api/finalize/route.ts           ← Phase 4 (debug writes + fix materialDb source)
src/components/features/project/
  ImportFilesModal.tsx                   ← Phase 5 (sub-step progress display)
.gitignore                               ← Phase 1 (data/output/debug/ added)
```

### Files with deprecation notice only (not modified otherwise)

```
src/services/openrouter/matchMaterials.ts  ← Phase 6 (@deprecated JSDoc)
```

### Files never touched (all phases)

```
src/app/api/finalize/route.ts              ← Only debug writes added (Phase 4)
src/services/openrouter/extractAssemblies.ts
src/services/finalize/mergeTakeoffWithMaterialMatch.ts
src/lib/utils/enrichFinalOutputWithQuantities.ts
src/lib/utils/projectCosting.ts
src/lib/utils/markupChain.ts
src/lib/cache/materialDbCache.ts
src/lib/db/assemblyData.ts
src/lib/db/pipelineRuns.ts
src/lib/db/pipelineOutputs.ts
prompt/extractAssemblies.txt               ← Legacy fallback, untouched
```

---

## Appendix B — Environment Variables

No new environment variables are required. Existing variables used:

| Variable | Used in |
|----------|---------|
| `OPENROUTER_API_KEY` | All extraction LLM calls (Phases 2, 3) |
| `NODE_ENV` | Debug file writes (development only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Client-side (unchanged) |
| `SUPABASE_SERVICE_ROLE_KEY` | All DB calls (unchanged) |

---

## Appendix C — Rollback Plan

At every phase, the previous behaviour is preserved behind a `?mode=legacy` query parameter. If a deployed phase causes issues:

1. In `extract/route.ts`: change default back to `"legacy"`
2. In `match/route.ts`: change default back to `"legacy"`
3. No DB schema changes are made in any phase — rollback has zero data impact
4. All old service files (`matchMaterials.ts`, `extractAssemblies.ts`) are kept intact throughout
