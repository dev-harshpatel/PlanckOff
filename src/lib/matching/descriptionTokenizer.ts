/**
 * Tokenize a material description string for fuzzy keyword matching.
 * Handles: fraction → decimal, removes punctuation, lowercases.
 *
 * Examples:
 *   '5/8" Type X Gypsum Wallboard' → Set{'0.625', 'type', 'x', 'gypsum', 'wallboard'}
 *   '3-5/8" 20ga Stud @ 16" OC'   → Set{'3.625', '20', 'stud', '16', 'oc'}
 */
export function tokenize(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      // Convert mixed fractions: "3-5/8" → "3.625"
      .replace(/(\d+)-(\d+)\/(\d+)/g, (_, whole, num, den) =>
        (parseInt(whole) + parseInt(num) / parseInt(den)).toFixed(3))
      // Convert plain fractions: "5/8" → "0.625"
      .replace(/(\d+)\/(\d+)/g, (_, num, den) =>
        (parseInt(num) / parseInt(den)).toFixed(3))
      // Remove quote chars and special punctuation
      .replace(/['"\\@#]/g, " ")
      .split(/[\s,.\-_/]+/)
      .map(t => t.trim())
      // Drop empty tokens and very long pure numbers (codes like part numbers)
      .filter(t => t.length > 1 && !/^\d{4,}$/.test(t)),
  );
}

/** Score keyword overlap between two token sets. Returns 0–1. */
export function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let matches = 0;
  for (const token of a) {
    if (b.has(token)) matches++;
  }
  return matches / Math.max(a.size, b.size);
}
