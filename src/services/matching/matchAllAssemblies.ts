import type { AssemblyData } from '@/types/assembly';
import type { MaterialDatabaseRow, LabourDatabaseRow, AssemblyBunchBranch } from '@/types/databases';
import type { MaterialMatchAssembly } from '@/services/finalize/mergeTakeoffWithMaterialMatch';
import type { MatchServiceInput, MatchServiceOutput, MatchStats } from './types';
import type { DebugMatchItem } from './matchAssemblyMaterials';
import { matchAssemblyMaterials } from './matchAssemblyMaterials';

export interface MatchAllResult extends MatchServiceOutput {
  debugItems: DebugMatchItem[];
}

/**
 * Entry point for the branch-classification matcher.
 *
 * Processes all assemblies from the extraction step and returns
 * MaterialMatchAssembly[] identical in contract to the old AI match output.
 */
export function matchAllAssemblies(
  input: MatchServiceInput,
  materialRows: MaterialDatabaseRow[],
  labourRows: LabourDatabaseRow[],
  bunchBranches: AssemblyBunchBranch[],
): MatchAllResult {
  const resultAssemblies: MaterialMatchAssembly[] = [];
  const allDebugItems: DebugMatchItem[] = [];
  const stats: MatchStats = {
    assembliesProcessed: 0,
    itemsTotal:          0,
    itemsMatched:        0,
    itemsUnmatched:      0,
    itemsLowConfidence:  0, // always 0 in branch classification — no confidence thresholds
  };

  for (const assembly of input.assemblies) {
    const { costingItems, stats: aStats, debugItems } = matchAssemblyMaterials(
      assembly,
      materialRows,
      labourRows,
      bunchBranches,
    );

    stats.assembliesProcessed++;
    stats.itemsTotal    += aStats.itemsTotal;
    stats.itemsMatched  += aStats.itemsMatched;
    stats.itemsUnmatched += aStats.itemsUnmatched;
    allDebugItems.push(...debugItems);

    const matched: MaterialMatchAssembly = {
      assembly_id:      assembly.assembly_id,
      assembly_type:    assembly.assembly_type    ?? null,
      fire_rating:      assembly.fire_rating      ?? null,
      stc_rating:       assembly.stc_rating       ?? null,
      height_ft:        assembly.height_ft,
      height_category:  assembly.height_category,
      total_length:     assembly.total_length,
      ceiling_area:     assembly.ceiling_area     ?? null,
      area_parementer:  assembly.area_parementer  ?? null,
      materials_costing: costingItems,
    };

    resultAssemblies.push(matched);
  }

  return { assemblies: resultAssemblies, stats, debugItems: allDebugItems };
}
