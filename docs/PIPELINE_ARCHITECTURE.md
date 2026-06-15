# Drywall Estimator Pipeline Architecture

## Overview

The Drywall Estimator processes construction specifications (PDF) and takeoff quantities (Excel) through a **3-step sequential pipeline** to produce costed assembly data ready for QuickBid import.

**Pipeline Flow:**
```
PDF (Spec Book) + Excel (Takeoff) 
  → Step 1: Extract (AI) → Assembly JSON
  → Step 2: Match (AI) → Material Match JSON  
  → Step 3: Finalize (Code) → Final Output JSON
```

---

## Step 1: Extract (PDF → Assembly JSON)

### Purpose
Read unstructured PDF specification book and extract structured assembly data (materials, fire ratings, STC ratings, etc.).

### Input
- **PDF file** (base64 encoded)
- **Project ID** (optional, for saving to database)

### Process

1. **Client Upload**
   - User selects PDF file in `ImportFilesModal`
   - File is converted to base64: `fileToBase64(pdfFile)`
   - POST `/api/extract` with body:
     ```json
     {
       "pdfBase64": "...",
       "projectId": "uuid"
     }
     ```

2. **Server Processing** (`src/app/api/extract/route.ts`)
   - Reads PDF buffer from base64
   - Calls `extractAssembliesFromPDF(pdfBase64, apiKey)` (`src/services/openrouter/extractAssemblies.ts`)
   - Sends to **OpenRouter API** (Gemini 2.5 Pro) with:
     - **System prompt**: Instructions to extract assemblies from PDF spec book
     - **User message**: PDF content (base64 or text extracted)
     - **Response format**: JSON object with `assemblies[]` array

3. **AI Extraction Logic**
   - AI reads PDF page by page
   - Identifies assembly blocks (e.g., "WEF1", "PB1", "WC3")
   - For each assembly, extracts:
     - `assembly_id`: Unique identifier (e.g., "WEF1")
     - `fire_rating`: Fire resistance (e.g., "2 HR", "N/A")
     - `stc_rating`: Sound transmission class (e.g., "55", null)
     - `materials`: Object with arrays per material type:
       - `gypsum_board[]`: Each entry has `raw_text`, `thickness`, `type`, `layers`
       - `steel_framing[]`: `raw_text`, `size`, `gauge`, `spacing`
       - `insulation[]`, `plywood[]`, `vapor_barriers[]`, etc.
   - Each material entry contains **raw spec text** only (no codes, no pricing)

4. **Output Structure**
   ```json
   {
     "assemblies": [
       {
         "assembly_id": "WEF1",
         "fire_rating": "2 HR",
         "stc_rating": null,
         "materials": {
           "gypsum_board": [
             {
               "raw_text": "16 mm GYPSUM WALLBOARD TYPE 'X'",
               "thickness": 16,
               "type": "TYPE 'X'",
               "layers": 1,
               "size": null,
               "gauge": null,
               "spacing": null
             }
           ],
           "steel_framing": [
             {
               "raw_text": "152 mm METAL STUDS",
               "size": "152 mm",
               "gauge": null,
               "spacing": "400 mm O.C."
             }
           ]
         }
       }
     ]
   }
   ```

5. **Database Save**
   - Saved to `assembly_extractions` table:
     - `id`: UUID
     - `project_id`: Links to project
     - `filename`: `assembly-{timestamp}.json`
     - `data`: Full JSON (as JSONB)
   - Returns `extractionId` to client

### Why AI is Required
- PDFs have no fixed schema (different formats, layouts, terminology)
- Requires reading natural language and interpreting construction specs
- Cannot be parsed with simple regex or fixed rules

---

## Step 2: Match (Assembly + Material DB → Material Match)

### Purpose
Match extracted materials to material/labor database codes and add pricing, labor costs, and related items (screws, tracks, etc.).

### Input
- **Assembly extraction JSON** (from Step 1)
- **Material database** (457 entries from `data/material-database.json`)
- **Extraction ID** (for linking)

### Process

1. **Client Request**
   - POST `/api/match` with body:
     ```json
     {
       "extraction": { "assemblies": [...] },
       "extractionId": "uuid",
       "projectId": "uuid"
     }
     ```

2. **Server Processing** (`src/app/api/match/route.ts`)
   - Loads material database:
     - Checks Redis cache first
     - If miss, reads `data/material-database.json` and caches to Redis
   - Calls `matchMaterialsToDatabase(input, apiKey)` (`src/services/openrouter/matchMaterials.ts`)
   - Batches assemblies (15 per batch) to stay within token limits

3. **AI Matching Logic**
   - For each assembly's `materials_costing[]`:
     - **Material matching**: Matches `raw_text` to database entries by:
       - Category (gypsum_board, steel_framing, etc.)
       - Thickness, size, gauge, type
       - Fire rating (Type X vs regular)
     - **Related items**: Adds automatically:
       - Studs → Track + Deflection Track + Framing Screws
       - Gypsum → Drywall Screws (fire-rated if Type X)
       - Sealants only on first gypsum layer
     - **Labor matching**: Adds labor codes by:
       - Material type (hang drywall, install studs, etc.)
       - Height category (from assembly or default)
       - Fire rating (affects labor cost)

4. **Output Structure**
   ```json
   {
     "assemblies": [
       {
         "assembly_id": "WEF1",
         "materials_costing": [
           {
             "extracted_material": {
               "raw_text": "16 mm GYPSUM WALLBOARD TYPE 'X'",
               "thickness": 16,
               "type": "TYPE 'X'",
               "layers": 1
             },
             "matched_materials": [
               {
                 "code": "DW-58-8-X",
                 "section": "09 29 00",
                 "description": "5/8\" Type X Fire Rated Board 4x8",
                 "manufacturer": "USG",
                 "unit": "1 EA",
                 "unit_cost": 18.5
               },
               {
                 "code": "SC-S-114",
                 "description": "1-1/4\" Fine Thread Drywall Screw",
                 "unit": "8,000 EA",
                 "unit_cost": 85
               }
             ],
             "matched_labor": [
               {
                 "code": "LAB-HNG-15",
                 "description": "Hang Drywall (12' to 15')",
                 "unit": "1 SF",
                 "unit_cost": 0.7
               }
             ]
           }
         ]
       }
     ]
   }
   ```

5. **Database Save**
   - Saved to `material_matches` table:
     - `id`: UUID
     - `project_id`: Links to project
     - `assembly_extraction_id`: Links to Step 1 output
     - `filename`: `material_match-{timestamp}.json`
     - `data`: Full JSON (as JSONB)
   - Returns `matchId` to client

### Why AI is Required
- Fuzzy matching (e.g., "16 mm TYPE 'X' GYPSUM" → right board code)
- Complex rules (related items, labor by height, fire rating logic)
- Would require extensive rule engine to replicate in code

---

## Step 3: Finalize (Material Match + Takeoff → Final Output)

### Purpose
Combine material match with takeoff quantities, aggregate by assembly and height, and produce final QuickBid-ready JSON.

### Input
- **Material match JSON** (from Step 2)
- **Takeoff data** (from Excel parsing)
- **Takeoff Output ID** (optional, for fetching from DB)

### Process

#### A. Excel Parsing (Before Step 3)

1. **Client Upload**
   - User selects Excel file in `ImportFilesModal`
   - POST `/api/parse-takeoff` with FormData:
     - `file`: Excel file
     - `projectId`: UUID (optional, for saving)

2. **Server Parsing** (`src/app/api/parse-takeoff/route.ts`)
   - Reads Excel buffer using `xlsx` library
   - Calls `parseRawTakeoffSheet(buffer)` (`src/services/takeoff/parseRawTakeoff.ts`)
   - Parses columns:
     - `Level`, `Assembly Type`, `Wall Type` (assembly_id), `Height`
     - `Wall Length / Ceiling Area` (quantity)
     - `Area Parementer` (for ceilings)
     - `No.`, `Unit` (optional)

3. **Raw Takeoff Structure**
   ```typescript
   interface TakeoffRawRecord {
     level: string | number | null;
     assembly_type: string | null;  // "Interior Wall", "Ceiling", etc.
     wall_type: string | null;        // assembly_id (e.g., "WEF1")
     height: number | string | null;  // Height in feet
     wall_length?: number;             // For walls
     ceiling_area?: number;            // For ceilings
     area_parementer?: number;         // For ceilings
     no?: number | string | null;
     unit?: string | null;
   }
   ```

4. **Database Save** (if `projectId` provided)
   - Saved to `takeoff_outputs` table:
     - `id`: UUID
     - `project_id`: Links to project
     - `filename`: `takeoff-{timestamp}.json`
     - `data`: Array of `TakeoffRawRecord[]` (as JSONB)
   - Returns `takeoffOutputId` to client

#### B. Finalize Step (Code-Only Merge)

1. **Client Request**
   - POST `/api/finalize` with body:
     ```json
     {
       "materialMatch": { "assemblies": [...] },
       "projectId": "uuid",
       "assemblyExtractionId": "uuid",
       "takeoffOutputId": "uuid"
     }
     ```

2. **Server Processing** (`src/app/api/finalize/route.ts`)

   **Takeoff Data Loading** (in priority order):
   - **Option 1**: If `takeoffOutputId` provided → fetch by ID from `takeoff_outputs`
   - **Option 2**: If `takeoffOutputId` not found → fetch latest takeoff for `projectId`
   - **Option 3**: If `takeoff` array in body → use directly
   - **Fallback**: If no takeoff → use AI finalize (backwards compatibility)

   **Material Match Loading**:
   - If `materialMatch` in body → use it
   - Else if `projectId` → fetch latest from `material_matches`

3. **Code-Only Merge** (`src/services/finalize/mergeTakeoffWithMaterialMatch.ts`)

   **Step 3a: Aggregate Takeoff**
   - Groups takeoff rows by `(wall_type, height)`:
     ```typescript
     // Key: "WEF1|15" → one group
     // Multiple rows with same wall_type + height → sum quantities
     ```
   - For each group:
     - **Walls**: Sum `wall_length` → `total_length`
     - **Ceilings**: Sum `ceiling_area`, sum `area_parementer`
   - Determines `is_ceiling` from `assembly_type` (contains "ceiling")

   **Step 3b: Height Category Mapping**
   - Maps height (ft) to category:
     ```typescript
     0-10   → "up to 10'"
     10-12  → "10' to 12'"
     12-15  → "12' to 15'"
     15-20  → "15' to 20'"
     20+    → "20' and above"
     ```

   **Step 3c: Match & Merge**
   - For each aggregated takeoff group:
     - Find matching assembly in material match: `takeoff.wall_type === assembly.assembly_id`
     - If found:
       - Copy assembly fields: `fire_rating`, `stc_rating`, `project_location`, `selected_gauge`, `framing_category`
       - Set takeoff-derived fields: `height_ft`, `height_category`, `total_length` (or `ceiling_area`/`area_parementer`)
       - Set `assembly_type`: "wall" or "ceiling"
       - Deep clone `materials_costing[]` and enrich each `extracted_material`:
         - Add `height_ft`, `height_category`, `total_length` (for walls)
         - Add `ceiling_area`, `area_parementer` (for ceilings)
         - Keep `matched_materials[]` and `matched_labor[]` unchanged
       - Set `status: "OK"`
     - If not found:
       - Create assembly with `status: "REVIEW REQUIRED"`, `review_notes: "Assembly not found in material match"`

4. **Output Structure**
   ```json
   {
     "assemblies": [
       {
         "assembly_id": "WEF1",
         "assembly_type": "wall",
         "fire_rating": "2 HR",
         "stc_rating": null,
         "height_ft": 15,
         "height_category": "12' to 15'",
         "total_length": 165,
         "ceiling_area": null,
         "area_parementer": null,
         "project_location": "US",
         "selected_gauge": "20ga",
         "framing_category": "Structural",
         "materials_costing": [
           {
             "extracted_material": {
               "raw_text": "16 mm GYPSUM WALLBOARD TYPE 'X'",
               "thickness": 16,
               "type": "TYPE 'X'",
               "layers": 1,
               "height_ft": 15,
               "height_category": "12' to 15'",
               "total_length": 165,
               "selected_gauge": "20ga",
               "ceiling_area": null,
               "area_parementer": null
             },
             "matched_materials": [...],
             "matched_labor": [...]
           }
         ],
         "status": "OK",
         "review_notes": null
       }
     ]
   }
   ```

5. **Database Save**
   - Saved to `final_outputs` table:
     - `id`: UUID
     - `project_id`: Links to project
     - `assembly_extraction_id`: Links to Step 1
     - `takeoff_output_id`: Links to takeoff used
     - `filename`: `final_output-{timestamp}.json`
     - `data`: Full JSON (as JSONB)
   - Returns `finalOutputId` to client

### Why Code-Only (No AI)
- **Deterministic operations**:
  - Matching: Simple key lookup (`wall_type === assembly_id`)
  - Aggregation: Sum by `(assembly_id, height)`
  - Height categories: Fixed ranges
  - Enrichment: Copy fields from takeoff to `extracted_material`
- **No new material/labor matching**: Already done in Step 2
- **Fast**: Completes in ~1 second vs. minutes with AI batches

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Extract (AI)                                        │
│ PDF → OpenRouter (Gemini) → Assembly JSON                   │
│ Output: assemblies[] with materials{} (raw_text only)       │
│ Time: ~180-200s                                              │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Match (AI)                                           │
│ Assembly JSON + Material DB → OpenRouter → Material Match   │
│ Output: assemblies[] with materials_costing[]               │
│         (extracted_material + matched_materials + matched_labor)│
│ Time: ~180-200s                                              │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Excel Parsing (Code)                                        │
│ Excel → parseRawTakeoffSheet() → TakeoffRawRecord[]         │
│ Output: Array of takeoff rows (wall_type, height, quantities)│
│ Time: ~1s                                                    │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Finalize (Code)                                     │
│ Material Match + Takeoff → mergeTakeoffWithMaterialMatch()  │
│ Output: Final assemblies[] with quantities + costing        │
│ Time: ~1s                                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### `assembly_extractions`
- Stores Step 1 output (raw assembly specs from PDF)
- Columns: `id`, `project_id`, `filename`, `data` (JSONB), `created_at`

### `material_matches`
- Stores Step 2 output (matched materials and labor)
- Columns: `id`, `project_id`, `assembly_extraction_id`, `filename`, `data` (JSONB), `created_at`

### `takeoff_outputs`
- Stores parsed Excel takeoff data
- Columns: `id`, `project_id`, `filename`, `data` (JSONB array), `created_at`
- **Note**: Not deleted on "overwrite" (so finalize can reuse it)

### `final_outputs`
- Stores Step 3 output (final QuickBid-ready JSON)
- Columns: `id`, `project_id`, `assembly_extraction_id`, `takeoff_output_id`, `filename`, `data` (JSONB), `created_at`

---

## Key Implementation Details

### Aggregation Logic
- **Same assembly at same height** (multiple takeoff rows) → **ONE** output assembly with **summed** quantities
- **Same assembly at different heights** → **SEPARATE** output assemblies (one per height)
- Example: 3 rows of "WEF1" at 15ft → 1 output with `total_length = sum(wall_length)`

### Height Categories
- Used for labor matching and categorization
- Mapped from numeric height (ft) to string category
- Applied to both assembly-level and `extracted_material` level

### Material Costing Enrichment
- Each `materials_costing[]` item's `extracted_material` is enriched with:
  - `height_ft`, `height_category`, `total_length` (walls)
  - `ceiling_area`, `area_parementer` (ceilings)
  - `selected_gauge` (from assembly)
- `matched_materials[]` and `matched_labor[]` are **copied unchanged** (already matched in Step 2)

### Error Handling
- **Missing assembly**: If `wall_type` not in material match → `status: "REVIEW REQUIRED"`
- **Missing takeoff**: Falls back to AI finalize (backwards compatibility)
- **Takeoff ID not found**: Tries latest takeoff for project before returning 404

---

## Performance Characteristics

| Step | Method | Time | API Calls | Credits Used |
|------|--------|------|-----------|--------------|
| Extract | AI (OpenRouter) | ~180-200s | 1 | ~28K tokens |
| Match | AI (OpenRouter) | ~180-200s | 3 batches | ~160K tokens |
| Parse Takeoff | Code | ~1s | 0 | 0 |
| Finalize | Code | ~1s | 0 | 0 |

**Total Pipeline Time**: ~6-7 minutes (mostly AI steps)
**Total Credits**: ~188K tokens (only Steps 1-2)

---

## Client-Side Flow

1. **User uploads PDF and Excel** → `ImportFilesModal`
2. **Excel parsed** → `takeoffOutputId` stored in ref
3. **User clicks Continue** → Sequential API calls:
   - `POST /api/extract` → `extractionId`
   - `POST /api/match` → `matchId`
   - `POST /api/finalize` → `finalOutputId`
4. **Results displayed** → Project page loads final output via `GET /api/assembly-data`

---

## Service Structure

Pipeline services are organized under `src/services/`:

| Layer | Path | Purpose |
|-------|------|---------|
| Pipeline index | `pipeline/index.ts` | Re-exports for both flows |
| Extract | `openrouter/extractAssemblies.ts` | PDF → assembly JSON |
| Match | `openrouter/matchMaterials.ts` | Assembly + DB → matched JSON |
| Finalize (merge) | `finalize/mergeTakeoffWithMaterialMatch.ts` | Matched + takeoff → final (code) |
| Finalize (AI fallback) | `openrouter/finalizeAssemblies.ts` | When no takeoff |
| Unified flow | `openrouter/processWithUnifiedPrompt.ts` | One-shot flow (future) |

**Unified flow** (`/api/process-pipeline`): PDF + Excel in one request → extract → parse takeoff → load DB → `finalizeWithUnifiedPrompt` (prompt.txt). Kept for future use; UI currently uses sequential flow.

---

## Future Optimizations

- **Caching**: Material DB already cached in Redis
- **Parallel processing**: Steps 1-2 could run in parallel (if PDF and Excel are independent)
- **Incremental updates**: Re-run only changed steps
- **Batch size tuning**: Match step batch size optimized for token limits
