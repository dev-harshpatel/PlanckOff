# Pipeline Rules — AI Pipeline, Progress Tracking, Prompts

Consult this file for: any work touching `ImportFilesModal`, `/api/extract`, `/api/match`, `/api/finalize`, `/api/parse-takeoff`, `PipelineContext`, pipeline service files in `src/services/`, or `pipeline_runs` table.

---

## 0. The Single Flow Rule

> **There is exactly ONE pipeline flow: sequential 3-step (extract → match → finalize). The unified `/api/process-pipeline` route is deprecated and must not be called from the UI.**

If you see a code path that leads to `/api/process-pipeline`, flag it and redirect to the sequential flow.

---

## 1. Pipeline Steps — Canonical Order

```
Step 0 (pre-flight): Parse Excel takeoff → POST /api/parse-takeoff → saves takeoff_outputs
Step 1 (extract):    PDF → POST /api/extract → saves assembly_extractions
Step 2 (match):      POST /api/match → saves material_matches
Step 3 (finalize):   POST /api/finalize → saves final_outputs
```

Each step is independent and idempotent — re-running a step produces the same result for the same inputs (prompt + data). This is the contract that enables retry.

---

## 2. Pipeline Run Tracking — Always Use `runId`

Every pipeline run is tracked in the `pipeline_runs` table. Every step call must include a `runId`.

```ts
// Starting a new run:
const run = await createPipelineRun(projectId, user.id);
// run.id is the runId

// Step 1 — extract:
await fetch('/api/extract', {
  body: JSON.stringify({ projectId, runId: run.id, pdfBase64 }),
});

// Step 2 — match (using same runId):
await fetch('/api/match', {
  body: JSON.stringify({ projectId, runId: run.id, extractionId }),
});

// Retrying a failed step — provide existing runId + the last successful step's output:
await fetch('/api/match', {
  body: JSON.stringify({ projectId, runId: existingRunId, extractionId }),
});
```

**Rules:**
- Never start a pipeline step without a `runId` — the API routes must reject requests without it (400).
- The `runId` is stored in `PipelineContext` while the modal is open.
- After pipeline completes (or fails), the final state is persisted in `pipeline_runs` — the UI reads progress from there.

---

## 3. Prompts — Always from the Database

> **AI prompts are NEVER hardcoded strings in source files. They always come from the `ai_prompts` table via `getResolvedAIPrompt(key)`.**

```ts
// CORRECT
import { getResolvedAIPrompt } from '@/lib/db/aiPrompts';
import { AI_PROMPT_KEYS } from '@/constants/aiPrompts';

const prompt = await getResolvedAIPrompt(AI_PROMPT_KEYS.PDF_EXTRACTION);

// WRONG — hardcoded string constant in service file
const EXTRACT_PROMPT = `You are an expert...`;
```

**`AI_PROMPT_KEYS` constant** lives in `src/constants/aiPrompts.ts`:
```ts
export const AI_PROMPT_KEYS = {
  PDF_EXTRACTION: 'pdf_extraction',
  MATERIAL_MATCH: 'material_match',
  FINALIZE_AI: 'finalize_ai',
} as const;
```

**Rules:**
- If `getResolvedAIPrompt` returns null (key not found), throw immediately — do not fall back to a hardcoded string.
- Only Administrators can edit prompts via the Dashboard UI.
- Version history of prompts is tracked in `ai_prompts.version` — never overwrite the DB value from code.

---

## 4. Assembly Mapping — Server Side Only

> **`mapFinalOutputToWallAssemblies()` and `mapJsonToWallAssemblies()` run on the server inside `/api/assembly-data`, never in the browser.**

```ts
// src/app/api/assembly-data/route.ts — CORRECT
import { mapFinalOutputToWallAssemblies } from '@/lib/utils/assemblyJsonMapper';

const wallAssemblies = mapFinalOutputToWallAssemblies(finalOutput.data, takeoff.data);
return success({ assemblies: wallAssemblies, materialCosting: costing });

// src/app/(protected)/project/page.tsx — WRONG
const mapped = mapFinalOutputToWallAssemblies(rawData, takeoff); // ← delete this
```

The client receives `WallAssembly[]` — it never transforms raw DB rows.

---

## 5. `PipelineContext` — Progress State Shape

```ts
// src/context/PipelineContext.tsx — target shape

type PipelineStatus = 'idle' | 'running' | 'complete' | 'failed';

interface PipelineContextValue {
  isOpen: boolean;
  projectId: string | null;
  runId: string | null;
  step: 0 | 1 | 2 | 3;        // 0=none, 1=extract, 2=match, 3=finalize
  status: PipelineStatus;
  error: string | null;
  openImport: (projectId: string) => void;
  closeImport: () => void;
  setProgress: (runId: string, step: number, status: PipelineStatus, error?: string) => void;
  onComplete: React.MutableRefObject<(() => void) | null>;
}
```

`ImportFilesModal` calls `setProgress` at each step transition. The modal UI renders a step indicator based on `step` and `status`.

---

## 6. Service Layer Rules

Each pipeline service function (`extractAssembliesFromPDF`, `matchMaterialsToDatabase`, `mergeTakeoffWithMaterialMatch`) must:

1. Accept only typed inputs — never `any`
2. Return `{ data: T; error: string | null }` — never throw
3. Log errors with `console.error` — never `console.log`
4. Not call another service function — services are flat, not chained (the API route chains them)

```ts
// CORRECT service signature
export async function extractAssembliesFromPDF(
  pdfBase64: string,
  prompt: string,              // prompt already resolved from DB before calling here
): Promise<{ data: ExtractResult | null; error: string | null }> {
  try {
    // ... call OpenRouter ...
    return { data: result, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    console.error('[extractAssembliesFromPDF]', message);
    return { data: null, error: message };
  }
}
```

---

## 7. Material Database — Single Source

The pipeline always reads materials from Supabase `spec_database` via `getMaterialDatabase()` (cached in Redis). It never reads from `data/material-database.json`.

```ts
// CORRECT
import { getMaterialDatabase } from '@/lib/cache/materialDbCache';
const materials = await getMaterialDatabase(); // Supabase + Redis cache

// WRONG
import { readFile } from 'fs/promises';
const raw = await readFile('data/material-database.json', 'utf-8'); // ← forbidden
```

**Rules:**
- If `getMaterialDatabase()` fails, return a pipeline error — do not fall back to the local file.
- Cache TTL is managed by `materialDbCache.ts` — do not set a custom TTL in the route.

---

## 8. Error Handling in Pipeline Routes

```ts
// src/app/api/extract/route.ts — error pattern

export const POST = withAuth(async (request) => {
  const { projectId, runId, pdfBase64 } = await request.json().catch(() => null) ?? {};

  if (!projectId || !runId || !pdfBase64) {
    return failure('projectId, runId, and pdfBase64 are required', 400);
  }

  await updatePipelineRunStep(runId, 1, 'extracting');

  const { data, error } = await extractAssembliesFromPDF(pdfBase64, prompt);

  if (error) {
    await failPipelineRun(runId, 1, error);
    return failure(error, 502);
  }

  const { data: saved, error: saveErr } = await saveAssemblyExtraction(projectId, data);
  if (saveErr) {
    await failPipelineRun(runId, 1, saveErr.message);
    return failure(saveErr.message, 500);
  }

  await updatePipelineRunStep(runId, 1, 'complete', { extractionId: saved.id });
  return success({ runId, extractionId: saved.id });
});
```

Every route must:
- Update `pipeline_runs` status before returning
- Never swallow errors silently
- Always return `runId` so the client can track the run

---

## 9. Do Not Do

- Do NOT call `/api/process-pipeline` from the UI — it is deprecated.
- Do NOT embed prompt text in service files — prompts come from `ai_prompts` table.
- Do NOT read `data/material-database.json` — use `getMaterialDatabase()`.
- Do NOT run assembly mapping (`mapFinalOutputToWallAssemblies`) in the browser.
- Do NOT call a pipeline step without a `runId` — steps without runId cannot be tracked or retried.
- Do NOT chain service calls inside another service — chain them in the API route only.
- Do NOT add streaming to pipeline routes without updating `PipelineContext` to handle stream events.
