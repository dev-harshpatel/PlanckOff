/**
 * User-visible pipeline status messages.
 * Used by ImportFilesModal for the step label and by any component
 * that needs to display pipeline progress text.
 *
 * Keep these in one place so wording is consistent between the modal,
 * the minimized bar, and any future notification UI.
 */

export const PIPELINE_STEP_MESSAGES = {
  PARSE_TAKEOFF:  "Parsing takeoff Excel...",
  STEP_1_EXTRACT: "Step 1/3: Extracting assemblies from PDF...",
  STEP_2_MATCH:   "Step 2/3: Matching materials to database...",
  STEP_3_FINALIZE:"Step 3/3: Finalizing output...",
} as const;

/** Sub-step labels shown below the main status message during Step 1 (chunked mode). */
export const EXTRACT_SUB_STEP_LABELS = {
  SKELETON:          "Identifying assemblies...",
  GYPSUM:            "Extracting gypsum board data...",
  STEEL_FRAMING:     "Extracting steel framing data...",
  INSULATION:        "Extracting insulation data...",
  MOISTURE_CONTROL:  "Extracting moisture control data...",
  WOOD_SUBSTRATES:   "Extracting wood substrate data...",
  SPECIALTY:         "Extracting specialty items...",
} as const;

/** Total number of sub-steps in the chunked extraction (1 skeleton + 6 category chunks). */
export const EXTRACT_CHUNK_COUNT = 7;
