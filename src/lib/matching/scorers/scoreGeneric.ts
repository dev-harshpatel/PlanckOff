import { tokenize, overlapScore } from "../descriptionTokenizer";
import type { MaterialItem, MatchContext } from "./types";
import type { MaterialDefinition } from "@/types";

/**
 * Generic scorer: keyword overlap on raw_text + type vs DB description.
 * Used for low-complexity categories (vapor barriers, plywood, blocking, trim, steel deck).
 */
export function scoreGeneric(extracted: MaterialItem, db: MaterialDefinition, _ctx: MatchContext): number {
  const extTokens = tokenize((extracted.raw_text ?? "") + " " + (extracted.type ?? ""));
  const dbTokens  = tokenize(db.description);
  const overlap   = overlapScore(extTokens, dbTokens);
  return Math.round(overlap * 60);
}
