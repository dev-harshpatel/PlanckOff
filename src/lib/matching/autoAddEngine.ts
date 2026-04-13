/**
 * Auto-add rules engine.
 * Runs after primary scoring. Adds: tracks (paired with matched studs), sealants.
 * All rules are deterministic code — no LLM involved.
 */
import type { MaterialDefinition } from "@/types";
import type { MaterialDbIndex } from "@/lib/utils/buildMaterialDbIndex";
import type { AssemblySkeleton } from "@/services/extraction/extractAssemblySkeleton";

export interface CostingItemIntermediate {
  extracted_material: unknown;
  matched_materials: Array<{
    code: string;
    section: string;
    description: string;
    manufacturer: string;
    unit: string;
    unit_cost: number;
    gauge?: string;
    width?: string;
    [key: string]: unknown;
  }>;
  matched_labor: unknown[];
  _category: string;
  _confidence: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isStud(desc: string): boolean {
  const d = desc.toLowerCase();
  return /\bstud\b|[- ]cs[- ]|ch stud/.test(d) && !/track|rnu|runner/.test(d);
}

function isTrack(desc: string): boolean {
  const d = desc.toLowerCase();
  return /track|runner|rnu/.test(d);
}

function makeAutoAddItem(
  source: unknown,
  db: MaterialDefinition,
  reason: string,
  category: string,
): CostingItemIntermediate {
  return {
    extracted_material: source,
    matched_materials: [{
      code: db.code,
      section: db.section ?? "",
      description: db.description ?? "",
      manufacturer: db.manufacturer ?? "",
      unit: db.per ?? "",
      unit_cost: db.matCost ?? 0,
      _autoAdded: reason,
    }],
    matched_labor: [],
    _category: category,
    _confidence: "auto",
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function applyAutoAddRules(
  items: CostingItemIntermediate[],
  skeleton: AssemblySkeleton,
  dbIndex: MaterialDbIndex,
): CostingItemIntermediate[] {
  const additions: CostingItemIntermediate[] = [];
  const existingCodes = new Set(items.flatMap(i => i.matched_materials.map(m => m.code)));

  // ── Rule 1: For every matched stud → add paired track (same gauge + depth) ─
  for (const item of items) {
    if (item._category !== "steel_framing") continue;
    for (const mat of item.matched_materials) {
      if (!isStud(mat.description)) continue;

      const studGauge = mat.gauge ?? "";
      const studWidth = mat.width ?? "";

      const matchingTrack = dbIndex.byCategory.steel_framing.find(
        db =>
          isTrack(db.description ?? "") &&
          (studGauge ? (db.gauge ?? "") === studGauge : true) &&
          (studWidth ? (db.width ?? "") === studWidth : true),
      );

      if (matchingTrack && !existingCodes.has(matchingTrack.code)) {
        existingCodes.add(matchingTrack.code);
        additions.push(makeAutoAddItem(item.extracted_material, matchingTrack, "auto:track", "steel_framing"));
      }
    }
  }

  // ── Rule 2: One sealant per assembly — type driven by fire_rating ──────────
  const hasFireRating =
    skeleton.fire_rating !== null &&
    skeleton.fire_rating !== undefined &&
    !["na", "n/a", "none", ""].includes((skeleton.fire_rating ?? "").toLowerCase().trim());

  const sealantKeyword = hasFireRating ? "firestop" : "acoustical";
  const sealantEntry = dbIndex.byCategory.sealants.find(
    m => (m.description ?? "").toLowerCase().includes(sealantKeyword),
  );
  if (sealantEntry && !existingCodes.has(sealantEntry.code)) {
    existingCodes.add(sealantEntry.code);
    additions.push(makeAutoAddItem(null, sealantEntry, "auto:sealant", "sealants"));
  }

  return [...items, ...additions];
}
