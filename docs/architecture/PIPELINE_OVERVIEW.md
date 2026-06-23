# Pipeline Overview

> This file summarises the end-to-end pipeline.
> Detailed rules for each layer are in `.claude/rules/pipeline.md`.

---

## Step Summary

| Step | Route | Input | Output | DB Table |
|------|-------|-------|--------|----------|
| 0 — Parse takeoff | `POST /api/parse-takeoff` | Excel (.xlsx) | Row list | `takeoff_outputs` |
| 1 — Extract | `POST /api/extract` | PDF (base64) | Assembly list | `assembly_extractions` |
| 2 — Match | `POST /api/match` | Assembly list | BOM + labour | `material_matches` |
| 3 — Finalize | `POST /api/finalize` | Match + takeoff | Final output | `final_outputs` |

## Data Flow

```
PDF  ──────► /api/extract ────────────────────► assembly_extractions
                                                      │
Excel ─────► /api/parse-takeoff ──► takeoff_outputs   │
                                         │            │
                                         └────────────►  /api/match
                                                               │
                                                               ▼
                                                       material_matches
                                                               │
                                                               ▼
                                                        /api/finalize
                                                               │
                                                               ▼
                                                        final_outputs
                                                               │
                                                               ▼
                                                   /api/assembly-data
                                                   (served to Reports)
```

## Key Rules

- Every step is **idempotent** — re-running produces the same result for the same inputs
- Every step requires a `runId` — tracked in `pipeline_runs` table
- Match step is **rule-based** (no AI) — see [MATCHING_ARCHITECTURE.md](MATCHING_ARCHITECTURE.md)
- Finalize step is **deterministic** — formula evaluation + takeoff merge, no AI
- Prompts for the extract step come from `ai_prompts` table, never hardcoded strings

## What Stays the Same After the Matching Rewrite

These are **NOT changed** by the matching architecture update:
- `/api/extract`, `/api/finalize`, `/api/parse-takeoff`, `/api/assembly-data`
- `PipelineContext`, `ImportFilesModal`
- `assembly_extractions`, `material_matches`, `final_outputs`, `takeoff_outputs` table schemas
- `MatchedMaterial`, `MatchedLabor`, `MaterialsCostingItem`, `MaterialCosting` type shapes
- All Reports/Labour/Materials/Markups tabs
