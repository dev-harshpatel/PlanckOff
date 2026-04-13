/**
 * Labor attachment engine.
 * Attaches labor entries from the DB to matched materials based on:
 * - Material category
 * - Assembly height category (< 12ft / 12–24ft / above 24ft)
 * - Material subtype (stud vs furring, batt vs spray, etc.)
 */
import type { MaterialDefinition } from "@/types";
import type { CostingItemIntermediate } from "./autoAddEngine";

/** Mirrors the height category strings in DB labor descriptions */
function getHeightCategory(heightFt: number): string {
  if (heightFt <= 12) return "(Walls < 12 ft)";
  if (heightFt <= 24) return "(High 12 ft to 24 ft)";
  return "(High Above 24 ft)";
}

interface LaborPattern {
  codeKeyword: string;
  heightDependent: boolean;
  condition: (matCode: string, matDesc: string) => boolean;
}

const LABOR_PATTERNS: Record<string, LaborPattern[]> = {
  gypsum_board: [
    { codeKeyword: "HANG",   heightDependent: true,  condition: () => true },
    { codeKeyword: "FINISH", heightDependent: true,  condition: () => true },
  ],
  gypsum_sheathing: [
    { codeKeyword: "SHEATHING", heightDependent: false, condition: () => true },
  ],
  steel_framing: [
    { codeKeyword: "STUDS",   heightDependent: true,  condition: (_c, d) => /stud/i.test(d) && !/track/.test(d) },
    { codeKeyword: "FURRING", heightDependent: true,  condition: (_c, d) => /furring/i.test(d) },
    { codeKeyword: "SHAFT",   heightDependent: true,  condition: (_c, d) => /ch stud|shaftwall/i.test(d) },
  ],
  insulation: [
    { codeKeyword: "BATT",  heightDependent: false, condition: (_c, d) => !/spray|foam/i.test(d) },
    { codeKeyword: "SPRAY", heightDependent: false, condition: (_c, d) => /spray|foam/i.test(d) },
  ],
};

export function attachLabor(
  items: CostingItemIntermediate[],
  assemblyHeightFt: number,
  laborDb: MaterialDefinition[],
): CostingItemIntermediate[] {
  const heightCat = getHeightCategory(assemblyHeightFt);

  return items.map(item => {
    const patterns = LABOR_PATTERNS[item._category] ?? [];
    if (patterns.length === 0) return item;

    const laborItems: unknown[] = [];

    for (const mat of item.matched_materials) {
      for (const pattern of patterns) {
        if (!pattern.condition(mat.code, mat.description ?? "")) continue;

        const laborEntry = laborDb.find(l => {
          const searchText = (l.code + " " + (l.description ?? "")).toUpperCase();
          const hasKeyword = searchText.includes(pattern.codeKeyword.toUpperCase());
          if (!hasKeyword) return false;
          if (pattern.heightDependent) {
            return (l.description ?? "").includes(heightCat);
          }
          return true;
        });

        if (laborEntry) {
          laborItems.push({
            code: laborEntry.code,
            section: laborEntry.section ?? "",
            description: laborEntry.description ?? "",
            unit: laborEntry.per ?? "",
            unit_cost: laborEntry.matCost ?? 0,
            height_ft: assemblyHeightFt,
            height_category: heightCat,
          });
        }
      }
    }

    return { ...item, matched_labor: laborItems };
  });
}
