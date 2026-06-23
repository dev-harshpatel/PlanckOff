import type { AssemblyData } from '@/types/assembly';
import type { MaterialMatchAssembly } from '@/services/finalize/mergeTakeoffWithMaterialMatch';

// ─── Service input ─────────────────────────────────────────────────────────────

/** Input to the rule-based match service — mirrors what extraction produces. */
export interface MatchServiceInput {
  assemblies: AssemblyData[];
}

// ─── Service output ────────────────────────────────────────────────────────────

/** Stats collected while running — logged by the route for observability. */
export interface MatchStats {
  assembliesProcessed: number;
  itemsTotal: number;
  itemsMatched: number;
  itemsUnmatched: number;
  /** Items where best match had confidence 'low' — might need review. */
  itemsLowConfidence: number;
}

export interface MatchServiceOutput {
  assemblies: MaterialMatchAssembly[];
  stats: MatchStats;
}

// ─── Per-item match context ────────────────────────────────────────────────────

/**
 * Whether the assembly is a ceiling or wall — drives which labour code to use
 * (ceilingLabourCode vs wallLabourCode on the matched material DB row).
 */
export type AssemblyContext = 'wall' | 'ceiling';

export function resolveAssemblyContext(assemblyType: string | null | undefined): AssemblyContext {
  const t = assemblyType?.toLowerCase() ?? '';
  return t.includes('ceil') || t.includes('soffit') ? 'ceiling' : 'wall';
}
