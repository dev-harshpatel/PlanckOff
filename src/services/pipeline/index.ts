/**
 * Pipeline Services — Re-exports for assembly extraction, matching, and finalization.
 *
 * Two flows:
 * 1. SEQUENTIAL (current UI): extract → match → finalize
 *    - extractAssembliesFromPDF
 *    - matchMaterialsToDatabase
 *    - mergeTakeoffWithMaterialMatch (code merge when takeoff exists)
 *    - finalizeAssembliesWithTakeoff (AI fallback when no takeoff)
 *
 * 2. UNIFIED (future): single process-pipeline API
 *    - extractAssembliesFromPDF + parseRawTakeoffSheet + finalizeWithUnifiedPrompt
 *    - Uses prompt/prompt.txt for one-shot assembly + takeoff + material matching
 */

export {
  extractAssembliesFromPDF,
  type ExtractionResult,
} from "@/services/openrouter/extractAssemblies";
export {
  matchMaterialsToDatabase,
  type MatchResult,
} from "@/services/openrouter/matchMaterials";
export {
  mergeTakeoffWithMaterialMatch,
  type MaterialMatchInput,
  type FinalOutputResult,
  type ProjectContext,
} from "@/services/finalize/mergeTakeoffWithMaterialMatch";
export { finalizeAssembliesWithTakeoff } from "@/services/openrouter/finalizeAssemblies";
export {
  finalizeWithUnifiedPrompt,
  type UnifiedPromptInput,
  type UnifiedPromptResult,
} from "@/services/openrouter/processWithUnifiedPrompt";
