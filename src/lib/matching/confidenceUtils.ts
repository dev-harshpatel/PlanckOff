export type MatchConfidence = "exact" | "high" | "medium" | "low" | "unmatched";

/** Score thresholds — tune these as scoring engine is calibrated */
const THRESHOLDS = {
  exact:  80,
  high:   50,
  medium: 20,
  low:    1,
} as const;

export function toConfidence(score: number): MatchConfidence {
  if (score >= THRESHOLDS.exact)  return "exact";
  if (score >= THRESHOLDS.high)   return "high";
  if (score >= THRESHOLDS.medium) return "medium";
  if (score >= THRESHOLDS.low)    return "low";
  return "unmatched";
}

/** Returns true if the match should be included in output (any score > 0) */
export function isAcceptable(confidence: MatchConfidence): boolean {
  return confidence !== "unmatched";
}
