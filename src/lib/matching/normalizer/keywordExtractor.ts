import { STOPWORDS } from '../constants/stopwords';

/** Splits on whitespace, hyphens, slashes, quotes, parens, commas, plus signs. */
const SPLIT_PATTERN = /[\s\-\/'"()+,@]+/;

/**
 * Extract a de-duped, sorted set of lowercase keyword tokens from one or more text fields.
 *
 * Processing steps:
 * 1. Join all fields as strings (nulls/numbers coerced to string)
 * 2. Split on common delimiters
 * 3. Lowercase and strip non-alphanumeric characters (except . for decimals)
 * 4. Remove stop words and tokens shorter than 2 characters
 * 5. Deduplicate and sort
 *
 * Example:
 *   extractKeywords(['16mm TYPE X GYPSUM WALLBOARD', 'TYPE X', '25ga'])
 *   → ['16mm', '25ga', '5/8', 'gypsum', 'wallboard']
 *   (Note: size tokens like '5/8' are NOT added here — the caller adds them separately
 *    from sizeImperial if needed, to avoid double-processing)
 */
export function extractKeywords(
  fields: (string | number | null | undefined)[],
): string[] {
  const seen = new Set<string>();

  for (const field of fields) {
    if (field == null) continue;
    const text = String(field);

    for (const raw of text.split(SPLIT_PATTERN)) {
      const token = raw.toLowerCase().replace(/[^a-z0-9.]/g, '').trim();
      if (token.length < 2) continue;
      if (STOPWORDS.has(token)) continue;
      seen.add(token);
    }
  }

  return Array.from(seen).sort();
}
