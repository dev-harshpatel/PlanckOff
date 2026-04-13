/**
 * Merge extraction skeleton + category chunk results into a single AssemblyData[].
 * The output shape is identical to what extractAssembliesFromPDF() produces today.
 */
import type { AssemblySkeleton } from "./extractAssemblySkeleton";
import type { CategoryChunkResult } from "./extractCategoryChunk";
import { CHUNK_CATEGORY_MAP, EXTRACT_CATEGORIES, type ExtractCategory } from "@/constants/extractionCategories";

function buildEmptyMaterials(): Record<ExtractCategory, unknown[]> {
  const materials = {} as Record<ExtractCategory, unknown[]>;
  for (const c of EXTRACT_CATEGORIES) {
    materials[c] = [];
  }
  return materials;
}

export function mergeExtractionChunks(
  skeleton: AssemblySkeleton[],
  chunks: Record<string, CategoryChunkResult[]>,
): unknown[] {
  return skeleton.map((skel) => {
    const materials = buildEmptyMaterials();

    for (const [chunkId, chunkResults] of Object.entries(chunks)) {
      const chunkAssembly = chunkResults.find(r => r.assembly_id === skel.assembly_id);
      if (!chunkAssembly) continue;

      const ownedCategories = CHUNK_CATEGORY_MAP[chunkId] ?? [];
      for (const cat of ownedCategories) {
        const items = chunkAssembly[cat];
        if (Array.isArray(items)) {
          materials[cat] = items.filter(
            // Drop items with null/empty raw_text — same pre-filter as current matchMaterials.ts
            (item: unknown) => {
              const i = item as Record<string, unknown>;
              return i.raw_text != null && String(i.raw_text).trim() !== "";
            },
          );
        }
      }
    }

    return {
      assembly_id: skel.assembly_id,
      assembly_type: skel.assembly_type,
      fire_rating: skel.fire_rating,
      stc_rating: skel.stc_rating,
      materials,
    };
  });
}
