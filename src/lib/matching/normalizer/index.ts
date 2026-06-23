// Public API — Phase 3 imports from here
export { normalizeMaterialItem } from './normalizeMaterial';

// Individual helpers — exported for Phase 3 scorer and unit tests
export { extractMeasurement } from './measurementNormalizer';
export { normalizeBoardType } from './boardTypeNormalizer';
export { mapGroupToCategory, mapTextToCategory } from './categoryMapper';
export { normalizeGauge } from './gaugeNormalizer';
export { extractSpacing } from './spacingNormalizer';
export { extractKeywords } from './keywordExtractor';
