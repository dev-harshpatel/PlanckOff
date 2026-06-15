/**
 * Pipeline types (extraction, matching, finalization)
 */

export interface ExtractionResult {
  assemblies: unknown[];
  truncated: boolean;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface MatchResult {
  assemblies: unknown[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface AssemblyMeta {
  fire_rating: string | null;
  stc_rating: string | null;
}

export interface UnifiedPromptInput {
  assemblyJson: unknown;
  takeoffJson: unknown;
  materialDb: unknown;
}

export interface UnifiedPromptResult {
  assemblies: unknown[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
