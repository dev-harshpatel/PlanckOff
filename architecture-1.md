# Architecture 1 — Hybrid Pipeline: Minimal LLM + Maximum Code Logic

> **Core thesis:** Use the LLM for exactly one thing it is irreplaceable for — reading unstructured visual documents (PDFs). Use deterministic TypeScript code for everything else. The final output JSON shape is unchanged. This architecture works on any assembly type it has never seen before.

---

## Table of Contents

1. [The Design Philosophy — LLM vs Code](#1-the-design-philosophy--llm-vs-code)
2. [Why the Current Pipeline Uses LLM for Matching — and Why We Can Replace It](#2-why-the-current-pipeline-uses-llm-for-matching--and-why-we-can-replace-it)
3. [Decision Matrix — Every Pipeline Step](#3-decision-matrix--every-pipeline-step)
4. [How the PDF Is Sent — Current vs Image-Per-Page](#4-how-the-pdf-is-sent--current-vs-image-per-page)
5. [Revised Pipeline Overview](#5-revised-pipeline-overview)
6. [Step 1 — Chunked Extraction (LLM Only)](#6-step-1--chunked-extraction-llm-only)
7. [Step 2 — Code Matching Engine (Zero LLM)](#7-step-2--code-matching-engine-zero-llm)
8. [Step 3 — Finalize (Already Pure Code)](#8-step-3--finalize-already-pure-code)
9. [Debug Output Files — Analyze Every Step](#9-debug-output-files--analyze-every-step)
10. [Future-Proof Design Principles](#10-future-proof-design-principles)
11. [Model Selection](#11-model-selection)
12. [Confidence Scoring and Review Flags](#12-confidence-scoring-and-review-flags)
13. [DB Category Index](#13-db-category-index)
14. [Changes Needed — File by File](#14-changes-needed--file-by-file)
15. [Cost and Time Analysis](#15-cost-and-time-analysis)
16. [Implementation Order](#16-implementation-order)

---

## 1. The Design Philosophy — LLM vs Code

LLMs are excellent at one thing: **interpreting unstructured, visually presented information** — reading a PDF, understanding a hand-annotated drawing, parsing a specification written in natural language. That is irreplaceable.

LLMs are unreliable at: **deterministic lookup, exact field matching, applying multi-rule business logic consistently**. Every time you ask an LLM to "match this material to the database," you are asking it to do something a database query does better, faster, and with 100% reproducibility.

The current pipeline violates this principle by using LLMs for matching. The result is:
- Inconsistent outputs for the same PDF input
- Materials matched differently on retry
- Rules silently not applied (auto-add for tracks/screws, sealant type selection)
- No way to explain *why* a particular code was selected
- Impossible to improve systematically — prompt tuning affects the entire model at once

**The new rule:**

> The LLM touches the pipeline exactly once — at extraction. After the LLM produces structured properties from the PDF, every subsequent step is deterministic TypeScript code.

---

## 2. Why the Current Pipeline Uses LLM for Matching — and Why We Can Replace It

This section documents the real reasons the original matching step was implemented as an LLM call, and explicitly addresses whether code can replace each one.

### The 6 reasons LLM was used for matching

**Reason 1 — Unit normalization was interleaved with matching**

Extracted data from PDFs is inconsistent: one spec says `"406mm"`, another says `"16 OC"`, another says `"@16\"`. The matching prompt normalizes these on the fly (`mm÷25.4`, round to integer). Moving this to code was deferred because the LLM could handle any format variation implicitly.

→ **Code replacement:** Write a unit normalization pass that runs server-side immediately after each extraction sub-step completes, before any matching begins. Convert all extracted measurements to a canonical form (`thickness_in`, `spacing_in`, `depth_in` — all as floats) using a `normalizeExtractedItem()` utility. This is straightforward TypeScript with a handful of regex patterns and the formula `mm / 25.4`.

---

**Reason 2 — DB field names are semantically ambiguous by category**

The `spec_database` columns use the same field names to mean different things:
- `size` = spacing (integer, OC spacing in inches) for **steel framing studs**
- `size` = thickness (string) for **GWB**
- `width` = depth (e.g., `"3.625"`) for **framing**
- There is no dedicated `r_value` column — it lives inside `description`
- There is no dedicated `thickness_in` column for boards — it also lives in `description` or is inferred from the product code

The LLM understood these semantic aliases intuitively; code has to be told explicitly.

→ **Code replacement:** Create a `DB_FIELD_SEMANTICS` constant that maps category → which DB column holds which physical property:

```typescript
export const DB_FIELD_SEMANTICS: Record<ExtractCategory, {
  thickness: 'description' | 'size' | 'width' | null;
  depth:     'width' | 'size' | null;
  spacing:   'size' | 'screw_spacing' | null;
  rValue:    'description' | null;
}> = {
  gypsum_board:    { thickness: 'size',  depth: null,    spacing: null,         rValue: null },
  steel_framing:   { thickness: null,    depth: 'width', spacing: 'size',       rValue: null },
  insulation:      { thickness: 'size',  depth: 'width', spacing: null,         rValue: 'description' },
  gypsum_sheathing:{ thickness: 'size',  depth: null,    spacing: null,         rValue: null },
  // ... etc
};
```

Each scorer reads this table instead of hard-coding column names.

---

**Reason 3 — Gauge inference from height (requires cross-referencing the takeoff)**

When a spec doesn't specify gauge, the matching prompt applies: `≤12ft → 25ga, 12–20ft → 20ga, 20+ft → 18ga`. But `height_ft` lives in the takeoff (not in the extraction). The LLM received both as part of the same prompt and could cross-reference them.

In code, height is not available at extraction time — it arrives at finalize time when the takeoff is merged.

→ **Code replacement:** This is already handled by `mergeTakeoffWithMaterialMatch.ts` which runs the gauge selection logic (`filterSteelFramingByGauge`) AFTER the takeoff merge. In the new architecture: the matching step records ALL gauge candidates from the DB (e.g., every depth=3.625 stud in 25ga, 20ga, 18ga). The finalize step applies `filterSteelFramingByGauge` to pick the height-appropriate one. This is the exact same result, just split across two code steps instead of one LLM call.

---

**Reason 4 — R-value inference from cavity depth**

The matching prompt encodes: `"92mm/3-5/8"→R-13; 140mm/5-1/2"→R-21; 152mm/6"→R-19"`. This domain knowledge table wasn't in `spec_database` — it was only in the prompt.

→ **Code replacement:** Move this table to a constant:

```typescript
// src/constants/insulationDefaults.ts
export const CAVITY_DEPTH_TO_RVALUE: Array<{ depthIn: number; rValue: number }> = [
  { depthIn: 3.625, rValue: 13 },  // 3-5/8"
  { depthIn: 5.5,   rValue: 21 },  // 5-1/2"
  { depthIn: 6.0,   rValue: 19 },  // 6"
  { depthIn: 3.5,   rValue: 11 },  // 2x4 stud cavity
];

export function inferRValueFromDepth(depthInches: number): number | null {
  const match = CAVITY_DEPTH_TO_RVALUE.find(
    r => Math.abs(r.depthIn - depthInches) < 0.25,
  );
  return match?.rValue ?? null;
}
```

The insulation scorer calls `inferRValueFromDepth(extracted.depth)` when `extracted.r_value` is null.

---

**Reason 5 — Auto-adds are dependent matches (track depends on which stud was matched)**

The prompt auto-adds: the matching track (must use the EXACT gauge of the matched stud), screws (matched by layers + substrate + fire_rating). These are sequential decisions — first match the stud, then derive the track from the stud result.

The LLM could do this in one pass because it holds all decisions in context simultaneously. In code, it requires a multi-pass engine.

→ **Code replacement:** The `autoAddEngine.ts` (section 7.C) is exactly this multi-pass engine. Pass 1 scores and matches primary materials. Pass 2 reads matched stud codes and finds tracks with the same gauge. This is three extra lines of code, not a fundamental limitation.

---

**Reason 6 — Natural language description matching in the DB**

DB entries like `"5/8\" Type X Gypsum Wallboard"`, `"Gypsum Board, 5/8\", Type X"`, and `"GWB Type X 5/8\""` all describe the same product. The LLM understood these as equivalent. Code needs explicit tokenization.

→ **Code replacement:** Tokenize both the extracted `type` field and the DB `description` field into normalized keyword sets before comparison:

```typescript
function descriptionTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/["/\\]/g, ' ')   // remove quote chars
      .replace(/\b(\d+)\/(\d+)\b/g, (_, n, d) => (parseFloat(n)/parseFloat(d)).toFixed(3))
      .split(/[\s,.-]+/)
      .filter(t => t.length > 1),
  );
}

// "5/8" Type X Gypsum Wallboard" → {'0.625', 'type', 'x', 'gypsum', 'wallboard'}
// Extracted type: "Type X, 5/8" → {'type', 'x', '0.625'}
// Overlap = {'type', 'x', '0.625'} → high score
```

---

### Summary: Can code fully replace LLM matching?

| Reason LLM was used | Code solution | Complexity |
|--------------------|--------------|------------|
| Unit normalization during match | Pre-normalize in extraction post-processing | Low |
| DB field semantic ambiguity | `DB_FIELD_SEMANTICS` constant per category | Low |
| Gauge inference from height | Already in `mergeTakeoffWithMaterialMatch.ts` | Zero (already done) |
| R-value inference from depth | `CAVITY_DEPTH_TO_RVALUE` constant | Low |
| Auto-add dependent matches | Multi-pass `autoAddEngine.ts` | Medium |
| Natural language DB description | Tokenization + keyword overlap scoring | Medium |

**Verdict: Yes, code can replace LLM matching.** None of the reasons are fundamentally impossible to express in TypeScript. The LLM was used because it was faster to implement as a prompt. The code approach requires more upfront engineering but delivers consistent, testable, auditable results every single run.

---

## 3. Decision Matrix — Every Pipeline Step

| Pipeline Step | Current | New | Reason |
|--------------|---------|-----|--------|
| Parse takeoff Excel | Code | Code (unchanged) | Already deterministic |
| Extract assembly skeleton (IDs, types, ratings) | LLM (bundled) | **LLM — Flash** | PDF reading is irreplaceable |
| Extract material properties per category | LLM (all-at-once) | **LLM — Flash (chunked)** | PDF reading is irreplaceable |
| Categorize extracted item (which category does it belong to) | LLM | **Code** | Keyword rules on `raw_text` + extracted `type` |
| Match extracted properties → DB code | LLM | **Code (scoring engine)** | Structured numeric fields → DB lookup |
| Auto-add tracks (same gauge as stud) | LLM prompt rule | **Code (auto-add engine)** | Pure rule: track gauge = stud gauge |
| Auto-add screws/fasteners | LLM prompt rule | **Code (auto-add engine)** | Pure rule: layers × substrate type |
| Sealant type selection (firestop vs acoustical) | LLM prompt rule | **Code (auto-add engine)** | Pure rule: fire_rating present → firestop |
| Labor code selection by height | LLM → partially code | **Code (labor engine)** | Height category → DB lookup by code pattern |
| Height segmentation of labor rows | Already code | Code (unchanged) | Already in mergeTakeoffWithMaterialMatch |
| Steel framing gauge by height | Already code | Code (unchanged) | Already in mergeTakeoffWithMaterialMatch |
| Quantity computation | Already code | Code (unchanged) | `enrichFinalOutputWithQuantities.ts` |
| Takeoff merge (strategy 1) | Already code | Code (unchanged) | `mergeTakeoffWithMaterialMatch.ts` |
| Finalize AI fallback (strategy 2) | LLM | LLM (unchanged — low priority) | Needed when no takeoff available |

**LLM calls in the new architecture: 7 total (1 skeleton + 6 category extraction).
In the current architecture: 4–20+ LLM calls. Matching is eliminated entirely.**

---

## 4. How the PDF Is Sent — Current vs Image-Per-Page

### Current approach (what the code actually does)

Looking at `src/services/openrouter/extractAssemblies.ts`, the PDF is sent as:

```typescript
{
  type: "image_url",
  image_url: {
    url: `data:application/pdf;base64,${pdfBase64}`,
  },
}
```

**This is already a visual send.** The PDF is sent as a binary document, not as extracted text. Gemini receives the actual PDF — it reads both the embedded text layer AND the visual drawings/annotations. This is Gemini's native PDF handling, and it is already as close to "sending images" as you can get without converting page-by-page.

The PDF is NOT being parsed into text by a library and then sent as a string. It is the raw PDF file, base64-encoded, sent directly to Gemini.

---

### The "send as page images" option — analysis

Converting the PDF to per-page PNG images before sending is a real option, but the trade-offs are not straightforward:

**Why converting to page images COULD help:**
1. **Selective pages** — Spec sheets typically occupy only 3–5 pages of a larger drawing set. If the PDF is 30 pages, you can identify and send only the wall type pages (e.g., pages 5–9) and skip the cover sheet, TOC, plumbing pages, etc. This dramatically reduces tokens.
2. **Resolution control** — You can render each page at a specific DPI (e.g., 150 DPI is typically enough for specs). PDF files often embed very high-res images that inflate the base64 size.
3. **Per-page focus** — Ceiling assembly pages (often on later pages) can be sent separately to a dedicated extraction sub-step rather than hoping the model reads all 30 pages.
4. **Model compatibility** — Some edge cases where Gemini's PDF handling fails silently (e.g., encrypted PDFs, CAD-exported PDFs with unusual structure) are handled more reliably as rendered images.

**Why converting to page images could HURT:**
1. **Loss of text layer** — PDFs often have an embedded text layer (from the drafter's software). Gemini uses this for highly accurate text reading. Rendering to PNG drops the text layer — the model must then OCR from the image pixels, which is less accurate for small text.
2. **Size increase** — A 5-page PDF at 150 DPI becomes ~5 × 2MB PNG files = ~10MB base64, vs the original PDF which might be 2MB. The image approach typically uses MORE tokens, not fewer.
3. **Dependency** — Requires adding `pdfjs-dist` or `sharp` + a canvas renderer to the project. This is a meaningful dependency to take on.
4. **PDF-to-image conversion is server-side CPU-intensive** — Not a problem for occasional use but can slow down the API route for large drawing sets.

---

### Recommendation: Keep PDF-native, add page selection

The best approach is **not** to convert to PNG images, but to add **page range selection** to the extraction call. Gemini supports `data:application/pdf;base64,{blob}` natively and reads it well. The improvement to make is:

1. **Add a pre-scan step (new sub-step 0.5):** Before extraction, ask Gemini to identify which pages contain wall assembly specs. This is a cheap, fast call (~2s, minimal tokens). The output is a list of page numbers.

2. **Send only those pages to sub-steps 1.0–1.6:** Extract the relevant page range from the PDF using a lightweight library (`pdf-lib` — already potentially in use, zero new dependency if so). Send only the spec pages.

This gives you the benefit of "selective pages" without losing the text layer.

```typescript
// Sub-step 0.5 — Page Discovery (new, fast, Flash)
// Input: full PDF base64
// Prompt: "List the page numbers that contain wall/ceiling assembly specifications.
//          Return: { "spec_pages": [3, 4, 5, 9] }"
// Output: page list → used to slice PDF for all subsequent sub-steps

// Sub-steps 1.0–1.6 receive only the sliced PDF (spec pages only)
```

This is optional for Phase 1 but highly recommended for large drawing sets.

---

## 5. Revised Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 0 — Parse Takeoff Excel                            [CODE ONLY]  │
│ POST /api/parse-takeoff                                              │
│ Dual parser (OST + Raw) picks best score                             │
│ Output: TakeoffRows[] → DB                                           │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────┐
│ STEP 1 — Chunked Extraction                           [LLM — 7 calls]│
│ POST /api/extract                                                    │
│                                                                      │
│  1.0  Flash — Extract skeleton (IDs, type, fire_rating, stc_rating) │
│  1.1  Flash — Extract: gypsum_board + gypsum_sheathing              │
│  1.2  Flash — Extract: steel_framing                                │
│  1.3  Flash — Extract: insulation                                   │
│  1.4  Flash — Extract: vapor_barriers + sealants                    │
│  1.5  Flash — Extract: plywood + blocking_and_bracing               │
│  1.6  Flash — Extract: steel_deck + trim_and_accessories            │
│                                                                      │
│  Server-side merge → ExtractionResult (same shape as today)         │
│  Save → DB as assembly_extraction                                    │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────┐
│ STEP 2 — Code Matching Engine                          [CODE ONLY]   │
│ POST /api/match                                                      │
│                                                                      │
│  2.A  Build DB category index (O(n), instant)                       │
│  2.B  Per-category scoring (10 parallel passes)                     │
│       · gypsum_board    — thickness + type keywords                 │
│       · gypsum_sheathing — thickness + type + substrate             │
│       · steel_framing   — depth + gauge + stud/track type           │
│       · insulation      — R-value + type + depth                    │
│       · vapor_barriers  — type keywords                             │
│       · sealants        — [skipped — handled by auto-add]           │
│       · plywood         — thickness + grade                         │
│       · blocking        — size + material type                      │
│       · steel_deck      — gauge + profile type                      │
│       · trim            — type + profile                            │
│  2.C  Auto-add rules engine (tracks, screws, sealants, layout)      │
│  2.D  Labor matching engine (height-based DB lookup)                │
│  2.E  Confidence scoring → low-confidence items flagged in UI       │
│                                                                      │
│  Output: MaterialCosting[] — identical shape to today               │
│  Save → DB as material_match                                         │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────┐
│ STEP 3 — Finalize                                      [CODE ONLY]   │
│ POST /api/finalize                                                   │
│                                                                      │
│  Strategy 1 (preferred, takeoff available):                          │
│    mergeTakeoffWithMaterialMatch() — no changes needed               │
│    Height segmentation, gauge filtering — already code               │
│    enrichFinalOutputWithQuantities() — no changes needed             │
│                                                                      │
│  Strategy 2 (fallback, no takeoff — lower priority):                │
│    AI finalize in batches — unchanged for now                        │
│                                                                      │
│  Output: FinalOutputAssembly[] → DB                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Step 1 — Chunked Extraction (LLM Only)

This is the only part of the pipeline that requires a language model. The PDF is an unstructured visual document — spec drawings, hand annotations, tables in various layouts. Only an LLM can reliably read it.

### Why chunked instead of one big call

Sending a PDF with instructions to extract all 10 material categories at once fails because:
- Low-frequency categories (steel_deck, blocking_and_bracing) get dropped once the model's attention is exhausted
- Category boundary confusion: `gypsum_sheathing` vs `gypsum_board` vs insulation gets blurred
- Large output JSON increases hallucination risk (model "fills in" what it cannot read)
- A single failure aborts the entire extraction — no partial recovery

Chunking solves all four problems. Each sub-step is independent and recoverable.

---

### Sub-step 1.0 — Assembly Skeleton

**Purpose:** Establish the ground-truth list of assemblies before any material extraction begins. Every subsequent sub-step receives this list as context so it knows exactly which assemblies to populate (and which IDs are valid to return).

**Input:** PDF only  
**Output:**
```json
[
  { "assembly_id": "W14", "assembly_type": "Interior Walls", "fire_rating": "1 HR", "stc_rating": "STC 50" },
  { "assembly_id": "C01", "assembly_type": "Ceiling", "fire_rating": null, "stc_rating": null }
]
```

**Why this is accurate:** The LLM is only looking for assembly labels, codes, and ratings — not interpreting material specs. These are almost always visually distinct on spec sheets. Recall on this sub-step should be near 100%.

**Model:** `google/gemini-2.5-flash`

---

### Sub-steps 1.1–1.6 — Per-Category Material Property Extraction

Each sub-step:
- Receives the PDF
- Receives the skeleton (assembly list) — anchor for which assemblies to fill
- Extracts **exactly the named categories only**
- Returns only the structured properties the code matching engine needs

**Category groupings:**

| Sub-step | Categories Extracted | Model | Reason for Grouping |
|----------|---------------------|-------|---------------------|
| 1.1 | `gypsum_board` + `gypsum_sheathing` | Flash | Both board products — model learns to distinguish interior vs exterior use within one call |
| 1.2 | `steel_framing` | Flash | Most parameter-dense category (gauge, depth, spacing, type, mil); needs dedicated focus |
| 1.3 | `insulation` | Flash | Second-most complex (R-value, depth, type, batt/spray/board); alone avoids cavity depth confusion |
| 1.4 | `vapor_barriers` + `sealants` | Flash | Both thin-layer moisture/fire control products; note: sealant matching is handled by auto-add engine, not this extraction |
| 1.5 | `plywood` + `blocking_and_bracing` | Flash | Both wood-substrate products; rarely appear together so no confusion risk |
| 1.6 | `steel_deck` + `trim_and_accessories` | Flash | Lower frequency categories; safe to pair |

**What the LLM must output for each extracted item** (structured properties — NOT a DB code):
```json
{
  "assembly_id": "W14",
  "steel_framing": [
    {
      "raw_text": "3-5/8\" 20 ga. stud @ 16\" OC",
      "type": "stud",
      "depth": 3.625,
      "gauge": "20",
      "spacing": 16,
      "layers": null,
      "thickness": null,
      "r_value": null,
      "description": "Metal stud at 16\" OC"
    }
  ]
}
```

**Critical instruction in every extraction prompt:** The LLM outputs structured properties from what it reads in the PDF. It does **not** attempt to match to a database code. That is the code engine's job.

---

### Extraction Prompt Design Rules

Each sub-step prompt must:
1. State the category scope in line 1: "Extract ONLY [category] items"
2. Define the category in 3–5 words to anchor intent
3. Explicitly exclude the other 9 categories by name
4. Show only the output schema fields for this category
5. Instruct: "Do not guess or infer — if you cannot confidently read a value, leave the field null"
6. Be under 25 lines — brevity prevents the model from over-fitting to examples

**Prompt keys in `ai_prompts` table:**

| Key | Sub-step |
|-----|---------|
| `extract_skeleton` | 1.0 |
| `extract_gypsum` | 1.1 |
| `extract_steel_framing` | 1.2 |
| `extract_insulation` | 1.3 |
| `extract_moisture_control` | 1.4 |
| `extract_wood_substrates` | 1.5 |
| `extract_specialty` | 1.6 |

---

### Server-Side Merge (pure code, no LLM)

After all 7 LLM calls complete, results are merged server-side:

```typescript
// src/services/extraction/mergeExtractionChunks.ts

export function mergeExtractionChunks(
  skeleton: AssemblySkeleton[],
  chunks: Record<ExtractChunkId, AssemblyChunkResult[]>,
): AssemblyData[] {
  return skeleton.map((skel) => {
    const merged: AssemblyData = {
      assembly_id: skel.assembly_id,
      assembly_type: skel.assembly_type,
      fire_rating: skel.fire_rating,
      stc_rating: skel.stc_rating,
      materials: buildEmptyMaterials(), // all 10 categories start empty
    };

    for (const [chunkId, chunkResults] of Object.entries(chunks)) {
      const match = chunkResults.find(r => r.assembly_id === skel.assembly_id);
      if (!match) continue;
      // Merge only the categories owned by this chunk
      for (const cat of CHUNK_CATEGORY_MAP[chunkId as ExtractChunkId]) {
        merged.materials[cat] = match[cat] ?? [];
      }
    }

    return merged;
  });
}
```

**Validation before merge:** Any assembly ID in a chunk result that does not exist in the skeleton is dropped with a warning logged — this catches LLM hallucinations of new assembly IDs.

The merged output is identical in shape to today's `ExtractionResult.assemblies[]`. The save step and everything downstream are unchanged.

---

## 7. Step 2 — Code Matching Engine (Zero LLM)

This is the biggest change. The entire matching step is replaced with deterministic TypeScript code.

**Why this works:** After Step 1, every material item has structured fields extracted by the LLM:
- `thickness` (number, inches)
- `gauge` (string, e.g., "20")
- `depth` (number, inches)
- `spacing` (integer, inches)
- `r_value` (string)
- `type` (string, e.g., "stud", "Type X", "batt")
- `layers` (integer)
- `raw_text` (original verbatim spec text)

The `spec_database` has corresponding columns:
- `size` (thickness for boards, spacing for studs)
- `gauge` (string)
- `width` (depth for framing)
- `type` (keywords in description)
- `category` (primary filter key)

Matching these is a structured scoring problem — exactly what code does best.

---

### 2.A — DB Category Index

Built once per pipeline run. O(n) pass over the cached material DB.

```typescript
// src/lib/utils/buildMaterialDbIndex.ts

export type ExtractCategory =
  | 'gypsum_board' | 'gypsum_sheathing' | 'steel_framing' | 'insulation'
  | 'vapor_barriers' | 'sealants' | 'plywood' | 'blocking_and_bracing'
  | 'steel_deck' | 'trim_and_accessories';

// Maps extraction category → DB category column values
// These are the source-of-truth category strings in spec_database.category
export const CATEGORY_DB_MAP: Record<ExtractCategory, string[]> = {
  gypsum_board:          ['GWB', 'Drywall', 'Gypsum Board'],
  gypsum_sheathing:      ['Gypsum Sheathing', 'Sheathing'],
  steel_framing:         ['Framing', 'Steel Framing', 'Light Gauge Framing'],
  insulation:            ['Insulation', 'Batt Insulation', 'Spray Foam'],
  vapor_barriers:        ['Vapor Barrier', 'Air Barrier'],
  sealants:              ['Sealant', 'Acoustical Sealant', 'Firestop Sealant'],
  plywood:               ['Plywood', 'OSB', 'Wood Panel'],
  blocking_and_bracing:  ['Blocking', 'Bracing', 'Wood Blocking'],
  steel_deck:            ['Steel Deck', 'Metal Deck'],
  trim_and_accessories:  ['Trim', 'Corner Bead', 'Control Joint', 'Accessories'],
};

export interface MaterialDbIndex {
  byCategory: Record<ExtractCategory, MaterialDefinition[]>;
  labor: MaterialDefinition[];      // all rows where type = 'labor'
  fasteners: MaterialDefinition[]; // screws, anchors, etc.
  all: MaterialDefinition[];
}

export function buildMaterialDbIndex(materials: MaterialDefinition[]): MaterialDbIndex {
  const byCategory = {} as Record<ExtractCategory, MaterialDefinition[]>;

  for (const [cat, dbCategories] of Object.entries(CATEGORY_DB_MAP)) {
    byCategory[cat as ExtractCategory] = materials.filter(m =>
      dbCategories.some(c => m.category?.toLowerCase() === c.toLowerCase()),
    );
  }

  return {
    byCategory,
    labor: materials.filter(m => m.type?.toLowerCase() === 'labor'),
    fasteners: materials.filter(m =>
      ['screw', 'fastener', 'anchor', 'nail'].some(k =>
        m.description?.toLowerCase().includes(k),
      ),
    ),
    all: materials,
  };
}
```

**Context size reduction:**

| Category | Full DB rows | Filtered rows | Reduction |
|----------|-------------|---------------|-----------|
| gypsum_board | 800+ | ~80–120 | ~85% |
| steel_framing | 800+ | ~100–150 | ~82% |
| insulation | 800+ | ~40–60 | ~93% |
| sealants | 800+ | ~10–15 | ~98% |
| vapor_barriers | 800+ | ~8–12 | ~98% |

---

### 2.B — Per-Category Scoring Engine

Each category has a dedicated pure scoring function. Scoring functions never produce a match on their own — they return a ranked candidate list. The caller selects the top candidate above the confidence threshold.

```typescript
// src/lib/matching/scorers/scoreGwb.ts

export function scoreGwb(
  extracted: MaterialItem,
  db: MaterialDefinition,
): number {
  let score = 0;

  // ── Thickness (most important for GWB) ──────────────────────────────
  if (extracted.thickness !== undefined && db.size) {
    const dbThickness = parseFloat(db.size);
    const extractedInches = toInches(extracted.thickness); // mm→in if needed
    const diff = Math.abs(extractedInches - dbThickness);
    if (diff < 0.005) score += 60;       // exact match (e.g., 0.625 == 0.625)
    else if (diff < 0.0625) score += 30; // within 1/16"
    else if (diff > 0.125) score -= 40;  // hard penalty — wrong thickness
  }

  // ── Type keywords (Type X, Type C, Regular, Shaftliner) ─────────────
  if (extracted.type && db.description) {
    const desc = db.description.toLowerCase();
    const extType = extracted.type.toLowerCase().trim();
    if (desc.includes(extType)) score += 30;
    // Shaftliner is a hard requirement — penalise non-shaftliner matches
    if (extType.includes('shaftliner') && !desc.includes('shaftliner')) score -= 50;
    if (!extType.includes('shaftliner') && desc.includes('shaftliner')) score -= 50;
  }

  // ── Layers bonus (3-layer spec → prefer products noted for multi-layer) ─
  if (extracted.layers && extracted.layers > 1 && db.description?.toLowerCase().includes('multi')) {
    score += 10;
  }

  return score;
}
```

```typescript
// src/lib/matching/scorers/scoreFraming.ts

export function scoreFraming(
  extracted: MaterialItem,
  db: MaterialDefinition,
  assemblyHeightFt: number,
): number {
  let score = 0;

  // ── Stud vs Track — must match (hard exclusion if wrong) ────────────
  const extractedIsStud = isStudType(extracted.type);
  const extractedIsTrack = isTrackType(extracted.type);
  const dbIsStud = isStudType(db.description);
  const dbIsTrack = isTrackType(db.description);
  if (extractedIsStud && dbIsTrack) return -999; // hard exclude
  if (extractedIsTrack && dbIsStud) return -999; // hard exclude

  // ── Depth (most important structural dimension) ──────────────────────
  if (extracted.depth !== undefined && db.width) {
    const dbDepth = parseFloat(db.width);
    const diff = Math.abs(extracted.depth - dbDepth);
    if (diff < 0.005) score += 60;      // exact
    else if (diff < 0.0625) score += 20; // within 1/16"
    else return -999;                   // wrong depth = hard exclude
  }

  // ── Gauge — prefer extracted gauge, fall back to height-driven default ─
  const targetGauge = extracted.gauge?.replace(/\D/g, '') ?? getDefaultGauge(assemblyHeightFt);
  if (db.gauge === targetGauge) score += 40;
  else if (db.gauge) score -= 20; // wrong gauge is a meaningful penalty

  // ── Spacing (studs only — tracks have no spacing) ────────────────────
  if (extractedIsStud && extracted.spacing !== undefined && db.size) {
    const dbSpacing = parseInt(db.size, 10);
    if (!isNaN(dbSpacing) && extracted.spacing === dbSpacing) score += 20;
  }

  // ── CH / Furring / Special types ─────────────────────────────────────
  if (isCHType(extracted.type) && !db.description?.toLowerCase().includes('ch')) score -= 30;
  if (isFurringType(extracted.type) && !db.description?.toLowerCase().includes('furring')) score -= 30;

  return score;
}
```

```typescript
// src/lib/matching/scorers/scoreInsulation.ts

export function scoreInsulation(
  extracted: MaterialItem,
  db: MaterialDefinition,
): number {
  let score = 0;

  // ── Insulation type (batt, spray foam, rigid board) — hard exclusion ─
  const extractedSubtype = inferInsulationType(extracted); // 'batt' | 'spray' | 'board'
  const dbSubtype = inferInsulationType(db);
  if (extractedSubtype && dbSubtype && extractedSubtype !== dbSubtype) return -999;

  // ── R-value (most important spec for insulation) ─────────────────────
  if (extracted.r_value && db.description) {
    // Normalise both: "R-19", "R19", "19" → 19
    const extractedR = parseRValue(extracted.r_value);
    const dbR = parseRValue(db.description);
    if (extractedR !== null && dbR !== null) {
      if (extractedR === dbR) score += 60;
      else if (Math.abs(extractedR - dbR) <= 2) score += 20; // close R-value
      else score -= 40; // wrong R-value is significant
    }
  }

  // ── Depth / thickness ─────────────────────────────────────────────────
  if (extracted.depth !== undefined && db.size) {
    const diff = Math.abs(extracted.depth - parseFloat(db.size));
    if (diff < 0.25) score += 30;
    else if (diff > 1.0) score -= 20;
  }

  return score;
}
```

**Scorer registry — extensible, never hard-coded:**

```typescript
// src/lib/matching/scorers/index.ts

type ScorerFn = (extracted: MaterialItem, db: MaterialDefinition, ctx: MatchContext) => number;

export const CATEGORY_SCORERS: Record<ExtractCategory, ScorerFn> = {
  gypsum_board:         (e, d, _) => scoreGwb(e, d),
  gypsum_sheathing:     (e, d, _) => scoreSheathing(e, d),
  steel_framing:        (e, d, c) => scoreFraming(e, d, c.assemblyHeightFt),
  insulation:           (e, d, _) => scoreInsulation(e, d),
  vapor_barriers:       (e, d, _) => scoreVaporBarrier(e, d),
  sealants:             (_e, _d, _) => 0, // handled entirely by auto-add engine
  plywood:              (e, d, _) => scorePlywood(e, d),
  blocking_and_bracing: (e, d, _) => scoreBlocking(e, d),
  steel_deck:           (e, d, _) => scoreSteelDeck(e, d),
  trim_and_accessories: (e, d, _) => scoreTrim(e, d),
};
```

Adding a new material category in the future = write one new scorer function + register it here. Nothing else changes.

---

### Confidence Thresholds

Every match produces a confidence level:

| Score | Confidence | Action |
|-------|-----------|--------|
| ≥ 80 | `exact` | Auto-accept, no review flag |
| 50–79 | `high` | Auto-accept, show in UI as confident |
| 20–49 | `medium` | Accept tentatively, flag for review in UI |
| 1–19 | `low` | Accept as best-guess, `review_notes` set, highlighted in UI |
| ≤ 0 | `unmatched` | No match applied, empty entry with `review_notes` = "No DB match found" |

The UI already has a `review_notes` field on each assembly. Low-confidence and unmatched items populate this field automatically.

---

### The Match Orchestrator

```typescript
// src/lib/matching/matchOrchestrator.ts

export function matchAssemblies(
  extractedAssemblies: AssemblyData[],
  dbIndex: MaterialDbIndex,
): MaterialCosting[] {
  return extractedAssemblies.map((assembly) => {
    const costingItems: MaterialsCostingItem[] = [];
    const context: MatchContext = { assemblyHeightFt: assembly.height_ft ?? 10 };

    // 2.B — Score each extracted item against its category slice
    for (const [category, items] of Object.entries(assembly.materials)) {
      const cat = category as ExtractCategory;
      if (cat === 'sealants') continue; // handled by auto-add engine
      const scorer = CATEGORY_SCORERS[cat];
      const dbSlice = dbIndex.byCategory[cat] ?? [];

      for (const extracted of items) {
        const candidates = dbSlice
          .map(db => ({ db, score: scorer(extracted, db, context) }))
          .filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score);

        const top = candidates[0];
        const confidence = toConfidence(top?.score ?? 0);

        costingItems.push({
          extracted_material: extracted,
          matched_materials: top ? [toMatchedMaterial(top.db, confidence)] : [],
          matched_labor: [], // filled by labor engine in 2.D
          _confidence: confidence, // internal field, stripped before save
          _category: cat,          // internal field, stripped before save
        });
      }
    }

    // 2.C — Auto-add engine
    const augmented = applyAutoAddRules(costingItems, assembly, dbIndex);

    // 2.D — Labor engine
    const withLabor = attachLabor(augmented, assembly, dbIndex.labor);

    return {
      assembly_id: assembly.assembly_id,
      materials_costing: withLabor,
    };
  });
}
```

---

### 2.C — Auto-Add Rules Engine

Rules that were previously buried in the LLM matching prompt are now deterministic code. They run after the scoring engine has produced its primary matches.

```typescript
// src/lib/matching/autoAddEngine.ts

export function applyAutoAddRules(
  items: MaterialsCostingItem[],
  assembly: AssemblyData,
  dbIndex: MaterialDbIndex,
): MaterialsCostingItem[] {
  const additions: MaterialsCostingItem[] = [];
  const existingCodes = new Set(
    items.flatMap(i => i.matched_materials.map(m => m.code)),
  );

  // ── Rule 1: For every matched stud, add the matching track ───────────
  // Track must have the same depth and EXACT same gauge as the stud.
  for (const item of items) {
    if (item._category !== 'steel_framing') continue;
    for (const mat of item.matched_materials) {
      if (!isStud(mat.code, mat.description)) continue;
      const track = findMatchingTrack(mat, dbIndex.byCategory.steel_framing);
      if (track && !existingCodes.has(track.code)) {
        existingCodes.add(track.code);
        additions.push(makeAutoAddItem(item.extracted_material, track, 'auto:track'));
      }
    }
  }

  // ── Rule 2: For every matched GWB, add appropriate screws ───────────
  for (const item of items) {
    if (item._category !== 'gypsum_board' && item._category !== 'gypsum_sheathing') continue;
    for (const mat of item.matched_materials) {
      const screws = findMatchingScrews(mat, item.extracted_material.layers ?? 1, dbIndex.fasteners);
      for (const screw of screws) {
        if (!existingCodes.has(screw.code)) {
          existingCodes.add(screw.code);
          additions.push(makeAutoAddItem(item.extracted_material, screw, 'auto:screw'));
        }
      }
    }
  }

  // ── Rule 3: Sealant — exactly one per assembly, type driven by fire_rating ─
  // This rule is applied once regardless of how many materials are in the assembly.
  const hasFireRating =
    assembly.fire_rating !== null &&
    assembly.fire_rating !== undefined &&
    !['na', 'n/a', 'none', ''].includes(assembly.fire_rating.toLowerCase().trim());

  const sealantCode = hasFireRating
    ? findSealantCode(dbIndex.byCategory.sealants, 'firestop')
    : findSealantCode(dbIndex.byCategory.sealants, 'acoustical');

  if (sealantCode && !existingCodes.has(sealantCode.code)) {
    existingCodes.add(sealantCode.code);
    additions.push(makeAutoAddItem(null, sealantCode, 'auto:sealant'));
  }

  // ── Rule 4: Layout crew — if studs matched ──────────────────────────
  const hasStuds = items.some(
    i => i._category === 'steel_framing' &&
      i.matched_materials.some(m => isStud(m.code, m.description)),
  );
  if (hasStuds) {
    const layoutLabor = dbIndex.labor.find(l => isLayoutLabor(l.code));
    if (layoutLabor && !existingCodes.has(layoutLabor.code)) {
      existingCodes.add(layoutLabor.code);
      additions.push(makeAutoAddItem(null, layoutLabor, 'auto:layout'));
    }
  }

  return [...items, ...additions];
}
```

**Adding a new auto-add rule in the future:** Add one `if` block here. No prompt changes, no LLM retraining, instant effect.

---

### 2.D — Labor Matching Engine

Labor is selected by a deterministic height-based lookup. The height category rules are already implemented in `mergeTakeoffWithMaterialMatch.ts` — the labor engine reuses the same logic.

```typescript
// src/lib/matching/laborEngine.ts

// Labor code patterns — extensible via constants file
// Keys are 'exact' codes or regex patterns that appear in DB labor entries
export const LABOR_PATTERNS: Record<ExtractCategory, LaborPattern[]> = {
  gypsum_board: [
    { heightDependent: true, codeKeyword: 'DRYWALL-HANG', condition: () => true },
    { heightDependent: true, codeKeyword: 'DRYWALL-FINISH', condition: (mat) => isFinished(mat) },
  ],
  gypsum_sheathing: [
    { heightDependent: false, codeKeyword: 'SHAFTLINER', condition: (mat) => isShaftliner(mat) },
    { heightDependent: true, codeKeyword: 'SHEATHING-INSTALL', condition: () => true },
  ],
  steel_framing: [
    { heightDependent: true, codeKeyword: 'FRAMING-STUD', condition: (mat) => isStud(mat.code, mat.description) },
    { heightDependent: true, codeKeyword: 'FRAMING-SHAFT', condition: (mat) => isCHStud(mat.code) },
    { heightDependent: true, codeKeyword: 'FURRING', condition: (mat) => isFurring(mat.code) },
  ],
  insulation: [
    { heightDependent: false, codeKeyword: 'INSULATION-SPRAY', condition: (mat) => isSprayFoam(mat) },
    { heightDependent: true, codeKeyword: 'INSULATION-BATT', condition: (mat) => isBattInsulation(mat) },
  ],
  // sealants, vapor_barriers — handled by auto-add engine (labor included with sealant)
  // plywood, blocking, steel_deck, trim — add patterns as needed
  vapor_barriers: [],
  sealants: [],
  plywood: [],
  blocking_and_bracing: [],
  steel_deck: [],
  trim_and_accessories: [],
};

export function attachLabor(
  items: MaterialsCostingItem[],
  assembly: AssemblyData,
  laborDb: MaterialDefinition[],
): MaterialsCostingItem[] {
  const heightFt = assembly.height_ft ?? 10;
  const heightCategory = getHeightCategory(heightFt); // reuses existing util

  return items.map((item) => {
    const patterns = LABOR_PATTERNS[item._category as ExtractCategory] ?? [];
    const laborItems: MatchedLabor[] = [];

    for (const mat of item.matched_materials) {
      for (const pattern of patterns) {
        if (!pattern.condition(mat)) continue;

        // Find matching labor entry in DB
        const laborEntry = laborDb.find(l => {
          const hasKeyword = l.code.includes(pattern.codeKeyword) ||
            l.description?.toLowerCase().includes(pattern.codeKeyword.toLowerCase());
          if (!hasKeyword) return false;
          if (pattern.heightDependent) {
            return l.description?.includes(heightCategory) ?? false;
          }
          return true;
        });

        if (laborEntry) {
          laborItems.push(toMatchedLabor(laborEntry, heightFt, heightCategory));
        }
      }
    }

    return { ...item, matched_labor: laborItems };
  });
}
```

**Adding a new labor type in the future:** Add a pattern to `LABOR_PATTERNS` for the relevant category. No LLM changes.

---

## 8. Step 3 — Finalize (Already Pure Code)

No changes needed.

**Strategy 1 (takeoff available):** `mergeTakeoffWithMaterialMatch.ts` — pure code. Already handles:
- Takeoff row aggregation by (assembly_id, height_ft)
- Height segmentation of labor into sub-rows
- Steel framing gauge filtering by height
- `enrichFinalOutputWithQuantities.ts` for quantity computation

**Strategy 2 (no takeoff):** AI fallback in batches — kept as-is. Low priority for refactoring since Strategy 1 is the preferred path and covers ~95% of projects.

---

## 9. Debug Output Files — Analyze Every Step

To let you see exactly where the pipeline breaks for a given PDF, every sub-step writes a local JSON file. These files contain the raw output of that step before it is processed by the next step. You can open them, inspect the data, and pinpoint which sub-step produced wrong or missing output.

### File layout

```
debug/
└── pipeline-runs/
    └── {runId}/
        ├── 00_takeoff_parsed.json         ← Step 0: parsed takeoff rows
        ├── 01_skeleton.json               ← Sub-step 1.0: assembly IDs, types, ratings
        ├── 02_extraction_gypsum.json      ← Sub-step 1.1: raw LLM output (gypsum_board + sheathing)
        ├── 03_extraction_framing.json     ← Sub-step 1.2: raw LLM output (steel_framing)
        ├── 04_extraction_insulation.json  ← Sub-step 1.3: raw LLM output (insulation)
        ├── 05_extraction_moisture.json    ← Sub-step 1.4: raw LLM output (vapor + sealants)
        ├── 06_extraction_wood.json        ← Sub-step 1.5: raw LLM output (plywood + blocking)
        ├── 07_extraction_specialty.json   ← Sub-step 1.6: raw LLM output (steel_deck + trim)
        ├── 08_extraction_merged.json      ← Merged extraction (all categories combined per assembly)
        ├── 09_extraction_normalized.json  ← After unit normalization (mm→in, spacing, depth)
        ├── 10_match_scored.json           ← Code matching: candidates + scores per item
        ├── 11_match_auto_adds.json        ← Auto-add engine output (tracks, screws, sealants added)
        ├── 12_match_with_labor.json       ← After labor engine attachment
        ├── 13_match_final.json            ← Final MaterialCosting[] saved to DB
        └── 14_finalize_output.json        ← Final FinalOutputAssembly[] after takeoff merge
```

Each file is written immediately after its step completes, before the next step begins. If the pipeline crashes mid-run, you will have all files up to the crash point.

---

### What each file tells you

| File | What to look for |
|------|-----------------|
| `01_skeleton.json` | Are all assembly IDs correct? Is any assembly missing? Are fire_ratings captured? |
| `02–07_extraction_*.json` | Raw LLM output per category. Are extracted fields present (thickness, gauge, depth, r_value)? Are the correct items returned for each assembly? |
| `08_extraction_merged.json` | Full picture after merge. Are all 10 categories populated correctly across all assemblies? |
| `09_extraction_normalized.json` | After unit conversion. Are mm values correctly converted to inches? Are spacing values integers? |
| `10_match_scored.json` | **Most useful for debugging matching.** Shows every DB candidate with its score. Helps answer: "Why did it pick GYP-258-58 over GYP-258-12?" |
| `11_match_auto_adds.json` | Did tracks get added for every stud? Did sealants get added? Are fire ratings being used correctly? |
| `12_match_with_labor.json` | Did labor attach correctly? Is the height category right? |
| `13_match_final.json` | What the DB saves — identical to what the reports tabs read. |
| `14_finalize_output.json` | Final output with quantities. Are quantities computed? Are height segments right? |

---

### Implementation

Debug output is gated by an environment variable to keep production clean:

```typescript
// src/lib/debug/pipelineDebug.ts

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const DEBUG_ENABLED = process.env.DEBUG_PIPELINE === 'true';
const DEBUG_BASE = path.join(process.cwd(), 'debug', 'pipeline-runs');

export async function writeDebugFile(
  runId: string,
  filename: string,
  data: unknown,
): Promise<void> {
  if (!DEBUG_ENABLED) return;

  const dir = path.join(DEBUG_BASE, runId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, filename),
    JSON.stringify(data, null, 2),
    'utf-8',
  );
  console.log(`[debug] Wrote ${filename}`);
}
```

Add to `.env.local` to enable:
```
DEBUG_PIPELINE=true
```

Add to `.gitignore`:
```
debug/
```

**Usage at each pipeline step:**

```typescript
// In /api/extract route — after sub-step 1.0:
await writeDebugFile(runId, '01_skeleton.json', skeletonResult);

// After sub-step 1.1:
await writeDebugFile(runId, '02_extraction_gypsum.json', gypsumChunkResult);

// ... etc for each sub-step

// After merge:
await writeDebugFile(runId, '08_extraction_merged.json', mergedExtraction);

// In /api/match route — after scoring:
await writeDebugFile(runId, '10_match_scored.json', {
  assemblies: scoredResults.map(a => ({
    assembly_id: a.assembly_id,
    items: a.items.map(item => ({
      category: item._category,
      extracted: item.extracted_material,
      candidates: item._scoredCandidates.slice(0, 5), // top 5 candidates with scores
      selected: item.matched_materials[0] ?? null,
      confidence: item._confidence,
    })),
  })),
});

// After auto-adds:
await writeDebugFile(runId, '11_match_auto_adds.json', afterAutoAdd);
```

The scored candidates in file `10_match_scored.json` are the most valuable diagnostic. Example:

```json
{
  "assembly_id": "W14",
  "items": [
    {
      "category": "steel_framing",
      "extracted": { "raw_text": "3-5/8\" 20ga stud @ 16\" OC", "depth": 3.625, "gauge": "20", "spacing": 16, "type": "stud" },
      "candidates": [
        { "code": "ST-358-20-16", "score": 120, "matchedFields": ["depth_exact", "gauge_exact", "spacing_exact", "stud_type"] },
        { "code": "ST-358-25-16", "score": 80,  "matchedFields": ["depth_exact", "spacing_exact", "stud_type"] },
        { "code": "ST-358-18-16", "score": 75,  "matchedFields": ["depth_exact", "spacing_exact", "stud_type"] },
        { "code": "TR-358-20",    "score": -999, "matchedFields": [] }
      ],
      "selected": { "code": "ST-358-20-16", "description": "3-5/8\" 20ga Steel Stud 16\" OC" },
      "confidence": "exact"
    }
  ]
}
```

This makes it immediately obvious why the engine picked what it did, and what the next-best alternatives were.

---

## 10. Future-Proof Design Principles

These principles ensure the pipeline handles any assembly it has never seen before without code changes.

### Principle 1 — Property-Based, Not Assembly-Based

The pipeline has **zero knowledge of specific assembly codes** (W14, C01, etc.). It knows only about physical properties: `thickness`, `gauge`, `depth`, `spacing`, `r_value`. A new assembly type like "Z-99" with `gypsum_board: [{ thickness: 0.625, type: "Type X" }]` is matched exactly as well as W14.

**What this means in practice:**
- No hardcoded assembly code lookups in the matching engine
- No `if (assembly_id === 'W14')` branches anywhere in the codebase
- New assembly types work on the first run, with no code changes

### Principle 2 — DB-Driven Extensibility

The material catalog is in `spec_database`. Adding a new material to that table is sufficient for the system to find and match it. No code changes, no prompt updates, no redeployment.

**The guarantee:** If a material exists in `spec_database` with correct `category`, `size`, `gauge`, and `description` fields, the scoring engine will find it for any future project that uses it.

### Principle 3 — Category-Pluggable Architecture

Adding a new material category (e.g., `acoustic_ceiling_tile` for a future ceiling tile assembly type) requires:
1. Add a new extraction prompt (one `.txt` file + `ai_prompts` table row)
2. Add the category to `CATEGORY_DB_MAP` with its DB category values
3. Write one new scorer function (pure TypeScript, ~30 lines)
4. Register it in `CATEGORY_SCORERS`
5. Add labor patterns to `LABOR_PATTERNS` if applicable

No other files change. No architecture change.

### Principle 4 — Transparent Confidence, No Silent Failures

Every matched material has a confidence level. Low-confidence matches are visible in the UI (`review_notes`, highlighted rows). The pipeline never silently returns a wrong match — it either matches confidently or flags the item for human review.

This is the property that makes the system trustworthy on novel assemblies: when it does not know, it says so rather than guessing.

### Principle 5 — Rules in Code, Not in Prompts

All business logic (sealant type, track gauge, screw selection, labor height, gauge by height) lives in TypeScript constants and functions — not in LLM prompt text. This means:
- Rules are version-controlled
- Rules can be tested with unit tests
- Rules apply 100% consistently every single run
- Rules can be changed without re-deploying a prompt or waiting for an LLM to "learn" the change

### Principle 6 — Extraction Prompts Are Tunable Without Architecture Changes

Since extraction prompts are stored in `ai_prompts` (DB), an admin can tune them without a code deploy. A tuned prompt for `extract_steel_framing` does not affect any other sub-step. Isolated tuning = no risk of regression.

---

## 11. Model Selection

All LLM calls in the new architecture use a single model choice per call type.

| Call | Model | Rationale |
|------|-------|-----------|
| Sub-step 1.0 — skeleton | `google/gemini-2.5-flash` | Simple listing task. Assembly IDs and ratings are visually distinct. Flash handles this reliably. |
| Sub-steps 1.1–1.6 — category extraction | `google/gemini-2.5-flash` | Each call is now focused (one or two categories, structured output schema, short prompt). Flash is sufficient because the scope per call is narrow. |
| Strategy 2 finalize fallback | `google/gemini-2.5-flash` | Downgraded from Pro — the output schema is simpler now that matching rules are in code. Flash handles the reduced scope. |
| Matching step | **No model — code only** | Eliminated entirely. |

**Why Flash for everything (not Pro):**
- Flash has strong PDF vision capability with focused prompts
- Pro's advantage is multi-step reasoning over large, ambiguous context — not what focused extraction needs
- Flash is ~10× cheaper and ~3× faster than Pro
- If a specific sub-step consistently fails with Flash for a particular customer's PDF style, that one sub-step can be upgraded to Pro independently (the feature flag makes this a config change, not a code change)

**The rule:** Start with Flash everywhere. Upgrade to Pro only on measured failure of a specific sub-step.

---

## 12. Confidence Scoring and Review Flags

### Score interpretation

```
Score ≥ 80  → confidence: 'exact'     → auto-accept, no UI flag
Score 50–79 → confidence: 'high'      → auto-accept, shown normally in UI
Score 20–49 → confidence: 'medium'    → auto-accept, yellow indicator in UI
Score 1–19  → confidence: 'low'       → accepted, orange indicator, review_notes set
Score ≤ 0   → confidence: 'unmatched' → no match applied, red indicator, manual entry required
```

### review_notes field

`review_notes` on each `FinalOutputAssembly` already exists. In the new architecture it is extended to carry per-item confidence warnings:

```json
{
  "review_notes": "Low confidence match on steel_framing item 2 (score: 12) — verify gauge. No DB match found for insulation item 1 (R-21 batt 5.5\")."
}
```

### What the UI needs (minimal change)

The assembly table in the reports page already renders `review_notes`. The only addition needed is:
- A small confidence badge on each matched material row (color: green/yellow/orange/red)
- The badge is driven by `matched_materials[n]._confidence` (internal field, returned from match step, stripped before storing in final_output)

---

## 13. DB Category Index

### Caching strategy

The index is cheap to build (O(n) on an already-cached array). No separate caching needed. Built at the start of every `POST /api/match` call:

```typescript
// In /api/match route.ts:
const materialDb = await getMaterialDatabase();     // hits Redis or Supabase
const dbIndex = buildMaterialDbIndex(materialDb);   // ~2ms for 1000 rows
// dbIndex is used throughout the match step, then garbage-collected
```

### Index integrity

`CATEGORY_DB_MAP` must stay in sync with actual `spec_database.category` values. If a category string in the DB changes, `CATEGORY_DB_MAP` must be updated to match. Enforce this by adding an integration test that runs `buildMaterialDbIndex()` against the real DB and asserts each category slice is non-empty.

---

## 14. Changes Needed — File by File

### New files to create

| File | Purpose |
|------|---------|
| `src/services/extraction/extractAssemblySkeleton.ts` | Sub-step 1.0: skeleton LLM call |
| `src/services/extraction/extractCategoryChunk.ts` | Sub-steps 1.1–1.6: per-category LLM calls |
| `src/services/extraction/mergeExtractionChunks.ts` | Server-side merge of extraction results |
| `src/lib/utils/buildMaterialDbIndex.ts` | Category index builder |
| `src/lib/matching/matchOrchestrator.ts` | Main match engine entry point |
| `src/lib/matching/autoAddEngine.ts` | Track, screw, sealant, layout auto-add rules |
| `src/lib/matching/laborEngine.ts` | Height-based labor attachment |
| `src/lib/matching/scorers/scoreGwb.ts` | GWB + sheathing scorer |
| `src/lib/matching/scorers/scoreFraming.ts` | Steel framing scorer |
| `src/lib/matching/scorers/scoreInsulation.ts` | Insulation scorer |
| `src/lib/matching/scorers/scoreVaporBarrier.ts` | Vapor barrier scorer |
| `src/lib/matching/scorers/scorePlywood.ts` | Plywood/OSB scorer |
| `src/lib/matching/scorers/scoreBlocking.ts` | Blocking/bracing scorer |
| `src/lib/matching/scorers/scoreSteelDeck.ts` | Steel deck scorer |
| `src/lib/matching/scorers/scoreTrim.ts` | Trim/accessories scorer |
| `src/lib/matching/scorers/index.ts` | `CATEGORY_SCORERS` registry |
| `src/lib/matching/confidenceUtils.ts` | `toConfidence()`, score thresholds |
| `src/constants/extractionCategories.ts` | `CHUNK_CATEGORY_MAP`, `CATEGORY_DB_MAP`, `LABOR_PATTERNS` |
| `prompt/extract_skeleton.txt` | Skeleton prompt |
| `prompt/extract_gypsum.txt` | Gypsum extraction prompt |
| `prompt/extract_steel_framing.txt` | Steel framing extraction prompt |
| `prompt/extract_insulation.txt` | Insulation extraction prompt |
| `prompt/extract_moisture_control.txt` | Vapor barriers + sealants prompt |
| `prompt/extract_wood_substrates.txt` | Plywood + blocking prompt |
| `prompt/extract_specialty.txt` | Steel deck + trim prompt |

### Files to modify

| File | Change |
|------|--------|
| `src/app/api/extract/route.ts` | Replace single `extractAssembliesFromPDF()` call with 7-step orchestration. Add `mode` query param: `chunked` (new default) vs `legacy`. |
| `src/app/api/match/route.ts` | Replace `matchMaterialsToDatabase()` with `matchOrchestrator()` + `buildMaterialDbIndex()`. Remove all LLM calls. |
| `src/constants/aiPrompts.ts` | Add 7 new extraction prompt keys. Remove matching prompt keys (no longer used). |
| `src/context/PipelineContext.tsx` | Add `subStepLabel`, `subStepIndex`, `subStepTotal` for granular progress UI. |
| `src/components/features/reports/ImportFilesModal.tsx` | Update progress display to show sub-step label and per-step progress bar. |

### Files removed or deprecated

| File | Action |
|------|--------|
| `src/services/openrouter/matchMaterials.ts` | Deprecated — keep with `@deprecated` JSDoc but stop calling it. Remove in Pillar 4 cleanup. |
| `prompt/matchMaterials.txt` | Archived — move to `prompt/archive/`. The LLM no longer does matching. |

### Files unchanged

| File | Reason |
|------|--------|
| `src/app/api/finalize/route.ts` | Strategy 1 (code merge) is unchanged |
| `src/app/api/parse-takeoff/route.ts` | Already pure code |
| `src/lib/db/pipelineRuns.ts` | Run tracking schema is sufficient |
| `src/lib/utils/projectCosting.ts` | Final output shape unchanged |
| `src/lib/utils/markupChain.ts` | No impact |
| `src/lib/utils/enrichFinalOutputWithQuantities.ts` | No impact — quantity formulas unchanged |
| `src/lib/utils/assemblyJsonMapper.ts` | No impact — output shape unchanged |
| `src/lib/cache/materialDbCache.ts` | No change |
| `src/services/finalize/mergeTakeoffWithMaterialMatch.ts` | No change — height segmentation and gauge filtering already work |

---

## 15. Cost and Time Analysis

### API calls comparison

| Step | Current (LLM) | New (LLM) | New (Code) |
|------|--------------|-----------|-----------|
| Extract | 1 call (Pro) | 7 calls (Flash) | — |
| Match | N÷15 calls (Flash) | 0 calls | O(n × m) scoring, ~2–10ms |
| Total LLM calls | 4–20+ | **7** | — |

### Token cost (per 25-assembly project, estimated)

| Step | Current | New | Change |
|------|---------|-----|--------|
| Extract prompt + output tokens | ~23,000 | ~12,000 (7 focused calls) | **-48%** |
| Match prompt + output tokens | ~52,000 | **0** | **-100%** |
| **Total** | **~75,000** | **~12,000** | **-84%** |

The new architecture costs **84% less in API tokens** because the entire matching step is eliminated from LLM calls.

### Latency (per 25-assembly project)

| Step | Current | New (sequential) | New (with parallelism) |
|------|---------|-----------------|----------------------|
| Extract | ~45s | ~40s (7 flash calls) | ~18s (1.4, 1.5, 1.6 in parallel) |
| Match | ~30s | **~8ms** (pure code) | ~8ms |
| Finalize | ~5s | ~5s | ~5s |
| **Total** | **~80s** | **~45s** | **~23s** |

Matching is now sub-10ms instead of 30+ seconds. Even with sequential extraction, total pipeline time is cut roughly in half. With parallelism in extraction, it is ~70% faster.

### Accuracy improvement

| Failure mode | Current | New |
|-------------|---------|-----|
| Matching wrong DB code | Common (LLM guesses) | Near-eliminated (exact scoring) |
| Tracks missing (wrong gauge or missing entirely) | Occasional | Eliminated (deterministic auto-add rule) |
| Screws missing | Occasional | Eliminated (auto-add rule) |
| Sealant type wrong | Occasional | Eliminated (fire_rating if/else) |
| Labor missing | Common | Eliminated (height-based lookup) |
| New assembly type fails | Possible (LLM may not recognise ID) | Impossible (code is ID-agnostic) |
| Category confusion in extraction | Moderate | Reduced (focused prompts) |
| Hallucinated materials | Occasional | Reduced (smaller output scope per call) |
| **Estimated overall accuracy** | **~60–70%** | **~90–95%** |

---

## 16. Implementation Order

Work in phases so the legacy pipeline remains fully operational until the new one is validated.

### Phase 1 — Infrastructure (no behavior change, ~2 days)

1. `src/constants/extractionCategories.ts` — all category constants and mappings
2. `src/lib/utils/buildMaterialDbIndex.ts` — index builder (can be unit tested immediately)
3. `src/lib/matching/confidenceUtils.ts` — score thresholds
4. Add 7 extraction prompt keys to `src/constants/aiPrompts.ts`
5. Add `subStepLabel`, `subStepIndex`, `subStepTotal` to `PipelineContext` (additive, no breaking change)

### Phase 2 — Scoring Engine (code only, no routing changes, ~3 days)

6. Write all category scorer functions (`scoreGwb`, `scoreFraming`, `scoreInsulation`, etc.)
7. Write `CATEGORY_SCORERS` registry
8. Write `autoAddEngine.ts`
9. Write `laborEngine.ts`
10. Write `matchOrchestrator.ts`
11. **Unit test every scorer** against known good examples from existing pipeline output

Scoring engine is fully testable in isolation before any route changes.

### Phase 3 — Chunked Extraction (behind feature flag, ~2 days)

12. `extractAssemblySkeleton.ts` service
13. `extractCategoryChunk.ts` service
14. `mergeExtractionChunks.ts` merge function
15. Update `POST /api/extract` to support `?mode=chunked` alongside `?mode=legacy`
16. Write and seed all 7 extraction prompt `.txt` files and `ai_prompts` DB rows
17. Test on 3–5 known PDFs; compare skeleton recall and category completeness

### Phase 4 — Code Match Routing (behind feature flag, ~1 day)

18. Update `POST /api/match` to call `matchOrchestrator()` when `?mode=chunked`
19. Verify `MaterialCosting[]` output shape matches current output exactly (diff test)
20. Run end-to-end: chunked extract → code match → finalize (Strategy 1) on 3+ projects

### Phase 5 — Confidence UI (frontend, ~1 day)

21. Update `ImportFilesModal.tsx` to display sub-step label and per-step progress bar
22. Add confidence badge to matched material rows in the assembly detail view
23. Ensure `review_notes` populated by low-confidence matches appears in UI

### Phase 6 — Promote to Default (~0.5 day)

24. Switch default `mode` from `legacy` to `chunked` in both extract and match routes
25. Keep `?mode=legacy` as a named fallback — never remove, needed for debugging
26. Archive `prompt/matchMaterials.txt` → `prompt/archive/`
27. Add `@deprecated` JSDoc to `src/services/openrouter/matchMaterials.ts`

### Phase 7 — Tuning (ongoing)

- Monitor `review_notes` frequency per category — high rates indicate a scorer needs calibration
- Tune scorer thresholds by category (the threshold constants live in `confidenceUtils.ts` — no LLM involved)
- Tune extraction prompts via `ai_prompts` table (no deploy needed)
- Add new auto-add rules to `autoAddEngine.ts` as new material types are added to the DB

---

## Appendix A — Summary of LLM Calls in New Architecture

```
Total LLM calls per pipeline run: 7

1.0  Flash — Extract assembly skeleton (IDs, types, ratings)
1.1  Flash — Extract: gypsum_board + gypsum_sheathing
1.2  Flash — Extract: steel_framing
1.3  Flash — Extract: insulation
1.4  Flash — Extract: vapor_barriers + sealants
1.5  Flash — Extract: plywood + blocking_and_bracing
1.6  Flash — Extract: steel_deck + trim_and_accessories

All 7 calls read the PDF. No call writes to the DB or calls another service.
After call 1.6 completes, zero LLM calls occur for the remainder of the pipeline.
```

## Appendix B — What The LLM Is Never Asked to Do

```
✗ Match material properties to database codes       → Code scoring engine
✗ Select the correct gauge for a given height       → Code rule (getDefaultGauge)
✗ Add tracks after studs are selected              → Code auto-add rule
✗ Add screws based on GWB layers                   → Code auto-add rule
✗ Choose firestop vs acoustical sealant            → Code rule (fire_rating check)
✗ Select labor code by height category             → Code labor engine
✗ Compute quantities (SF, EA, LF)                  → Code (formula_qty from DB)
✗ Apply waste factors                              → Code (getWasteFactor from constants)
✗ Aggregate takeoff rows                           → Code (already in mergeTakeoff)
✗ Segment labor by height (< 12ft, 12–24ft, > 24ft) → Code (already implemented)
```

## Appendix C — Current Pipeline vs New Pipeline

```
CURRENT:
  Extract:  1 Pro call   → 10 categories × all assemblies → ~23,000 tokens
  Match:    N÷15 calls  → full 800-row DB × 15 assemblies → ~52,000 tokens
  Total:    ~75,000 tokens, ~80s latency, ~60–70% accuracy

NEW:
  Extract:  7 Flash calls → 1-2 categories per call, focused prompt → ~12,000 tokens
  Match:    0 LLM calls  → pure TypeScript scoring → ~8ms, 0 tokens
  Total:    ~12,000 tokens, ~23s latency (with parallelism), ~90–95% accuracy
```
