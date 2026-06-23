import type { MaterialItem } from '@/types/assembly';
import type { MaterialGroup, NormalizedMaterial } from '../types';
import { extractMeasurement } from './measurementNormalizer';
import { normalizeBoardType } from './boardTypeNormalizer';
import { mapGroupToCategory } from './categoryMapper';
import { normalizeGauge } from './gaugeNormalizer';
import { extractSpacing } from './spacingNormalizer';
import { extractKeywords } from './keywordExtractor';

/**
 * Master normalization function for Phase 2.
 *
 * Takes a raw MaterialItem from the PDF extraction step and the group key it
 * belongs to (e.g. 'gypsum_board', 'steel_framing') and returns a fully
 * structured NormalizedMaterial ready for Phase 3 scoring.
 *
 * Each sub-field is delegated to a single-responsibility sub-normalizer:
 *   - size/thickness → measurementNormalizer
 *   - board type     → boardTypeNormalizer
 *   - category       → categoryMapper
 *   - gauge          → gaugeNormalizer
 *   - spacing        → spacingNormalizer
 *   - keywords       → keywordExtractor
 *
 * Source: Phase 2 rule-based matching plan (REFACTOR_MATCH_PLAN.md)
 */
export function normalizeMaterialItem(
  item: MaterialItem,
  group: MaterialGroup,
): NormalizedMaterial {
  const rawDescription = item.raw_text ?? item.description ?? '';

  const { sizeMM, sizeImperial } = extractMeasurement(item);
  const spacing = extractSpacing(item.spacing);

  // selected_gauge (set by AI finalize step) takes priority over gauge
  const gaugeSrc = item.selected_gauge ?? item.gauge ?? null;

  // Include sizeImperial as a keyword so the scorer can match '5/8"' in DB searchKeywords
  const keywords = extractKeywords([
    rawDescription,
    item.description,
    item.type,
    gaugeSrc,
    item.size,
    sizeImperial,
  ]);

  return {
    sizeImperial,
    sizeMM,
    boardType: normalizeBoardType(item.type),
    category: mapGroupToCategory(group),
    layerCount: typeof item.layers === 'number' ? Math.max(1, item.layers) : 1,
    gauge: normalizeGauge(gaugeSrc),
    spacingMM: spacing.spacingMM,
    spacingImperial: spacing.spacingImperial,
    keywords,
    rawDescription,
  };
}
