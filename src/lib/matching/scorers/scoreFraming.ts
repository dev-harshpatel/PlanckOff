import { tokenize, overlapScore } from "../descriptionTokenizer";
import { getDefaultGaugeForHeight } from "@/constants/extractionCategories";
import type { MaterialItem, MatchContext } from "./types";
import type { MaterialDefinition } from "@/types";

const STUD_KEYWORDS  = ["stud", " cs ", "c-stud", "ch stud", "chstud", "furring"];
const TRACK_KEYWORDS = ["track", "runner", "rnu", "c-track", "angle"];

function isStudType(s: string):  boolean { return STUD_KEYWORDS.some(k  => s.toLowerCase().includes(k)); }
function isTrackType(s: string): boolean { return TRACK_KEYWORDS.some(k => s.toLowerCase().includes(k)); }

/**
 * Scorer for steel_framing.
 * Stud vs Track is a hard-exclude — can never cross-match.
 * Depth mismatch is also a hard-exclude — wrong depth = completely wrong product.
 * Gauge: use extracted gauge if present, otherwise infer from assembly height.
 */
export function scoreFraming(extracted: MaterialItem, db: MaterialDefinition, ctx: MatchContext): number {
  let score = 0;
  const dbDesc = db.description ?? "";

  // ── Stud vs Track — hard exclude if type does not match ──────────────────
  const extIsStud  = isStudType(extracted.type  ?? "");
  const extIsTrack = isTrackType(extracted.type ?? "");
  const dbIsStud   = isStudType(dbDesc);
  const dbIsTrack  = isTrackType(dbDesc);
  if (extIsStud  && dbIsTrack) return -999;
  if (extIsTrack && dbIsStud)  return -999;

  // ── Depth (most structurally significant dimension) ───────────────────────
  if (extracted.depth != null && db.width != null) {
    const dbDepth  = parseFloat(String(db.width));
    if (!isNaN(dbDepth)) {
      // Convert mm → inches if value > 10 (heuristic: typical framing depths in inches are ≤ 10)
      const extDepth = extracted.depth > 10 ? extracted.depth / 25.4 : extracted.depth;
      const diff = Math.abs(extDepth - dbDepth);
      if (diff < 0.005)       score += 60;
      else if (diff < 0.0625) score += 20;
      else                    return -999; // wrong depth = completely wrong product
    }
  }

  // ── Gauge — use extracted if provided, otherwise derive from assembly height ─
  const targetGauge = (extracted.gauge?.replace(/[^0-9]/g, "") ?? "") ||
                      getDefaultGaugeForHeight(ctx.assemblyHeightFt);
  if (db.gauge) {
    const dbGauge = db.gauge.replace(/[^0-9]/g, "");
    if (dbGauge === targetGauge) score += 40;
    else                         score -= 15;
  }

  // ── Spacing (studs only) ──────────────────────────────────────────────────
  if (extIsStud && extracted.spacing != null && db.size != null) {
    const dbSpacing = parseInt(String(db.size), 10);
    if (!isNaN(dbSpacing) && extracted.spacing === dbSpacing) score += 20;
  }

  // ── CH stud / furring type specificity ───────────────────────────────────
  const extType = (extracted.type ?? "").toLowerCase();
  if (extType.includes("ch") && !dbDesc.toLowerCase().includes("ch"))       score -= 25;
  if (extType.includes("furring") && !dbDesc.toLowerCase().includes("furring")) score -= 25;

  // ── General description overlap for remaining differentiation ────────────
  const extTokens = tokenize(extracted.raw_text);
  const dbTokens  = tokenize(dbDesc);
  score += Math.round(overlapScore(extTokens, dbTokens) * 10);

  return score;
}
