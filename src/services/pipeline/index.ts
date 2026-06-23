/**
 * Pipeline Services — Sequential flow: extract → match → finalize
 */

export {
  extractAssembliesFromPDF,
  type ExtractionResult,
} from "@/services/openrouter/extractAssemblies";
export {
  mergeTakeoffWithMaterialMatch,
  type MaterialMatchInput,
  type FinalOutputResult,
  type ProjectContext,
} from "@/services/finalize/mergeTakeoffWithMaterialMatch";
export { finalizeAssembliesWithTakeoff } from "@/services/openrouter/finalizeAssemblies";
