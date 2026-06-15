# Pipeline Services

Assembly extraction, material matching, and finalization for the Drywall Estimator.

## Structure

| Layer | Path | Purpose |
|-------|------|---------|
| Prompts | `prompt/extractAssemblies.txt`, `prompt/matchMaterials.txt`, `prompt/prompt.txt` | AI prompts (externalized) |
| Types | `types/pipeline.ts` | ExtractionResult, MatchResult, AssemblyMeta, UnifiedPromptInput, UnifiedPromptResult |
| Utils | `lib/utils/jsonRepair.ts`, `lib/utils/materialDbTrim.ts` | Shared JSON repair, material DB trim |
| Extract | `openrouter/extractAssemblies.ts` | PDF → assembly JSON |
| Match | `openrouter/matchMaterials.ts` | Assembly + DB → matched JSON |
| Merge (finalize) | `finalize/mergeTakeoffWithMaterialMatch.ts` | Matched + takeoff → final (code) |
| AI finalize fallback | `openrouter/finalizeAssemblies.ts` | When no takeoff |
| Unified flow | `openrouter/processWithUnifiedPrompt.ts` | One-shot flow (future) |

## Flows

### Sequential (Current UI)

Used by `ImportFilesModal` → `/api/extract` → `/api/match` → `/api/finalize`

1. **Extract** — `extractAssembliesFromPDF` — PDF → assembly JSON (AI, prompt: `prompt/extractAssemblies.txt`)
2. **Match** — `matchMaterialsToDatabase` — assemblies + material DB → matched JSON (AI, prompt: `prompt/matchMaterials.txt`)
3. **Finalize** — `mergeTakeoffWithMaterialMatch` — matched + takeoff → final JSON (code)

When takeoff is missing, finalize uses `finalizeAssembliesWithTakeoff` (AI fallback).

### Unified (Future)

Single API: `/api/process-pipeline` — PDF + Excel → final JSON in one request.

Uses `finalizeWithUnifiedPrompt` with `prompt/prompt.txt` for one-shot assembly + takeoff + material matching.

## Imports

```ts
import {
  extractAssembliesFromPDF,
  matchMaterialsToDatabase,
  mergeTakeoffWithMaterialMatch,
  finalizeAssembliesWithTakeoff,
  finalizeWithUnifiedPrompt,
} from "@/services/pipeline";
```
