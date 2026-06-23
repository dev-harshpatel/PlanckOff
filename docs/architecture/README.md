# Architecture Docs

This folder is the single source of truth for all architectural decisions in PlanckOff.
Read the relevant doc before writing any code that touches the system it describes.

---

| Doc | What it covers | Must read before… |
|-----|----------------|-------------------|
| [MATCHING_ARCHITECTURE.md](MATCHING_ARCHITECTURE.md) | Branch classification + BOM expansion matching flow | Editing `src/services/matching/`, `src/lib/utils/materialNormalizer.ts`, or the `/api/match` route |
| [PIPELINE_OVERVIEW.md](PIPELINE_OVERVIEW.md) | End-to-end pipeline: extract → match → finalize | Any pipeline step change |
| [CALCULATION_RULES.md](CALCULATION_RULES.md) | Single source of truth for all cost/quantity formulas | Anything that shows a dollar value |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Three-database architecture: material_database, labour_database, assembly_bunch_database | Schema changes, import scripts, DB queries |

---

## Quick orientation

```
PDF
  ↓ /api/extract        → assembly extractions (AI vision)
  ↓ /api/match          → material matches     (rule-based, branch expansion)
  ↓ /api/finalize       → final_output         (formula evaluation + takeoff merge)
  ↓ /api/assembly-data  → WallAssembly[]        (served to Reports)
```

The matching step (`/api/match`) is the one most likely to need attention.
See [MATCHING_ARCHITECTURE.md](MATCHING_ARCHITECTURE.md) for the complete flow.
