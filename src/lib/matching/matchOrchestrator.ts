/**
 * Main entry point for the code-based matching engine.
 * Replaces matchMaterialsToDatabase() entirely.
 * Input/output shapes are identical to the LLM version.
 */
import type { MaterialDbIndex } from "@/lib/utils/buildMaterialDbIndex";
import { EXTRACT_CATEGORIES } from "@/constants/extractionCategories";
import { CATEGORY_SCORERS, type MaterialItem } from "./scorers/index";
import { toConfidence } from "./confidenceUtils";
import { applyAutoAddRules, type CostingItemIntermediate } from "./autoAddEngine";
import { attachLabor } from "./laborEngine";
import type { AssemblySkeleton } from "@/services/extraction/extractAssemblySkeleton";

interface MatchOrchestratorResult {
  assemblies: unknown[];
  /** Populated when debugMode=true — shows top candidates per item */
  scoredDebug?: unknown[];
}

export function matchAssemblies(
  extractedAssemblies: unknown[],
  dbIndex: MaterialDbIndex,
  options: { debugMode?: boolean; assemblyHeightMap?: Record<string, number> } = {},
): MatchOrchestratorResult {
  const { debugMode = false, assemblyHeightMap = {} } = options;

  const resultAssemblies: unknown[] = [];
  const debugRecords: unknown[]    = [];

  for (const raw of extractedAssemblies) {
    const assembly   = raw as Record<string, unknown>;
    const assemblyId = String(assembly.assembly_id ?? "");
    const fireRating = (assembly.fire_rating as string | null) ?? null;
    const stcRating  = (assembly.stc_rating  as string | null) ?? null;
    // Default to 10ft when no takeoff height available (will be overridden by mergeStep)
    const heightFt   = assemblyHeightMap[assemblyId] ?? 10;
    const materials  = (assembly.materials ?? {}) as Record<string, unknown[]>;

    const ctx = { assemblyHeightFt: heightFt, fireRating };
    const costingItems: CostingItemIntermediate[] = [];
    const debugItems: unknown[]                   = [];

    for (const cat of EXTRACT_CATEGORIES) {
      if (cat === "sealants") continue; // sealants handled exclusively by autoAddEngine

      const scorer      = CATEGORY_SCORERS[cat];
      const dbSlice     = dbIndex.byCategory[cat] ?? [];
      const extracted   = (materials[cat] ?? []) as MaterialItem[];

      for (const extractedItem of extracted) {
        if (!extractedItem.raw_text?.trim()) continue; // skip empty/null items

        const candidates = dbSlice
          .map(db => ({ db, score: scorer(extractedItem, db, ctx) }))
          .filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score);

        const top        = candidates[0];
        const confidence = toConfidence(top?.score ?? 0);

        const matchedMaterials: CostingItemIntermediate["matched_materials"] = top
          ? [{
              code:         top.db.code,
              section:      top.db.section ?? "",
              description:  top.db.description ?? "",
              manufacturer: top.db.manufacturer ?? "",
              unit:         top.db.per ?? "",
              unit_cost:    top.db.matCost ?? 0,
              // Include gauge + width so autoAddEngine can pair tracks to studs
              gauge:        top.db.gauge ?? "",
              width:        top.db.width ?? "",
              _confidence:  confidence,
            }]
          : [];

        costingItems.push({
          extracted_material: extractedItem,
          matched_materials:  matchedMaterials,
          matched_labor:      [],
          _category:          cat,
          _confidence:        confidence,
        });

        if (debugMode) {
          debugItems.push({
            category:      cat,
            extracted:     extractedItem,
            topCandidates: candidates.slice(0, 5).map(c => ({
              code:        c.db.code,
              description: c.db.description,
              score:       c.score,
            })),
            selected:   matchedMaterials[0] ?? null,
            confidence,
          });
        }
      }
    }

    // Auto-add: tracks paired to studs, sealant based on fire rating
    const skeletonStub: AssemblySkeleton = {
      assembly_id:   assemblyId,
      assembly_type: String(assembly.assembly_type ?? ""),
      fire_rating:   fireRating,
      stc_rating:    stcRating,
    };
    const withAutoAdds = applyAutoAddRules(costingItems, skeletonStub, dbIndex);

    // Attach labor entries based on category + height
    const withLabor = attachLabor(withAutoAdds, heightFt, dbIndex.labor);

    // Strip internal _category / _confidence fields before output
    const cleanedCosting = withLabor.map(
      ({ _category: _c, _confidence: _conf, ...item }) => item,
    );

    resultAssemblies.push({
      assembly_id:       assemblyId,
      fire_rating:       fireRating,
      stc_rating:        stcRating,
      materials_costing: cleanedCosting,
    });

    if (debugMode) debugRecords.push({ assembly_id: assemblyId, items: debugItems });
  }

  return {
    assemblies:  resultAssemblies,
    scoredDebug: debugMode ? debugRecords : undefined,
  };
}
