/**
 * Stop words removed during keyword extraction.
 * Extends the set from scripts/parseMaterialDatabase.ts with matching-specific terms.
 */
export const STOPWORDS = new Set<string>([
  // Common English
  'of', 'the', 'and', 'at', 'for', 'with', 'to', 'in', 'a', 'an',
  'or', 'by', 'per', 'from', 'on', 'is', 'n/a', '',
  // Units and measurement words (keep the number, drop the unit label)
  'mm', 'ft', 'inch', 'inches', 'feet',
  // Common filler tokens in material descriptions
  'x', 'type', 'gauge', 'layer', 'layers', 'oc', 'center',
  'nominal', 'approx', 'approximately', 'ga', 'lb', 'lbs',
  // Punctuation artifacts
  "'", '"', '-', '/',
]);
