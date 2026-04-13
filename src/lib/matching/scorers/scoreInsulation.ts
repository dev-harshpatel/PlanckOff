import { CAVITY_DEPTH_TO_RVALUE } from "@/constants/extractionCategories";
import type { MaterialItem, MatchContext } from "./types";
import type { MaterialDefinition } from "@/types";

function parseRValue(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/R[-\s]?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function inferSubtype(text: string): string | null {
  const t = text.toLowerCase();
  if (/spray|foam/i.test(t))            return "spray";
  if (/semi.?rigid|mineral|rock/i.test(t)) return "semi_rigid";
  if (/batt|sound batt/i.test(t))       return "batt";
  return null;
}

/**
 * Scorer for insulation.
 * Subtype (batt / semi-rigid / spray) is a hard-exclude if both sides have a detectable type.
 * R-value is the primary numeric signal; depth is secondary.
 */
export function scoreInsulation(extracted: MaterialItem, db: MaterialDefinition, _ctx: MatchContext): number {
  let score = 0;
  const dbDesc = db.description ?? "";

  // ── Subtype — hard exclude if both sides have a detectable type and they differ ─
  const extSubtype = inferSubtype((extracted.type ?? "") + " " + (extracted.raw_text ?? ""));
  const dbSubtype  = inferSubtype(dbDesc);
  if (extSubtype && dbSubtype && extSubtype !== dbSubtype) return -999;

  // ── R-value (primary signal) ──────────────────────────────────────────────
  let extractedR = parseRValue(extracted.r_value);

  // If no explicit R-value, infer from cavity depth
  if (extractedR === null && extracted.depth != null) {
    const depthIn = extracted.depth > 10 ? extracted.depth / 25.4 : extracted.depth;
    const matched = CAVITY_DEPTH_TO_RVALUE.find(r => Math.abs(r.depthIn - depthIn) < 0.25);
    extractedR = matched?.rValue ?? null;
  }

  const dbR = parseRValue(dbDesc);
  if (extractedR !== null && dbR !== null) {
    if (extractedR === dbR)                   score += 60;
    else if (Math.abs(extractedR - dbR) <= 2) score += 20; // close — could be rounding
    else                                       score -= 40; // clearly wrong R-value
  }

  // ── Depth (secondary signal — confirms cavity size) ───────────────────────
  if (extracted.depth != null && db.width != null) {
    const dbDepth = parseFloat(String(db.width));
    if (!isNaN(dbDepth)) {
      const extDepth = extracted.depth > 10 ? extracted.depth / 25.4 : extracted.depth;
      if (Math.abs(extDepth - dbDepth) < 0.25) score += 20;
    }
  }

  return score;
}
