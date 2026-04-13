import { tokenize, overlapScore } from "../descriptionTokenizer";
import type { MaterialItem, MatchContext } from "./types";
import type { MaterialDefinition } from "@/types";

/**
 * Scorer for gypsum_board and gypsum_sheathing.
 * Primary signal: thickness. Secondary: type keywords (Type X, Regular, Shaftliner, etc.)
 * Shaftliner is a hard-exclude — must match exactly.
 */
export function scoreGwb(extracted: MaterialItem, db: MaterialDefinition, _ctx: MatchContext): number {
  let score = 0;

  // ── Shaftliner hard rule: must match both or neither ──────────────────────
  const isShaftliner    = /shaftliner|shaft.liner/i.test(extracted.type ?? "");
  const dbIsShaftliner  = /shaftliner|shaft.liner/i.test(db.description ?? "");
  if (isShaftliner && !dbIsShaftliner) return -999;
  if (!isShaftliner && dbIsShaftliner) return -999;

  // ── Thickness (most important — GWB is identified by thickness) ───────────
  if (extracted.thickness != null && db.size != null) {
    const dbThk = parseFloat(String(db.size));
    if (!isNaN(dbThk)) {
      const extractedInch = toInches(extracted.thickness);
      const diff = Math.abs(extractedInch - dbThk);
      if (diff < 0.005)      score += 60; // exact match (e.g. 0.625 === 0.625)
      else if (diff < 0.0625) score += 30; // within 1/16"
      else if (diff > 0.125)  score -= 40; // wrong thickness — significant penalty
    }
  }

  // ── Type keyword overlap ──────────────────────────────────────────────────
  const extTokens = tokenize(extracted.type);
  const dbTokens  = tokenize(db.description);
  const overlap   = overlapScore(extTokens, dbTokens);
  score += Math.round(overlap * 30);

  return score;
}

/** Convert value to inches — values > 2 are assumed to be mm (typical GWB in inches is ≤ 1.5) */
function toInches(v: number): number {
  return v > 2 ? v / 25.4 : v;
}
