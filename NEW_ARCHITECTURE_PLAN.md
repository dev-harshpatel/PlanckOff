# NEW_ARCHITECTURE_PLAN.md — PlanckOff / Drywall Spec Estimator

**Canonical location:** project root (`NEW_ARCHITECTURE_PLAN.md`).  
**Repository snapshot:** analyzed **2026-04-08**. File paths, exports, and behaviors refer to this workspace unless noted.

---

## Gaps Found (read before implementation)

| Gap | Detail |
|-----|--------|
| **Prompt files vs runtime** | `prompt/extractAssemblies.txt` and `prompt/matchMaterials.txt` exist on disk, but **`src/services/openrouter/extractAssemblies.ts`** and **`src/services/openrouter/matchMaterials.ts`** embed **`EXTRACT_PROMPT`** and **`MATCH_PROMPT`** as string constants. The `.txt` files are **not** `readFile`’d at runtime — only referenced in **`src/services/pipeline/README.md`**. Edits to `.txt` alone do not change behavior until code imports or syncs them. |
| **`.env.example` vs pipeline** | **`.env.example`** lists `GEMINI_API_KEY` and Supabase vars but **does not list `OPENROUTER_API_KEY`**, which is **required** by `/api/extract`, `/api/match`, `/api/finalize` (AI path), and `/api/process-pipeline` (`process.env.OPENROUTER_API_KEY`). |
| **Missing documentation files (requested but absent)** | The following paths from the original research checklist are **not present** in this repo: `PROJECT_LOOKOUT.md`, `docs/AI_PIPELINE_DOCUMENTATION.md`, `docs/CLIENT_EXPLANATION.md`. Use **`docs/APPLICATION_OVERVIEW.md`**, **`docs/PIPELINE_ARCHITECTURE.md`**, **`docs/DATA_SOURCES.md`**, **`docs/RBAC_ARCHITECTURE.md`**, **`src/services/pipeline/README.md`**, and **`CLAUDE.md`** as the authoritative written sources instead. |
| **Match step `temperature`** | **`matchMaterialsToDatabase`** does **not** set `temperature` on the OpenRouter request body (see **`src/services/openrouter/matchMaterials.ts`** ~176–183). Behavior relies on API defaults unless OpenRouter injects a model default. |
| **Finalize output scope** | **`mergeTakeoffWithMaterialMatch`** emits **one assembly per takeoff aggregate group** only; assemblies present in **`material_matches`** but **absent from takeoff** do not appear in **`final_outputs`** (no “orphan extraction” pass). |
| **`IHMF` in prompts vs code** | The string **`IHMF`** does not appear in application source (only in this plan). Ceiling vs wall routing is **`isCeilingRow`** in **`mergeTakeoffWithMaterialMatch.ts`** (substring `"ceiling"` in **`assembly_type`**). |

**Pre-flight checklist (from prompt):**

- [x] Current extract prompt — **full text** in **`src/services/openrouter/extractAssemblies.ts`** (`EXTRACT_PROMPT`, lines 4–20).
- [x] Current match prompt — **full text** in **`src/services/openrouter/matchMaterials.ts`** (`MATCH_PROMPT`, lines 8–25); extended copy also in **`prompt/matchMaterials.txt`** (not loaded by code).
- [x] Finalize merge — **`mergeTakeoffWithMaterialMatch`** in **`src/services/finalize/mergeTakeoffWithMaterialMatch.ts`** (full function exported at line 465).
- [x] DB schema — **`assembly_extractions`**, **`material_matches`** (`supabase/migrations/011_create_assembly_data_tables.sql`); **`takeoff_outputs`**, **`final_outputs`** (`supabase/migrations/012_create_pipeline_output_tables.sql`); materials: **`spec_database`** (`supabase/migrations/010_create_spec_database_table.sql` et seq.).
- [x] **`ImportFilesModal`** — **`src/components/features/project/ImportFilesModal.tsx`** (`runFullPipeline`, ~207–337).
- [x] Pipeline trace — Excel → **`POST /api/parse-takeoff`** → `takeoffOutputIdRef` → PDF → **`POST /api/extract`** → **`POST /api/match`** → **`POST /api/finalize`** with `takeoffOutputId` + `materialMatch`.
- [x] **`material-database.json`** — **461** top-level array entries; file on disk **~335 KB** (see Appendix B). Fields include **`code`**, **`section`**, **`matCost`**, **`per`**, **`category`**, **`description`**, etc.

---

## Section 1: Executive Summary

**Current state:** The app runs a **sequential 3-step pipeline** from **`ImportFilesModal`**: **`POST /api/extract`** sends the **entire PDF as base64** via OpenRouter multimodal (`image_url` with `data:application/pdf;base64,...`) using **`google/gemini-2.5-pro`** and **`temperature: 0.1`** (`src/services/openrouter/extractAssemblies.ts`). **`POST /api/match`** loads materials via **`getMaterialDatabase()`** (`src/lib/cache/materialDbCache.ts` → Supabase **`getAllMaterials`**), trims with **`trimMaterialDbForMatching`**, batches assemblies (**`BATCH_SIZE = 15`**), and sends **full trimmed DB JSON + batch assemblies** per request with **`google/gemini-2.5-flash`**; **`temperature` is omitted** on match calls. **`POST /api/finalize`** uses **`mergeTakeoffWithMaterialMatch`** when takeoff rows exist (`src/services/finalize/mergeTakeoffWithMaterialMatch.ts`), then **`enrichFinalOutputWithQuantities`** (`src/lib/utils/enrichFinalOutputWithQuantities.ts`). All three main routes export **`maxDuration = 300`** (`src/app/api/extract/route.ts`, `match/route.ts`, `finalize/route.ts`; `process-pipeline/route.ts` same). **No streaming** responses are implemented for these routes.

**Target state:** Introduce a **four-layer** architecture: (1) **two-pass AI** (reasoning → constrained JSON) for extract/match; (2) **database-driven rules** replacing duplicated prompt rules; (3) **confidence and flags** on every assembly and line; (4) **corrections → rules** feedback. Add **PDF page-image batching**, **`temperature: 0`** and **deterministic seeding** where the provider supports it, **JSON validation + retry**, **assembly reconciliation** (fuzzy IDs + orphan reporting), and **cost sanity checks** tied to existing **`final_outputs.data.assemblies[]`** shapes.

**Accuracy improvement (directional):** Current pipeline depends on single-pass extraction of whole PDFs and single-pass matching with large DB context; target is **higher recall on ceilings/multi-page specs**, **fewer code/section hallucinations** via constrained second pass, and **fewer join failures** via reconciliation — e.g. **baseline “match rate”** (assemblies with `status: "OK"` vs `"REVIEW REQUIRED"`) should move from **qualitative** to **measured** after telemetry; plan for **~20–40% reduction in REVIEW_REQUIRED rows** where root cause is ID mismatch or partial PDF parse, subject to project data.

**Estimated total implementation effort:** **~20–30 engineer-days** for Phases 0–4 (below), plus **5–10 days** for Phase 5 polish — **~5–6 calendar weeks** with one senior full-stack engineer, or **~3 weeks** with two engineers splitting backend vs UI.

---

## Section 2: Current Architecture Map

### 2.1 Relevant files (role)

| File | Role |
|------|------|
| `src/app/api/extract/route.ts` | Auth **`withAuth`**; **`maxDuration = 300`**; calls **`extractAssembliesFromPDF`**; **`saveAssemblyExtraction`** → table **`assembly_extractions`**. |
| `src/app/api/match/route.ts` | **`getMaterialDatabase`**; **`matchMaterialsToDatabase`**; **`saveMaterialMatch`** → **`material_matches`**. |
| `src/app/api/finalize/route.ts` | Resolves takeoff from body / **`getTakeoffOutputById`** / **`getLatestTakeoffOutput`**; loads match from body or **`getLatestMaterialMatch`**; **`mergeTakeoffWithMaterialMatch`** OR **`finalizeAssembliesWithTakeoff`**; **`getAllMaterials`** + **`enrichFinalOutputWithQuantities`**; **`saveFinalOutput`** → **`final_outputs`**. |
| `src/app/api/parse-takeoff/route.ts` | Excel **`parseOSTSheet`** / **`parseRawTakeoffSheetDetailed`**; scoring; optional **`saveTakeoffOutput`** → **`takeoff_outputs`**. |
| `src/app/api/process-pipeline/route.ts` | One-shot: **`extractAssembliesFromPDF`** → **`parseRawTakeoffSheet`** → read **`data/material-database.json`** → **`finalizeWithUnifiedPrompt`** → enrich → **`saveFinalOutput`**. **`maxDuration = 300`**. |
| `src/app/api/assembly-data/route.ts` | Project pipeline artifact reads (not fully expanded here; used by UI + overwrite check). |
| `src/app/api/final-output/[id]/route.ts` | PATCH **`final_outputs`** (unit cost, etc.). |
| `src/services/openrouter/extractAssemblies.ts` | **`EXTRACT_PROMPT`**; OpenRouter **`chat/completions`** with PDF base64 in **`image_url`**; **`repairJSONForAssemblyExtraction`**. |
| `src/services/openrouter/matchMaterials.ts` | **`MATCH_PROMPT`**; batch loop; **`trimMaterialDbForMatching`**; **`repairJSONForMaterialMatch`**. |
| `src/services/openrouter/finalizeAssemblies.ts` | AI finalize fallback; **`temperature: 0.1`**; **`response_format: json_object`**. |
| `src/services/openrouter/processWithUnifiedPrompt.ts` | Unified AI finalize; **`temperature: 0.1`**; batched **`callBatch`**. |
| `src/services/finalize/mergeTakeoffWithMaterialMatch.ts` | **`mergeTakeoffWithMaterialMatch`**, **`aggregateTakeoff`**, **`filterSteelFramingGauges`**, **`getTargetMilForHeight`**, labor height expansion. |
| `src/lib/utils/enrichFinalOutputWithQuantities.ts` | **`computeQuantityFromExtracted`** / formulas → **`quantity`**, **`sec_quantity`**, **`waste_percent`**. |
| `src/lib/utils/jsonRepair.ts` | Malformed JSON repair for extraction/match/unified. |
| `src/lib/utils/materialDbTrim.ts` | **`trimMaterialDbForMatching`**. |
| `src/lib/cache/materialDbCache.ts` | **`getMaterialDatabase`**, Redis + memory cache. |
| `src/lib/db/assemblyData.ts` | **`saveAssemblyExtraction`**, **`saveMaterialMatch`**, latest getters. |
| `src/lib/db/pipelineOutputs.ts` | **`saveTakeoffOutput`**, **`saveFinalOutput`**, getters. |
| `src/lib/db/materials.ts` | **`getAllMaterials`** → **`spec_database`**. |
| `src/components/features/project/ImportFilesModal.tsx` | Sequential pipeline UI; stores **`takeoffOutputId`**, **`extractionId`**, calls finalize with **`materialMatch`**. |
| `vercel.json` | Cron only; **no `maxDuration` override** (relies on route segment config). |
| `prompt/extractAssemblies.txt` | Reference copy (not imported by extract service). |
| `prompt/matchMaterials.txt` | Reference copy (not imported by match service). |
| `prompt/prompt.txt` | Unified flow (`finalizeWithUnifiedPrompt`). |

### 2.2 Data flow (main UI)

```
Excel file → FormData → POST /api/parse-takeoff
  → parseOSTSheet / parseRawTakeoffSheetDetailed
  → optional saveTakeoffOutput → takeoff_outputs
  → client: takeoffOutputIdRef

PDF file → base64 → POST /api/extract
  → extractAssembliesFromPDF (OpenRouter + PDF data URL)
  → saveAssemblyExtraction → assembly_extractions
  → extractionId

POST /api/match
  → getMaterialDatabase() [Supabase + cache]
  → matchMaterialsToDatabase
  → saveMaterialMatch → material_matches

POST /api/finalize
  → load takeoff rows (DB or body)
  → mergeTakeoffWithMaterialMatch (or AI finalize)
  → getAllMaterials + enrichFinalOutputWithQuantities
  → saveFinalOutput → final_outputs
```

---

## Section 3: The New Architecture — Overview

### Layer 1: AI interpretation (two-pass: think → output)

**Replaces:** Single-pass **`EXTRACT_PROMPT`** / **`MATCH_PROMPT`** responses that must be valid JSON immediately.

**New / modified:**

- **New:** `src/services/openrouter/extractPassReasoning.ts`, `extractPassJson.ts` (or single module with two functions).
- **New:** `src/services/openrouter/matchPassReasoning.ts`, `matchPassJson.ts`.
- **Modify:** `src/services/openrouter/extractAssemblies.ts` — orchestrate page batches + merge + dedupe.
- **Modify:** `src/services/openrouter/matchMaterials.ts` — call two-pass per material or per small batch; inject **valid codes list** in pass 2 only.

### Layer 2: Dynamic rule engine (DB-driven)

**Replaces:** Long rule lists inside **`MATCH_PROMPT`** / **`prompt/matchMaterials.txt`** (gauge, sealant, track rules, etc.) and parts of **`mergeTakeoffWithMaterialMatch`** (e.g. steel filtering could remain code with rule hooks).

**New:**

- `src/services/rules/applyDynamicRules.ts` — **`applyDynamicRules`**.
- `src/services/rules/buildRuleContext.ts` — **`buildRuleContext`**.
- `src/lib/db/estimationRules.ts` — Supabase accessors.
- **Modify:** `src/services/finalize/mergeTakeoffWithMaterialMatch.ts` — call rule engine after merge or on matched materials (narrow, documented insertion points).

### Layer 3: Confidence flagging

**Replaces:** Binary **`status: "OK" | "REVIEW REQUIRED"`** only (`mergeTakeoffWithMaterialMatch` lines 503–504, 538).

**New:**

- `src/services/confidence/assignAssemblyStatus.ts`
- **Modify:** `src/types/assembly/index.ts` (extend assembly + costing item types).
- **Modify:** `src/lib/utils/enrichFinalOutputWithQuantities.ts` — attach sanity flags when quantities exceed thresholds.

### Layer 4: Feedback loop

**Replaces:** Ad-hoc PATCH to **`final_outputs`** without structured learning (`PATCH /api/final-output/[id]`).

**New:**

- `src/app/api/corrections/route.ts`, `src/app/api/rules/route.ts`
- `src/lib/db/estimationCorrections.ts`
- **Modify:** `src/components/features/project/AssemblyEditorModal.tsx` or estimate panel — “Save as rule” entry.

---

## Section 4: Infrastructure Fixes (Do First)

### 4.1 Vercel timeout

**Current:** `export const maxDuration = 300` in:

- `src/app/api/extract/route.ts` (lines 6–7)
- `src/app/api/match/route.ts` (lines 7–8)
- `src/app/api/finalize/route.ts` (lines 31–32)
- `src/app/api/process-pipeline/route.ts` (lines 22–23)

**Streaming:** No `ReadableStream` / `StreamingTextResponse` usage in these routes (grep confirms no stream pattern in pipeline routes).

**Recommended changes:**

- Keep **300s** on Hobby-equivalent; for long PDFs upgrade to **Pro + Fluid Compute** and set **800s** where needed (`match` and `extract` first).
- Add **`export const runtime = "nodejs"`** explicitly on routes that use `fs`, `Buffer`, native addons (pdf rendering) — already implicit for `readFile` in finalize.

**UI:** `ImportFilesModal` uses single JSON responses (`fetch().json()`). Streaming would require **NDJSON or SSE** and a client reader loop — new **`usePipelineStream.ts`** hook and progress state; not a one-line change.

### 4.2 Temperature and determinism

**Current (verified):**

| Location | Setting |
|----------|---------|
| `src/services/openrouter/extractAssemblies.ts` | `temperature: 0.1` (line 31) |
| `src/services/openrouter/matchMaterials.ts` | **No `temperature`** in `requestBody` (lines 176–183) |
| `src/services/openrouter/finalizeAssemblies.ts` | `temperature: 0.1` (line 71) |
| `src/services/openrouter/processWithUnifiedPrompt.ts` | `temperature: 0.1` (line 123) |
| `src/services/openrouter/parseWallSpec.ts` | `temperature: 0.1` (lines 82, 159) |

**No `seed`** in any OpenRouter request body in-repo.

**Before (extract — actual):**

```ts
temperature: 0.1,
```

**After (target):**

```ts
temperature: 0,
// seed: 42, // only if OpenRouter + model support; verify per model docs
```

**Match — add explicitly:**

```ts
const requestBody = {
  model: MODEL,
  max_tokens: 32768,
  temperature: 0,
  messages: [
    { role: "system", content: MATCH_PROMPT },
    { role: "user", content: userMessage },
  ],
};
```

Apply the same **`temperature: 0`** pattern to **`finalizeAssemblies.ts`** and **`processWithUnifiedPrompt.ts`**.

### 4.3 PDF → page images

**Current:** `src/services/openrouter/extractAssemblies.ts` lines 37–42 embed the **whole PDF**:

```ts
{
  type: "image_url",
  image_url: {
    url: `data:application/pdf;base64,${pdfBase64}`,
  },
},
```

**Risk:** Large multi-page PDFs inflate **prompt tokens** and **latency**; model may still attend poorly to late pages despite prompt text.

**New packages (suggested):**

- **`pdfjs-dist`** or **`pdf-poppler`** wrapper — pick one that runs on **Vercel Node** (native deps are painful; prefer **`canvas` + `pdfjs`** rasterization, or **`pdftoppm`** if Linux-only — **Windows dev** must match prod).
- **`sharp`** — resize/compress PNG/JPEG before base64.

**Integration:** In **`extractAssembliesFromPDF`**, replace single multimodal PDF with **N user messages** each containing 4–5 **image_url** parts + batch-specific **`EXTRACT_PROMPT`**, then **merge `assemblies[]`** and **dedupe by `assembly_id`**.

**Token/cost:** Images use vision tokens per pixel policy of Gemini; batching reduces **output** size per call but may **increase** total image tokens — tune DPI (e.g. 150–200 DPI) and max dimension via **`sharp`**.

---

## Section 5: New Extract Prompt + Batch Orchestration

### 5.1 `EXTRACT_PROMPT` (improved, batch-oriented)

Use this as **system/user text** for **each batch** (pages X–Y). Designed for **`temperature: 0`**.

```
You are extracting interior drywall / cold-formed steel assembly schedules from construction PDFs.
You will receive IMAGES for PDF pages [START_PAGE] through [END_PAGE] only.

Return ONLY valid JSON. No markdown, no commentary.

SCOPE:
- Extract assemblies whose tags appear on THESE pages OR whose schedule rows continue from a previous page but are completed on these pages.
- Ceiling assemblies often use IDs like C1, C2, C3; wall assemblies like W*, WE*, P*. Include shaft walls, corridor walls, and ceilings.

INCLUDE materials (verbatim raw_text):
- Gypsum board / drywall / Type X / shaft liner
- Steel studs, tracks, furring, deflection/slotted track when shown
- Insulation (each distinct product = separate array entry)
- Plywood/OSB, vapor barrier, sealants per assembly, trim

EXCLUDE (do not list as materials): exterior cladding, roofing, masonry structure, windows/curtain wall-only lines.

LAYER COUNTING:
- If the PDF states "2 LAYERS" of gypsum, emit TWO gypsum_board entries; set "layers" on EACH entry to the TOTAL layer count stated in the PDF (integer). Do not merge layers into one row.

UNITS:
- Preserve metric or imperial as written. The match step converts mm to inches; do not round aggressively here.

CEILINGS:
- If Assembly Type or title indicates CEILING, still use assembly_id from schedule (often C*). Extract joists, hangers, boards, insulation shown for that ceiling ID.

OUTPUT SHAPE:
{"assemblies":[{"assembly_id":"string","fire_rating":null,"stc_rating":null,"materials":{"gypsum_board":[],"gypsum_sheathing":[],"steel_framing":[],"insulation":[],"plywood":[],"blocking_and_bracing":[],"steel_deck":[],"vapor_barriers":[],"sealants":[],"trim_and_accessories":[]}}]}

If no assemblies on these pages: {"assemblies":[]}
```

### 5.2 Batch orchestration (new module outline)

Implement in **`src/services/openrouter/extractAssemblies.ts`** or **`src/services/openrouter/extractBatches.ts`**:

```typescript
import type { ExtractionResult } from "@/types/pipeline";

type PageImage = { pageNumber: number; mimeType: "image/png" | "image/jpeg"; base64: string };

const mergeExtractions = (
  batches: Array<{ assemblies: Array<{ assembly_id?: string }> }>,
): Array<{ assembly_id?: string }> => {
  const byId = new Map<string, { assembly_id?: string }>();
  for (const b of batches) {
    for (const a of b.assemblies ?? []) {
      const id = typeof a.assembly_id === "string" ? a.assembly_id.trim() : "";
      if (!id) continue;
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, a);
        continue;
      }
      // Prefer richer record: higher count of non-empty material arrays
      const score = (x: { materials?: Record<string, unknown[]> }) =>
        Object.values(x.materials ?? {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
      byId.set(id, score(a as { materials?: Record<string, unknown[]> }) > score(existing as { materials?: Record<string, unknown[]> }) ? a : existing);
    }
  }
  return [...byId.values()];
};

export const extractAssembliesFromPdfPages = async (
  pages: PageImage[][],
  apiKey: string,
): Promise<ExtractionResult> => {
  const batchResults: Array<{ assemblies: Array<{ assembly_id?: string }> }> = [];
  for (const batch of pages) {
    const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
      { type: "text", text: `Batch pages: ${batch.map((p) => p.pageNumber).join(", ")}` },
      ...batch.map((p) => ({
        type: "image_url" as const,
        image_url: { url: `data:${p.mimeType};base64,${p.base64}` },
      })),
    ];
    const requestBody = {
      model: "google/gemini-2.5-pro",
      max_tokens: 65536,
      temperature: 0,
      messages: [{ role: "user" as const, content }],
    };
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${err}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.trim();
    const parsed = JSON.parse(cleaned) as { assemblies?: Array<{ assembly_id?: string }> };
    batchResults.push({ assemblies: parsed.assemblies ?? [] });
  }
  const assemblies = mergeExtractions(batchResults);
  return { assemblies, truncated: false, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
};
```

Wire **`pdf → pages`** using the chosen PDF library before calling **`extractAssembliesFromPdfPages`**.

---

## Section 6: Two-Pass Match Architecture

### 6.1 `MATCH_REASONING_PROMPT` (Pass 1 — plain English)

```
You are a senior drywall estimator. For ONE extracted material line you must reason step by step in plain English.

Material DB index (codes only, for orientation): {{CODE_LIST_SUMMARY}}

Extracted material (JSON): {{EXTRACTED_MATERIAL_JSON}}
Assembly context: id={{ASSEMBLY_ID}}, fire_rating={{FIRE_RATING}}, stc_rating={{STC_RATING}}

Cover in order:
1) Unit/thickness interpretation (mm vs inches) and rounding intent.
2) Material category (board, stud, track, insulation, accessory).
3) Primary SKU candidates from the code list (name the codes).
4) Required accessories (track, screws) — only if justified by assembly text AND typical scope.
5) Labor intent (which operations apply) — only using labor codes you already saw in the code list.
6) Conflicts or uncertainty — call them out explicitly.

Do NOT output JSON. Do NOT invent numeric codes not in the code list.
```

### 6.2 `MATCH_OUTPUT_PROMPT` (Pass 2 — strict JSON)

```
You convert estimator reasoning into STRICT JSON only.

Valid codes for this run (ONLY use these): {{VALID_CODES_JSON_ARRAY}}

Reasoning (plain English):
{{REASONING_TEXT}}

Output format:
{"extracted_material": <echo of input shape>,
 "matched_materials": [{"code","section","description","manufacturer","unit","unit_cost"}],
 "matched_labor": [{"code","section","description","unit","unit_cost"}],
 "confidence": "HIGH" | "MEDIUM" | "LOW",
 "flags": [{"code":"string","severity":"INFO"|"WARNING"|"ERROR","message":"string"}],
 "reasoning_summary": "string"}

Rules:
- Every code MUST appear in VALID_CODES_JSON_ARRAY.
- If uncertain, use fewer lines and set confidence LOW with flags explaining why.
- section must match DB for that code.
```

### 6.3 Batch orchestration / rate limits

- **Unit of work:** One **extracted material line** (flatten **`materials`** categories from extraction) → 2 calls (reason + JSON). Grouping by assembly still possible for fewer round-trips at the cost of context size.
- **Rate limits:** Use **`p-limit`** or a small **queue** (concurrency 2–4) with **exponential backoff** on HTTP 429 / 5xx (extend existing retry pattern in **`matchMaterials.ts`** lines 187–234).
- **Token limits:** Pass 2 receives **only valid codes** for matched categories (filter **`trimMaterialDbForMatching`** by category + candidate codes from Pass 1 text parsing).

---

## Section 7: Dynamic Rule Engine

### 7.1 SQL migration

Follow patterns: **`gen_random_uuid()`**, **`TIMESTAMPTZ`**, **`REFERENCES projects(id) ON DELETE CASCADE`**, **`created_by`** → **`admins(id)`** (see **`011_create_assembly_data_tables.sql`**).

```sql
-- estimation_rules: versioned, active flag, JSON trigger/action
CREATE TABLE IF NOT EXISTS estimation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger JSONB NOT NULL,
  action JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_estimation_rules_project_id ON estimation_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_estimation_rules_active ON estimation_rules(is_active);

-- estimation_corrections: human fixes linked to final output
CREATE TABLE IF NOT EXISTS estimation_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  final_output_id UUID REFERENCES final_outputs(id) ON DELETE SET NULL,
  assembly_id TEXT,
  material_code TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_estimation_corrections_project_id ON estimation_corrections(project_id);
CREATE INDEX IF NOT EXISTS idx_estimation_corrections_final_output_id ON estimation_corrections(final_output_id);

ALTER TABLE estimation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_corrections ENABLE ROW LEVEL SECURITY;
```

Add policies mirroring **`takeoff_outputs`** / **`final_outputs`** style in **`012_create_pipeline_output_tables.sql`** (service-role + `created_by`).

### 7.2 `RuleTrigger` / `RuleAction` types

```typescript
export type RuleTrigger =
  | { kind: "assembly_id_equals"; value: string }
  | { kind: "wall_type_equals"; value: string }
  | { kind: "height_ft_between"; min: number; max: number }
  | { kind: "fire_rating_present" }
  | { kind: "stc_rating_present" }
  | { kind: "material_code_in"; codes: string[] }
  | { kind: "raw_text_matches"; pattern: string }
  | { kind: "is_ceiling_row" }
  | { kind: "all" ; triggers: RuleTrigger[] }
  | { kind: "any"; triggers: RuleTrigger[] };

export type RuleAction =
  | { kind: "add_material_code"; code: string }
  | { kind: "remove_material_code"; code: string }
  | { kind: "replace_material_code"; from: string; to: string }
  | { kind: "set_flag"; flag: { code: string; severity: "INFO" | "WARNING" | "ERROR"; message: string } }
  | { kind: "set_assembly_status"; status: string }
  | { kind: "bump_confidence"; delta: number };
```

Map embedded prompt rules from **`MATCH_PROMPT`** / **`prompt/matchMaterials.txt`**: **track+stud pairing**, **screw add-ons**, **sealant fire vs acoustic**, **gauge defaults**, **insulation R-value depth**, **skip null raw_text**, **section required**.

### 7.3 `applyDynamicRules()` (full)

```typescript
import type { RuleAction, RuleTrigger } from "@/types/rules";

export type AssemblyRuleContext = {
  assembly_id: string;
  height_ft: number;
  is_ceiling: boolean;
  fire_rating: string | null;
  stc_rating: string | null;
  materials_costing: Array<{
    extracted_material: { raw_text?: string } | null;
    matched_materials: Array<{ code: string }>;
    matched_labor: Array<{ code: string }>;
  }>;
};

export type RuleRecord = {
  id: string;
  priority: number;
  trigger: RuleTrigger;
  action: RuleAction;
};

const evaluateTrigger = (t: RuleTrigger, ctx: AssemblyRuleContext): boolean => {
  switch (t.kind) {
    case "assembly_id_equals":
      return ctx.assembly_id === t.value;
    case "wall_type_equals":
      return ctx.assembly_id === t.value;
    case "height_ft_between":
      return ctx.height_ft >= t.min && ctx.height_ft <= t.max;
    case "fire_rating_present":
      return ctx.fire_rating != null && ctx.fire_rating !== "" && !/^N\/A$/i.test(ctx.fire_rating);
    case "stc_rating_present":
      return ctx.stc_rating != null && ctx.stc_rating !== "";
    case "is_ceiling_row":
      return ctx.is_ceiling;
    case "material_code_in":
      return ctx.materials_costing.some((row) =>
        row.matched_materials.some((m) => t.codes.includes(m.code)),
      );
    case "raw_text_matches": {
      const re = new RegExp(t.pattern, "i");
      return ctx.materials_costing.some((row) => re.test(row.extracted_material?.raw_text ?? ""));
    }
    case "all":
      return t.triggers.every((x) => evaluateTrigger(x, ctx));
    case "any":
      return t.triggers.some((x) => evaluateTrigger(x, ctx));
    default:
      return false;
  }
};

const applyAction = (
  ctx: AssemblyRuleContext,
  action: RuleAction,
  audit: Array<{ ruleId: string; action: RuleAction }>,
  ruleId: string,
): void => {
  switch (action.kind) {
    case "set_flag":
      audit.push({ ruleId, action });
      return;
    case "add_material_code":
      audit.push({ ruleId, action });
      return;
    case "remove_material_code":
      audit.push({ ruleId, action });
      return;
    case "replace_material_code":
      audit.push({ ruleId, action });
      return;
    case "set_assembly_status":
      audit.push({ ruleId, action });
      return;
    case "bump_confidence":
      audit.push({ ruleId, action });
      return;
    default:
      return;
  }
};

export const applyDynamicRules = (
  ctx: AssemblyRuleContext,
  rules: RuleRecord[],
): { context: AssemblyRuleContext; appliedRules: string[]; audit: Array<{ ruleId: string; action: RuleAction }> } => {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const audit: Array<{ ruleId: string; action: RuleAction }> = [];
  const appliedRules: string[] = [];
  const nextCtx: AssemblyRuleContext = structuredClone(ctx);

  for (const rule of sorted) {
    if (!evaluateTrigger(rule.trigger, nextCtx)) continue;
    applyAction(nextCtx, rule.action, audit, rule.id);
    appliedRules.push(rule.id);
  }

  return { context: nextCtx, appliedRules, audit };
};
```

**Note:** Mutations to **`matched_materials`** should be implemented concretely (clone arrays, push objects shaped like **`MatchedMaterial`**) when integrating — above keeps audit contract explicit.

### 7.4 `buildRuleContext()`

```typescript
import type { RuleRecord } from "./applyDynamicRules";

export const buildRuleContext = (rules: RuleRecord[]): string => {
  if (rules.length === 0) return "";
  const lines = rules
    .filter((r) => r.priority >= 0)
    .sort((a, b) => a.priority - b.priority)
    .map((r) => `- ${r.id}: ${JSON.stringify(r.trigger)} → ${JSON.stringify(r.action)}`);
  return `Estimator business rules (must respect):\n${lines.join("\n")}`;
};
```

Inject result into **Pass 1** reasoning prompt as **`{{RULE_CONTEXT}}`**.

---

## Section 8: Confidence and Flagging

### 8.1 `AssemblyStatus`

```typescript
export type AssemblyStatus =
  | "CONFIRMED"
  | "REVIEW_MINOR"
  | "REVIEW_REQUIRED"
  | "RULE_OVERRIDE"
  | "NO_MATCH"
  | "RECONCILE"
  | "COST_ANOMALY";
```

| Status | When |
|--------|------|
| **CONFIRMED** | Takeoff key matched **`material_matches`**, no flags, cost check OK. |
| **REVIEW_MINOR** | Matched but flags INFO/WARNING only. |
| **REVIEW_REQUIRED** | Same as today: no **`mergeTakeoffWithMaterialMatch`** hit (`mergeTakeoffWithMaterialMatch.ts` 485–505). |
| **RULE_OVERRIDE** | **`applyDynamicRules`** changed materials/status. |
| **NO_MATCH** | Extracted but matcher returned empty codes. |
| **RECONCILE** | Fuzzy suggestion pending (`reconcileAssemblies`). |
| **COST_ANOMALY** | **`runCostSanityCheck`** failed. |

### 8.2 `Flag` type + codes

```typescript
export type FlagSeverity = "INFO" | "WARNING" | "ERROR";

export type EstimationFlag = {
  code: string;
  severity: FlagSeverity;
  message: string;
  ai_reasoning?: string;
  suggested_fix?: string;
};
```

**Suggested codes (from failure modes in code):** `TAKEOFF_MISSING_MATCH`, `MATCH_EMPTY_RAW`, `JSON_REPAIR_USED`, `FINISH_REASON_LENGTH`, `GAUGE_FILTER_APPLIED`, `LABOR_SEGMENT_FALLBACK`, `QUANTITY_FORMULA_CAPPED`, `CEILING_CLASSIFICATION_AMBIGUOUS`, `ORPHAN_EXTRACTION` (extraction without takeoff row).

### 8.3 `reconcileAssemblies()` (full)

```typescript
import type { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";

const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
};

export type ReconciliationReport = {
  matchedKeys: string[];
  missingInExtraction: string[];
  missingInTakeoff: string[];
  fuzzySuggestions: Array<{ takeoffType: string; extractionId: string; distance: number }>;
};

export const reconcileAssemblies = (
  takeoffRows: TakeoffRawRecord[],
  extractionAssemblyIds: string[],
): ReconciliationReport => {
  const takeoffIds = new Set(
    takeoffRows
      .map((r) => (r.wall_type == null ? "" : String(r.wall_type).trim()))
      .filter(Boolean),
  );
  const extractionIds = new Set(extractionAssemblyIds.map((id) => id.trim()).filter(Boolean));

  const matchedKeys: string[] = [];
  for (const id of takeoffIds) {
    if (extractionIds.has(id)) matchedKeys.push(id);
  }

  const missingInExtraction = [...takeoffIds].filter((id) => !extractionIds.has(id));
  const missingInTakeoff = [...extractionIds].filter((id) => !takeoffIds.has(id));

  const fuzzySuggestions: Array<{ takeoffType: string; extractionId: string; distance: number }> = [];
  for (const t of missingInExtraction) {
    let best: { extractionId: string; distance: number } | null = null;
    for (const e of missingInTakeoff) {
      const d = levenshtein(t.toLowerCase(), e.toLowerCase());
      if (!best || d < best.distance) best = { extractionId: e, distance: d };
    }
    if (best && best.distance <= 2) {
      fuzzySuggestions.push({ takeoffType: t, extractionId: best.extractionId, distance: best.distance });
    }
  }

  return { matchedKeys, missingInExtraction, missingInTakeoff, fuzzySuggestions };
};
```

**Integration:** Call after **`matchMaterialsToDatabase`** or at start of **`mergeTakeoffWithMaterialMatch`** — pass report into **`final_outputs.data.reconciliation_report`**.

### 8.4 `runCostSanityCheck()` (full)

Uses fields documented in **`docs/DATA_SOURCES.md`** (`total_length`, `ceiling_area`, **`matched_materials[].unit_cost`**, **`matched_materials[].quantity`**, **`matched_labor[].unit_cost`**, **`matched_labor[].quantity`**).

```typescript
export type CostSanityResult = {
  assembly_id: string;
  ok: boolean;
  total_material_cost: number;
  total_labor_cost: number;
  cost_per_lf_wall?: number;
  cost_per_sf_ceiling?: number;
  notes: string[];
};

const THRESHOLDS = {
  maxCostPerLfWall: 5000,
  maxCostPerSfCeiling: 500,
};

export const runCostSanityCheck = (
  assembly: {
    assembly_id: string;
    assembly_type?: string;
    total_length: number;
    ceiling_area?: number | null;
    materials_costing: Array<{
      matched_materials: Array<{ unit_cost?: number; quantity?: number }>;
      matched_labor: Array<{ unit_cost?: number; quantity?: number }>;
    }>;
  },
): CostSanityResult => {
  const notes: string[] = [];
  let totalMaterial = 0;
  let totalLabor = 0;

  for (const row of assembly.materials_costing) {
    for (const m of row.matched_materials) {
      const uc = m.unit_cost ?? 0;
      const q = m.quantity ?? 0;
      totalMaterial += uc * q;
    }
    for (const l of row.matched_labor) {
      const uc = l.unit_cost ?? 0;
      const q = l.quantity ?? 0;
      totalLabor += uc * q;
    }
  }

  const isCeiling = String(assembly.assembly_type ?? "").toLowerCase().includes("ceiling");
  const lf = assembly.total_length;
  const sf = assembly.ceiling_area ?? 0;

  let ok = true;
  if (!isCeiling && lf > 0) {
    const costPerLf = (totalMaterial + totalLabor) / lf;
    if (costPerLf > THRESHOLDS.maxCostPerLfWall) {
      ok = false;
      notes.push(`cost_per_lf ${costPerLf.toFixed(2)} exceeds threshold`);
    }
    return {
      assembly_id: assembly.assembly_id,
      ok,
      total_material_cost: totalMaterial,
      total_labor_cost: totalLabor,
      cost_per_lf_wall: costPerLf,
      notes,
    };
  }

  if (isCeiling && sf > 0) {
    const costPerSf = (totalMaterial + totalLabor) / sf;
    if (costPerSf > THRESHOLDS.maxCostPerSfCeiling) {
      ok = false;
      notes.push(`cost_per_sf ${costPerSf.toFixed(2)} exceeds threshold`);
    }
    return {
      assembly_id: assembly.assembly_id,
      ok,
      total_material_cost: totalMaterial,
      total_labor_cost: totalLabor,
      cost_per_sf_ceiling: costPerSf,
      notes,
    };
  }

  return {
    assembly_id: assembly.assembly_id,
    ok,
    total_material_cost: totalMaterial,
    total_labor_cost: totalLabor,
    notes,
  };
};
```

**Why $1.5M on one wall type today:** **`computeQuantityFromExtracted`** (`src/lib/utils/quantityFromExtracted.ts`) can produce **very large SF** when **`total_length` × `height_ft` × layers** explodes (wrong **`height_ft`**, **`total_length`**, or **unit** interpreted as SF with huge area). Also **`matCost` vs `productivity`** confusion in **`trimMaterialDbForMatching`** (`materialDbTrim.ts` lines 33–35) can misstate **`unit_cost`** if match step writes wrong field. **`runCostSanityCheck`** surfaces these as **`COST_ANOMALY`**.

---

## Section 9: Feedback Loop and Rule Creation UI

### 9.1 `POST /api/corrections`

- **Handler:** `withAuth` + validate body `{ projectId, finalOutputId?, assemblyId?, materialCode?, payload }`.
- **Service:** insert into **`estimation_corrections`** via new **`src/lib/db/estimationCorrections.ts`**.
- **Links:** **`final_output_id`** → **`final_outputs.id`**; **`project_id`** → **`projects.id`**.

### 9.2 “Save as Rule”

- **Where:** **`AssemblyEditorModal.tsx`** or **`EstimateResult`** save flow — after user edits **`matched_materials`**, offer **“Save correction & create rule”**.
- **Flow:** `POST /api/corrections` → modal for rule name → `POST /api/rules` with **`trigger`** auto-filled from **`assembly_id`** + **`material_code`** + optional **`height_ft`** from **`final_outputs`**.

### 9.3 Admin rules page (Phase 2)

- New route **`src/app/(protected)/admin/estimation-rules/page.tsx`** (behind **`RouteGuard`** `Administrator`).
- Table: rules list, toggle **`is_active`**, delete, link to corrections.

---

## Section 10: Enhanced Final Output Schema (TypeScript)

Backward compatible: keep existing fields from **`FinalOutputAssembly`** (`mergeTakeoffWithMaterialMatch.ts` lines 48–68) and costing items from **`src/types/assembly`**.

```typescript
import type { FinalOutputAssembly } from "@/services/finalize/mergeTakeoffWithMaterialMatch";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type EnhancedFinalOutputAssembly = FinalOutputAssembly & {
  pipeline_status?: AssemblyStatus;
  confidence?: ConfidenceLevel;
  flags?: EstimationFlag[];
  applied_rules?: string[];
  reconciliation_report?: ReconciliationReport;
  cost_sanity?: CostSanityResult;
  materials_costing: Array<
    FinalOutputAssembly["materials_costing"][number] & {
      reasoning_summary?: string;
    }
  >;
};

export type EnhancedFinalOutput = {
  assemblies: EnhancedFinalOutputAssembly[];
};
```

Persist inside **`final_outputs.data`** JSONB (same column today).

---

## Section 11: Implementation Roadmap

| Phase | Files (new / modify) | Effort | Test |
|-------|----------------------|--------|------|
| **0** | Modify **`extractAssemblies.ts`**, **`matchMaterials.ts`**, **`finalizeAssemblies.ts`**, **`processWithUnifiedPrompt.ts`** — `temperature: 0`; add **`OPENROUTER_API_KEY`** to **`.env.example`**. | 0.5 d | Regression extract/match on sample PDF. |
| **1** | New PDF page render module; modify **`extract/route.ts`**; optional streaming client. Add **zod** JSON validation if approved dep. | 5–7 d | Multi-page PDF; measure tokens; no 504. |
| **2** | Two-pass match modules; **`reconcileAssemblies`** wired to finalize response. | 5–7 d | Known mismatch IDs get suggestions. |
| **3** | Migration **`estimation_rules` / `estimation_corrections`**; **`applyDynamicRules`**; **`buildRuleContext`**; cost sanity. | 5–7 d | Rule toggles change output deterministically. |
| **4** | **`POST /api/corrections`**, **`POST /api/rules`**; UI button. | 4–6 d | Correction creates rule; next run applies. |
| **5** | Admin UI; analytics. | 5–10 d | Dashboards optional. |

---

## Section 12: Files to Create (Complete List)

| Path | Purpose | Key exports |
|------|---------|-------------|
| `src/services/openrouter/extractPdfToPageImages.ts` | PDF → page images | `pdfToPageImages` |
| `src/services/rules/applyDynamicRules.ts` | Rule engine | `applyDynamicRules` |
| `src/services/rules/buildRuleContext.ts` | Prompt injection | `buildRuleContext` |
| `src/services/reconcile/reconcileAssemblies.ts` | Takeoff vs extraction | `reconcileAssemblies` |
| `src/services/cost/runCostSanityCheck.ts` | Cost thresholds | `runCostSanityCheck` |
| `src/lib/db/estimationRules.ts` | DB CRUD | `getActiveRulesForProject` |
| `src/lib/db/estimationCorrections.ts` | DB CRUD | `saveCorrection` |
| `src/app/api/corrections/route.ts` | Corrections API | `POST` |
| `src/app/api/rules/route.ts` | Rules API | `POST`, `GET` |
| `src/types/rules.ts` | Rule types | `RuleTrigger`, `RuleAction` |
| `supabase/migrations/019_estimation_rules.sql` | Schema | tables + indexes + RLS |

---

## Section 13: Files to Modify (Complete List)

| File | Change | Problem |
|------|--------|---------|
| `src/services/openrouter/extractAssemblies.ts` | Page batches; `temperature: 0`; optional seed | Timeout/token risk |
| `src/services/openrouter/matchMaterials.ts` | Two-pass; `temperature: 0`; per-line valid codes | Hallucinated codes; variability |
| `src/app/api/extract/route.ts` | Adjust `maxDuration` if plan upgrades | Vercel 504 |
| `src/app/api/match/route.ts` | Same | Same |
| `src/services/finalize/mergeTakeoffWithMaterialMatch.ts` | Call **`reconcileAssemblies`**; emit enhanced status | ID mismatch; orphans |
| `src/app/api/finalize/route.ts` | Attach reconciliation + sanity to saved JSON | Missing structured review |
| `src/lib/utils/enrichFinalOutputWithQuantities.ts` | Optional flags on formula cap | Cost anomalies |
| `.env.example` | Document `OPENROUTER_API_KEY` | Onboarding gap |
| `prompt/*.txt` | Sync or import from code | Drift |

---

## Section 14: New Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | Already required at runtime; **add to `.env.example`**. |
| `PDF_RENDER_DPI` | e.g. `150` — control image size for extract. |
| `RULE_ENGINE_ENABLED` | `true`/`false` feature flag. |

---

## Section 15: Database Migrations (Order)

1. **`019_estimation_rules.sql`** — `estimation_rules`, `estimation_corrections`, indexes, RLS policies.
2. Optional **`020_final_outputs_version.sql`** — if versioning **`final_outputs`** rows for audit.

---

## Appendix: Problem Diagnosis (Step 2) — Code References

### Problem 1: Vercel timeout

- **`maxDuration`:** **300** on **`extract`**, **`match`**, **`finalize`**, **`process-pipeline`** (see Section 4.1).
- **Streaming:** **None** on these routes.
- **Duration:** Code logs phase times in **`extract/route.ts`**, **`match/route.ts`**; match batches scale with assembly count (**`BATCH_SIZE = 15`** in **`matchMaterials.ts`** line 85).
- **Retries:** Match batch loop retries up to **`MAX_BATCH_RETRIES = 2`** (lines 84, 187–234); **5xx** only for continue condition.

### Problem 2: PDF extraction

- **Method:** **`data:application/pdf;base64,...`** as **`image_url`** (`extractAssemblies.ts` lines 37–42).
- **Token risk:** Whole-document multimodal input; large PDFs increase latency/timeouts.

### Problem 3: Temperature

- **Extract:** `0.1` (`extractAssemblies.ts` line 31).
- **Match:** **Omitted** → API default (**`matchMaterials.ts`** request body lines 176–183).
- **Seed:** **None** in codebase.

### Problem 4: Prompt quality

- **Full `EXTRACT_PROMPT`:** **`src/services/openrouter/extractAssemblies.ts`** lines 4–20.
- **Full `MATCH_PROMPT`:** **`src/services/openrouter/matchMaterials.ts`** lines 8–25.
- **Multi-page:** Prompt text explicitly requires all pages (line 6).
- **Match DB:** **Full `trimMaterialDbForMatching` output** embedded in user message when **`USE_PER_BATCH_DB_FILTER`** is false (line 88) — **large** string (`userMessage.length` logged line 174).
- **Chain-of-thought:** **Not** requested; output must be JSON only.
- **Validation:** **JSON.parse** + **`repairJSONForMaterialMatch`** / **`repairJSONForAssemblyExtraction`** — **not** schema validation.

### Problem 5: Assembly reconciliation

- **Join:** **`takeoff.wall_type`** trimmed vs **`assembly_id`** map (`mergeTakeoffWithMaterialMatch.ts` lines 473–476, 481–482).
- **Missing in match:** **`status: "REVIEW REQUIRED"`**, empty **`materials_costing`** (485–505).
- **Fuzzy:** **None** today.
- **Ceilings / “IHMF”:** Ceiling detection **`isCeilingRow`** — substring **`"ceiling"`** in **`assembly_type`** (`mergeTakeoffWithMaterialMatch.ts` lines 317–322). If Excel uses labels without “ceiling”, rows classify as **walls** (`wall_length` path).

### Problem 6: Business logic in prompts

From **`MATCH_PROMPT`** / **`prompt/matchMaterials.txt`**: stud→track+deflection rules, screw rules, sealant fire vs STC, labor mapping keywords, **“Do NOT invent codes”**, **section required**, skip empty **`raw_text`**, gauge defaults (extended in **`.txt`**).

### Problem 7: Cost calculation

- **Where:** **`mergeTakeoffWithMaterialMatch`** does not multiply $; **`enrichFinalOutputWithQuantities`** sets **`quantity`**; UI / reports compute **unit_cost × quantity**.
- **Sanity:** Partial cap in **`computeQuantityFromExtracted`** (formula vs fallback, lines 65–68) — **not** global assembly $ cap.

### Problem 8: Feedback / rules

- **Estimator corrections:** **`PATCH /api/final-output/[id]`** updates JSON; no **`estimation_corrections`** table today.
- **Rules table:** **None** in migrations.
- **Future runs:** Overrides in **`project_material_overrides`** / **`spec_database`** only — **no** learning loop.

---

## Appendix B: Verbatim runtime prompts (sequential pipeline)

These are the **actual** strings used at runtime (not the longer reference copies under `prompt/*.txt`).

### `EXTRACT_PROMPT` — `src/services/openrouter/extractAssemblies.ts` (lines 4–20)

```
Extract wall, roof, floor, and CEILING assembly data from ALL pages of the document. Return ONLY valid JSON. No commentary, no markdown.

MULTI-PAGE PDFs (critical): Process EVERY page. Ceiling assemblies (C1, C2, C3, C4, C5, etc.) are often on later pages — do not skip them. Extract assemblies from page 1, page 2, and all subsequent pages. Combine all assemblies into one output.

ASSEMBLY ID: Short alphanumeric tag from page (e.g. W14, WE3, P1, C1, C2, C3, RF2B, WT1a). Ceiling assemblies often use C-prefix (C1, C2, C3, C4, C5). No long names. Untagged: UN-TAGGED-WALL-1, UN-TAGGED-ROOF-1, UN-TAGGED-FLOOR-1, UN-TAGGED-CEILING-1. Never null.

EXTRACT: Gypsum board (each layer separate), gypsum sheathing, steel framing (studs/tracks/metal/steel joists/steel angle/wire ties), batt/mineral wool insulation, plywood/OSB, blocking/bracing, steel deck, vapor barriers, sealants, trim/accessories. For ceiling assemblies: gypsum wallboard, shaft liner, steel joists, steel studs, steel angle, wire ties, mineral fibre insulation — extract all as applicable.

EXCLUDE: Air barriers, cladding (brick/stone/metal/EIFS/siding/fibre cement), roofing membranes, rigid insulation, concrete/CMU/masonry, paint, window/curtain wall, aluminum panels/mullions, back pans, vertical support systems. Include sound batts; exclude acoustic caulk.

SCOPE (critical): Materials must come ONLY from the content tied to THAT assembly (same row/section/block as its tag). Never copy materials from another assembly. If an assembly's content has no in-scope materials (e.g. only cladding/window/concrete), output it with ALL material arrays empty. One assembly's content = isolated; do not bleed across.

Each material: "raw_text" = exact verbatim from PDF. Unstated properties = null.

LAYERS (critical): Multiple gypsum layers = separate entries (never merge). If PDF says "2 LAYERS 16 mm GYPSUM WALLBOARD TYPE X", output TWO separate entries — each with layers=2 (the total layer count from the PDF as an integer). The "layers" field must always reflect the layer count stated in the PDF (1, 2, 3, etc.). If the PDF does not mention a layer count, set layers=1. Never set layers=null for gypsum board or gypsum sheathing.

OUTPUT: JSON only. Structure: assemblies[].assembly_id, fire_rating, stc_rating, materials.{ gypsum_board[], gypsum_sheathing[], steel_framing[], insulation[], plywood[], blocking_and_bracing[], steel_deck[], vapor_barriers[], sealants[], trim_and_accessories[] }. Each item: raw_text, thickness/size/gauge/spacing/type/layers/description/r_value/depth as applicable or null. No assemblies on page → {"assemblies":[]}. Include every visible assembly from ALL pages; empty materials = empty arrays.
```

### `MATCH_PROMPT` — `src/services/openrouter/matchMaterials.ts` (lines 8–25)

```
You are a construction cost estimator. Match each extracted assembly material to database entries. Output ONLY valid JSON.

INPUTS: (1) Extracted assemblies (assemblies, materials, raw_text, thickness_mm, layers, fire_rating). (2) Material & labor DB (code, section, type, description, category, matCost, per, manufacturer).

RULES:
1) Material match: Use category, thickness (mm→inch OK), keywords (Type X, Regular, Shaftliner, Furring, CH Stud). No match → null.
2) Metal stud: Also attach matching TRACK and Deflection/Slotted track from DB (same width).
3) Screws: Add from DB — drywall screws for gypsum, fire-rated for Type X, framing/tek for metal studs & furring. No labor unless in DB.
4) Fire rating non-null: Attach fire sealant/caulking material + fire-stop labor from DB. STC/sound: acoustic sealant + labor if in DB.
5) Labor: Gypsum→Hang Drywall + Type X premium if Type X; Sheathing/Shaftliner→Shaftliner install; Metal studs→Install Metal Studs; CH→Shaftwall Framing; Furring→Furring Channel; Batt→Install Batt; Sealants→Fire-Stop/Caulking. Labor additive.
6) Do NOT invent codes, SKUs, or sealants. Only use DB entries.
7) SKIP null/empty materials: If an extracted material has null or empty raw_text, OMIT it entirely from the output. Do not match, do not guess, do not assign any materials or labor to it. Only process materials that have a real, non-null raw_text value.
8) REQUIRED — section: Each matched_materials and matched_labor entry MUST include the "section" field. Copy the exact "section" value (e.g. "09 22 16", "09 29 00", "01 00 00") from the DB entry you matched. Never omit section.

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","materials_costing":[{"extracted_material":{...},"matched_materials":[{"code","section","description","manufacturer","unit","unit_cost"}],"matched_labor":[{"code","section","description","unit","unit_cost"}]}]}]}
Required fields: "unit" = per from DB, "unit_cost" = number from matCost (this is the production rate per unit for materials, or cost per labor unit for labor), "section" = exact section code from DB (REQUIRED for every matched_materials and matched_labor entry). Process all assemblies but only materials with non-null raw_text. Preserve extracted raw_text.
```

### Material database size (verified)

- **`data/material-database.json`**: **461** top-level rows (array length); file size on disk **~335 KB** (bytes vary by line endings).

---

*End of plan.*
