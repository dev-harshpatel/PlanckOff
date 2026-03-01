# AI Pipeline Documentation

## Overview

The PlanckOff Drywall Estimator uses a multi-stage AI pipeline to process construction documents and generate material cost estimates. This document explains each stage, what data is used, and how it flows through the system.

---

## Pipeline Flow Diagram

```
┌─────────────────────┐     ┌─────────────────────┐
│  Assembly PDF       │     │  Takeoff Excel      │
│  (Wall Specs)       │     │  (Quantities)       │
└─────────┬───────────┘     └─────────┬───────────┘
          │                           │
          ▼                           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  STEP 1: Extract    │     │  STEP 2: Parse      │
│  Assemblies (AI)    │     │  Takeoff (Code)     │
│  Gemini 2.5 Pro     │     │  XLSX Library       │
└─────────┬───────────┘     └─────────┬───────────┘
          │                           │
          │    ┌──────────────────┐   │
          │    │  STEP 3: Load    │   │
          │    │  Material DB     │   │
          │    │  (Local JSON)    │   │
          │    └────────┬─────────┘   │
          │             │             │
          ▼             ▼             ▼
        ┌─────────────────────────────────┐
        │  STEP 4: Finalize (AI)          │
        │  Gemini 2.5 Pro                 │
        │  - Match materials to DB        │
        │  - Calculate quantities         │
        │  - Apply labor rules            │
        └─────────────────┬───────────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │  Final Output JSON  │
                │  (QuickBid Format)  │
                └─────────────────────┘
```

---

## Step-by-Step Breakdown

### Step 1: Extract Assemblies from PDF

**File:** `src/services/openrouter/extractAssemblies.ts`

**Input:**
- Assembly PDF (base64 encoded) - contains wall/ceiling specifications from construction drawings

**AI Model:** `google/gemini-2.5-pro` via OpenRouter

**What it does:**
1. Sends the PDF to Gemini with a specialized prompt
2. AI reads every line of each assembly specification
3. Extracts materials into categories:
   - `gypsum_board` - drywall, Type X, fire-rated gypsum
   - `gypsum_sheathing` - exterior glass mat-faced sheathing
   - `steel_framing` - studs, tracks, furring channels
   - `insulation` - batt, rock wool, mineral wool
   - `plywood` - plywood, OSB
   - `blocking_and_bracing` - structural blocking
   - `steel_deck` - steel decking
   - `vapor_barriers` - poly barriers
   - `sealants` - fire/acoustic sealants
   - `trim_and_accessories` - corner bead, J-trim

**Output format:**
```json
{
  "assemblies": [
    {
      "assembly_id": "W14",
      "fire_rating": "1 Hour",
      "stc_rating": "STC 50",
      "materials": {
        "gypsum_board": [
          {
            "raw_text": "2 LAYERS 16mm GYPSUM WALLBOARD TYPE X",
            "thickness": "16mm",
            "layers": 2,
            "type": "Type X"
          }
        ],
        "steel_framing": [...],
        "insulation": [...]
      }
    }
  ]
}
```

**Key rules in prompt:**
- Read EVERY line of each assembly (don't stop early)
- Never miss gypsum board if steel framing exists
- Extract ALL insulation types (walls can have multiple)
- Preserve exact `raw_text` from PDF

---

### Step 2: Parse Takeoff Excel

**File:** `src/services/takeoff/parseRawTakeoff.ts`

**Input:**
- Takeoff Excel file (base64 encoded) - contains quantities from quantity surveyor

**Processing:** Pure code (no AI) using XLSX library

**Required Excel columns:**
- `Level` - building level (e.g., "Level 1", "Roof")
- `Assembly Type` - "Wall", "Ceiling", "Soffit"
- `Wall Type` - assembly ID that matches PDF (e.g., "W14")
- `Height` - wall height in feet
- `Wall Length / Ceiling Area` - linear feet or square feet

**Optional columns:**
- `No.` - count/quantity
- `Unit` - unit of measure
- `Area Parementer` - perimeter for ceilings

**Output format:**
```json
[
  {
    "level": "Level 1",
    "assembly_type": "Wall",
    "wall_type": "W14",
    "height": 10,
    "wall_length": 150
  },
  {
    "level": "Level 1",
    "assembly_type": "Ceiling",
    "wall_type": "C1",
    "height": null,
    "ceiling_area": 500,
    "area_parementer": 100
  }
]
```

---

### Step 3: Load Material Database

**File:** `data/material-database.json` (LOCAL JSON FILE)

**Source:** This is the local JSON file in the repository, NOT the Supabase database.

**Why local JSON?**
- The AI needs the full database in its context to match materials
- Sending to Supabase and back would add latency
- The JSON is trimmed to essential fields before sending to AI

**Trimmed fields sent to AI:**
```json
{
  "code": "DW-58-X-8",
  "section": "09 29 00",
  "type": "Division 09",
  "description": "5/8\" Type X Gypsum Board 4x8",
  "category": "Drywall",
  "matCost": "15.50",
  "per": "EA",
  "manufacturer": "USG"
}
```

**Full database has additional fields (not sent to AI):**
- `formulaQty`, `formulaSecQty` - calculation formulas
- `mouWall`, `mouCeil` - measure of unit
- `width`, `gauge`, `flange` - technical specs
- `productivity`, `hourlyRate` - labor data

---

### Step 4: Finalize with Unified Prompt

**File:** `src/services/openrouter/processWithUnifiedPrompt.ts`

**Prompt file:** `prompt/prompt.txt`

**AI Model:** `google/gemini-2.5-pro` via OpenRouter

**Inputs (all 3 combined):**
1. Assembly Specification JSON (from Step 1)
2. Takeoff JSON (from Step 2)
3. Material & Labor Database JSON (from Step 3)

**What it does:**
1. **Match takeoff to assemblies:** `takeoff.wall_type == assembly.assembly_id`
2. **Match materials to database:** Find exact matches by category, thickness, type
3. **Add related materials automatically:**
   - Metal studs → Add matching Track + Deflection Track + Tek screws
   - Gypsum board → Add drywall screws (fire-rated if Type X)
   - Fire rating → Add fire sealant + fire-stop labor
   - STC rating → Add acoustic sealant + caulking labor
4. **Match labor from database:**
   - Gypsum → "Hang Drywall" + "Type X Premium"
   - Steel studs → "Install Metal Studs" + "Install Track"
   - Insulation → "Install Batt Insulation"
5. **Aggregate quantities:**
   - Same assembly_id at DIFFERENT heights → Separate entries
   - Same assembly_id at SAME height → Sum quantities
6. **Determine gauge:** Based on height, location, fire rating

**Batching:**
- Assemblies are processed in batches of 8
- 2 batches run in parallel (CONCURRENCY = 2)
- Prevents output token truncation

**Output format:**
```json
{
  "assemblies": [
    {
      "assembly_id": "W14",
      "assembly_type": "Wall",
      "fire_rating": "1 Hour",
      "height_ft": 10,
      "height_category": "up to 10'",
      "total_length": 350,
      "materials_costing": [
        {
          "extracted_material": {
            "raw_text": "2 LAYERS 16mm GYPSUM WALLBOARD TYPE X",
            "layers": 2,
            "height_ft": 10,
            "total_length": 350
          },
          "matched_materials": [
            {
              "code": "DW-58-X-8",
              "section": "09 29 00",
              "description": "5/8\" Type X Gypsum Board 4x8",
              "manufacturer": "USG",
              "unit": "EA",
              "unit_cost": 15.50
            }
          ],
          "matched_labor": [
            {
              "code": "LAB-HANG-DW",
              "section": "01 00 00",
              "description": "Hang Drywall",
              "unit": "SF",
              "unit_cost": 0.45
            }
          ]
        }
      ],
      "status": "OK"
    }
  ]
}
```

---

## Data Sources Summary

| Stage | Data Source | Location | Used For |
|-------|-------------|----------|----------|
| Step 1 | Assembly PDF | User upload | Extract wall/ceiling specs |
| Step 2 | Takeoff Excel | User upload | Get quantities |
| Step 3 | Material Database | `data/material-database.json` | Match materials & labor |
| Step 4 | Prompt | `prompt/prompt.txt` | AI instructions |

**Important:** The material database used in the AI pipeline is the **local JSON file** (`data/material-database.json`), NOT the Supabase database. The Supabase database (`spec_database` table) is used for:
- UI display in the Database tab
- Manual edits by users
- Excel import/export

To sync changes from Supabase to the local JSON, you would need to export from the Database tab.

---

## API Endpoints

### Main Pipeline Endpoint

**`POST /api/process-pipeline`**

```typescript
// Request body
{
  pdfBase64: string;      // Assembly PDF as base64
  excelBase64: string;    // Takeoff Excel as base64
  projectId?: string;     // Optional: save to project
}

// Response
{
  success: true,
  assemblyCount: 25,      // Assemblies from PDF
  takeoffCount: 150,      // Rows from Excel
  finalCount: 45,         // Final output assemblies
  tokensUsed: 125000,
  assemblyResult: {...},  // Step 1 output
  takeoffResult: [...],   // Step 2 output
  finalResult: {...}      // Step 4 output
}
```

### Legacy Endpoints (Separate Steps)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/extract` | Step 1 only - PDF extraction |
| `POST /api/match` | Material matching (deprecated) |
| `POST /api/finalize` | Step 4 only - finalize with takeoff |

---

## Cost & Performance

### Token Usage (Approximate)

| Step | Model | Tokens |
|------|-------|--------|
| Step 1 (Extract) | Gemini 2.5 Pro | ~10K-50K |
| Step 4 (Finalize) | Gemini 2.5 Pro | ~50K-200K |
| **Total** | | ~60K-250K per run |

### Timing (Approximate)

| Step | Duration |
|------|----------|
| Step 1 (PDF Extract) | 30-90 seconds |
| Step 2 (Excel Parse) | < 1 second |
| Step 3 (Load DB) | < 1 second |
| Step 4 (Finalize) | 60-180 seconds |
| **Total** | 2-5 minutes |

---

## Troubleshooting

### Common Issues

1. **"No assemblies extracted"**
   - PDF may not be readable by AI
   - Check PDF is not image-only (needs OCR)

2. **"Missing required columns" in takeoff**
   - Excel must have: Assembly Type, Wall Type, Height, Wall Length/Ceiling Area
   - Check column headers match expected patterns

3. **"REVIEW REQUIRED" status**
   - Material not found in database
   - Add missing material to `data/material-database.json`

4. **Truncated JSON response**
   - AI hit token limit
   - System attempts automatic JSON repair
   - If fails, reduce batch size in code

### Logs

Check server logs for detailed timing:
```
[process-pipeline] Step 1 done [45.2s] — 25 assemblies
[process-pipeline] Step 2 done [0.3s] — 150 takeoff rows
[process-pipeline] Step 3 done [0.1s] — loaded material DB
[process-pipeline] Step 4 done [120.5s] — 45 final assemblies
```

---

## Future Considerations

1. **Database Sync:** Consider syncing Supabase `spec_database` to local JSON automatically
2. **Caching:** Cache extracted assemblies for same PDF
3. **Streaming:** Stream results as batches complete
4. **Cost Optimization:** Use Gemini Flash for simpler tasks
