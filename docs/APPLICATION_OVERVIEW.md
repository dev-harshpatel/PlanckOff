# PlanckOff / Drywall Spec Estimator — Application Overview

**Purpose:** This document is a single-place summary of what the application is, what it takes in, what it produces, and how the main pipeline works. Use it for Q&A, architecture discussion, or AI-assisted suggestions. For deeper detail, see the linked source docs at the end.

---

## 1. What this application is

**PlanckOff** (package name: `drywallspec-estimator`) is a **Next.js** web app for **drywall and interior framing estimation**. It helps estimators turn:

- A **wall/ceiling specification PDF** (assembly schedules, material callouts, ratings), and  
- An **Excel takeoff** (quantities by wall type, height, level),

into a **structured cost estimate**: assemblies with **matched material and labor lines** from a **company material database**, plus **quantities** derived from takeoff dimensions and (where configured) **per-SKU formulas**, wastage, markups, and reporting.

**End users:** Estimators, project managers, or internal staff at a drywall or interior subcontractor. **End goal:** A project-level estimate the team can review, override, price, and export—aligned with workflows similar to tools like **QuickBid** (import-ready structured output).

**Non-goals in this overview:** Full accounting/ERP replacement; this is estimating and document-driven workflow software.

---

## 2. High-level architecture

| Layer | Technology |
|-------|------------|
| UI | React 18, Tailwind, Next.js 14 App Router |
| API | Next.js route handlers (`/api/*`) |
| AI | OpenRouter → Google Gemini (e.g. `google/gemini-2.5-pro`) for PDF extraction and material matching; optional unified prompt path |
| Data | Supabase (PostgreSQL) for projects, materials (`spec_database`), pipeline artifacts, teams/auth |
| Cache | Upstash Redis (optional) for material DB payload during match |
| Excel | `xlsx` parsing on the server |
| Reports | jsPDF / autotable; optional worker |

Access to the app is **authenticated** (session cookies, RBAC). Pipeline routes are protected.

---

## 3. Main inputs

| Input | Role |
|-------|------|
| **PDF (spec book)** | Unstructured specification: wall/ceiling types (e.g. `WEF1`, `W14`), materials (gypsum, studs, insulation, etc.), fire/STC ratings. Uploaded as **base64** to the extract API. |
| **Excel (takeoff)** | Quantities: typically **Level**, **Assembly Type**, **Wall Type** (must align with PDF `assembly_id`), **Height**, **Wall Length / Ceiling Area**, optional ceiling **perimeter**, etc. Parsed by `/api/parse-takeoff` into raw rows. |
| **Material & labor database** | Product codes, descriptions, units, costs, formulas, labor rules. **Live source of truth** for CRUD is usually **Supabase** (`spec_database`); some code paths also read **`data/material-database.json`** (e.g. unified pipeline, labor index helpers). |
| **Project context** | Optional: `projectId` links uploads to a project; location/country and overrides affect pricing and rules in the UI. |

---

## 4. Main outputs

| Output | Description |
|--------|-------------|
| **Final assembly JSON (`final_outputs`)** | Per-assembly records with `assembly_id`, wall vs ceiling, heights, aggregated lengths/areas, `materials_costing` (extracted lines + `matched_materials` + `matched_labor`), `status` (e.g. `OK` vs `REVIEW REQUIRED` if takeoff type not found in match). Intended to be **QuickBid-oriented** / import-ready structured data. |
| **Enriched quantities** | After merge, utilities stamp **`quantity`**, **`sec_quantity`**, wastage, etc., using DB formulas and takeoff-derived dimensions where applicable. |
| **UI + exports** | Project tabs (materials, labor, markups, reports), PDF/Excel-style exports, markups and general requirements sections as implemented in the product. |
| **Intermediate artifacts (DB)** | `assembly_extractions` (step 1), `material_matches` (step 2), `takeoff_outputs` (parsed Excel), `final_outputs` (step 3)—each storable per project for traceability and re-runs. |

---

## 5. The main pipeline (gist)

There are **two** ways to run the core PDF + Excel → estimate flow:

### 5.1 Primary path (current UI): sequential 3-step pipeline

This is what **`ImportFilesModal`** drives: separate API calls, each can persist to the database.

```
PDF  ──►  Step 1: EXTRACT (AI)     ──►  Assembly JSON (raw materials by category)
                │
Excel ──►  Parse takeoff (code)   ──►  Raw takeoff rows (saved if projectId set)
                │
                ▼
          Step 2: MATCH (AI)        ──►  Material match JSON
                │                      (matched_materials + matched_labor per line)
                ▼
          Step 3: FINALIZE (code)   ──►  Final output JSON
                                       merge match + takeoff by assembly_id / wall_type
```

| Step | Name | AI? | What happens (short) |
|------|------|-----|-------------------------|
| **1** | Extract | Yes | PDF → structured `assemblies[]` with `materials` (e.g. `gypsum_board`, `steel_framing`) and ratings; **no** priced codes yet. |
| **2** | Match | Yes | Extraction + material DB → each line matched to SKUs and labor; adds related items (screws, track, etc.) per prompt rules. |
| **3** | Finalize | No* | **Deterministic merge** (`mergeTakeoffWithMaterialMatch`): aggregate takeoff by `(assembly_id, height)`, join to matched assemblies, apply height buckets, set statuses. *If there is **no** takeoff, an **AI finalize** fallback may run for backward compatibility. |

**Typical API sequence:** `POST /api/parse-takeoff` (Excel) → `POST /api/extract` (PDF) → `POST /api/match` → `POST /api/finalize` (with IDs linking extraction, match, and takeoff).

**Why Step 3 is mostly code:** Joining by IDs and summing quantities is exact arithmetic and lookups—no fuzzy interpretation—so it is fast, cheap, and repeatable.

### 5.2 Alternate path: unified single request

**`POST /api/process-pipeline`** accepts **PDF + Excel (base64)** in one call: extract → parse takeoff → load material DB (from repo **`data/material-database.json`** in that route) → **`finalizeWithUnifiedPrompt`** (batched AI) → enrich quantities → save `final_outputs`.

Use this when you want **one HTTP round-trip**; the **main product UI** still favors the **sequential** flow for clearer progress, timeouts, and per-step persistence.

---

## 6. Where AI is used vs not (summary)

| Area | AI | Reason |
|------|----|--------|
| Reading PDF specs | Yes | Layouts and wording vary; natural language and tables need interpretation. |
| Matching lines to SKU/labor | Yes | Fuzzy alignment between spec text and database descriptions + complex add-on rules. |
| Parsing Excel | No | Column-driven `xlsx` parse. |
| Merging match + takeoff (normal path) | No | Keyed joins and sums. |
| Quantity enrichment from formulas | No | Evaluated in code from stored definitions. |

---

## 7. Product surface (beyond the pipeline)

- **Dashboard / projects** — Organize work by project.  
- **Database tab** — Maintain `spec_database` materials (and sync concerns with local JSON for some pipelines—see `docs/DATA_SOURCES.md`).  
- **Project workspace** — View/edit assemblies, overrides, estimate result, takeoff preview, reports.  
- **Team / admin** — Auth and RBAC (see `docs/RBAC_ARCHITECTURE.md`).  
- **Markups & general requirements** — Division 01–style sections and pricing add-ons (see repo rules under `.claude/rules/` for markups).

---

## 8. Operational notes (for Q&A context)

- **Time:** Extract + match are often on the order of **many seconds to a few minutes each** depending on PDF size and batching; finalize (code path) is roughly **~1 second**.  
- **Reliability:** AI steps can return malformed JSON; the app uses **JSON repair** and batched calls to reduce truncation.  
- **“REVIEW REQUIRED”:** Often means takeoff **Wall Type** did not match any **assembly_id** from the material match step, or similar mismatch—human review in the UI.  
- **Environment:** Server needs secrets such as **OpenRouter** API key; Supabase and Redis URLs as configured. Root `README.md` may still reference legacy `GEMINI_API_KEY` naming—verify `.env.local` against actual code paths (OpenRouter vs direct Gemini).

---

## 9. Source documents in this repo (go deeper)

| Document | Contents |
|----------|----------|
| `PROJECT_LOOKOUT.md` | System map, tech stack, file layout, step-by-step data flow. |
| `docs/PIPELINE_ARCHITECTURE.md` | Detailed pipeline, JSON shapes, DB tables, aggregation rules. |
| `docs/CLIENT_EXPLANATION.md` | Non-technical explanation of AI vs code steps (client-facing tone). |
| `docs/AI_PIPELINE_DOCUMENTATION.md` | Unified-flow–centric diagram and endpoint notes; cross-check with `PIPELINE_ARCHITECTURE.md` for **current** default UI (sequential). |
| `src/services/pipeline/README.md` | Module map: prompts, extract/match/finalize/unified. |
| `CLAUDE.md` | Contributor rules for this codebase (frontend/backend/db/typescript). |
| `docs/DATA_SOURCES.md` | Material DB sources (Supabase vs local JSON). |

---

*Last synthesized for repository snapshot; when behavior and docs diverge, prefer the code in `src/app/api/` and `src/services/`.*
