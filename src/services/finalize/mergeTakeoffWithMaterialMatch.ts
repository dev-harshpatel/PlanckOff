/**
 * Code-only finalize: merge material match + takeoff by deterministic rules.
 * No AI calls. Produces final_output shape identical to AI finalize.
 */

import type {
  MaterialItem,
  MaterialsCostingItem,
  MatchedLabor,
  MatchedMaterial,
} from "@/types/assemblyData";
import type { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";

/** Material match assembly (from match step) — has assembly_id and materials_costing; may have extra fields */
export interface MaterialMatchAssembly {
  assembly_id: string;
  materials_costing: MaterialsCostingItem[];
  assembly_type?: string | null;
  fire_rating?: string | null;
  framing_category?: string | null;
  project_location?: string | null;
  project_province?: string | null;
  selected_gauge?: string | null;
  stc_rating?: string | null;
  [key: string]: unknown;
}

export interface MaterialMatchInput {
  assemblies: MaterialMatchAssembly[];
}

/** One aggregated takeoff group: same wall_type + height, with summed quantities */
interface AggregatedTakeoffGroup {
  assembly_id: string;
  assembly_type: string;
  height_ft: number;
  height_category: string;
  total_length: number;
  ceiling_area: number;
  area_parementer: number;
  is_ceiling: boolean;
  levels: string[];
}

/** Final output assembly — same shape as saved final_output JSON */
export interface FinalOutputAssembly {
  assembly_id: string;
  assembly_type: string;
  ceiling_area: number | null;
  area_parementer: number | null;
  fire_rating?: string | null;
  framing_category?: string | null;
  height_category: string;
  height_ft: number;
  level?: string;
  materials_costing: MaterialsCostingItem[];
  project_location?: string | null;
  project_province?: string | null;
  review_notes: string | null;
  selected_gauge?: string | null;
  stc_rating?: string | null;
  status: string;
  total_length: number;
}

export interface FinalOutputResult {
  assemblies: FinalOutputAssembly[];
}

const HEIGHT_CATEGORIES: Array<{ max: number; label: string }> = [
  { max: 10, label: "up to 10'" },
  { max: 12, label: "10' to 12'" },
  { max: 15, label: "12' to 15'" },
  { max: 20, label: "15' to 20'" },
  { max: Number.POSITIVE_INFINITY, label: "20' and above" },
];

const getHeightCategory = (heightFt: number): string => {
  for (const { max, label } of HEIGHT_CATEGORIES) {
    if (heightFt < max) return label;
  }
  return HEIGHT_CATEGORIES[HEIGHT_CATEGORIES.length - 1].label;
};

const parseHeight = (h: string | number | null | undefined): number => {
  if (h == null) return 0;
  if (typeof h === "number" && !Number.isNaN(h)) return h;
  const n = parseFloat(String(h).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

const toNumber = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

const isCeilingRow = (assemblyType: string | number | null | undefined): boolean =>
  String(assemblyType ?? "").toLowerCase().includes("ceiling");

/** Group takeoff rows by (wall_type, height) and sum quantities */
const aggregateTakeoff = (rows: TakeoffRawRecord[]): AggregatedTakeoffGroup[] => {
  const keyToGroup = new Map<
    string,
    {
      assembly_id: string;
      assembly_type: string;
      height_ft: number;
      total_length: number;
      ceiling_area: number;
      area_parementer: number;
      is_ceiling: boolean;
      levels: string[];
    }
  >();

  for (const row of rows) {
    const wallType = row.wall_type;
    if (wallType == null || String(wallType).trim() === "") continue;

    const assemblyId = String(wallType).trim();
    const heightFt = parseHeight(row.height);
    const isCeiling = isCeilingRow(row.assembly_type);
    const key = `${assemblyId}|${heightFt}`;

    const wallLength = isCeiling ? 0 : toNumber(row.wall_length);
    const ceilingArea = isCeiling ? toNumber(row.ceiling_area) : 0;
    const areaParementer = toNumber(row.area_parementer);

    const levelStr = row.level != null ? String(row.level).trim() : "";
    const existing = keyToGroup.get(key);
    if (existing) {
      existing.total_length += wallLength;
      existing.ceiling_area += ceilingArea;
      existing.area_parementer += areaParementer;
      if (levelStr && !existing.levels.includes(levelStr)) {
        existing.levels.push(levelStr);
      }
    } else {
      keyToGroup.set(key, {
        assembly_id: assemblyId,
        assembly_type: row.assembly_type != null ? String(row.assembly_type) : "wall",
        height_ft: heightFt,
        total_length: wallLength,
        ceiling_area: ceilingArea,
        area_parementer: areaParementer,
        is_ceiling: isCeiling,
        levels: levelStr ? [levelStr] : [],
      });
    }
  }

  return Array.from(keyToGroup.values()).map((g) => ({
    ...g,
    height_category: getHeightCategory(g.height_ft),
  }));
};

/** Deep clone materials_costing and enrich extracted_material with takeoff fields */
const enrichMaterialsCosting = (
  materialsCosting: MaterialsCostingItem[],
  takeoff: AggregatedTakeoffGroup,
): MaterialsCostingItem[] => {
  return materialsCosting.map((item) => {
    const ext = item.extracted_material;
    const enriched: MaterialItem = {
      ...ext,
      area_parementer: takeoff.is_ceiling ? takeoff.area_parementer : null,
      ceiling_area: takeoff.is_ceiling ? takeoff.ceiling_area : null,
      height_category: takeoff.is_ceiling ? undefined : takeoff.height_category,
      height_ft: takeoff.is_ceiling ? undefined : takeoff.height_ft,
      total_length: takeoff.is_ceiling ? undefined : takeoff.total_length,
    };
    return {
      extracted_material: enriched,
      matched_materials: [...(item.matched_materials as MatchedMaterial[])],
      matched_labor: [...(item.matched_labor as MatchedLabor[])],
    };
  });
};

/**
 * Merge material match with takeoff rows using deterministic rules.
 * Match: takeoff.wall_type === assembly.assembly_id.
 * Aggregate: one output assembly per (assembly_id, height) with summed quantities.
 * Output shape matches final_output JSON for downstream (assembly-data, project page).
 */
export const mergeTakeoffWithMaterialMatch = (
  materialMatch: MaterialMatchInput,
  takeoffRows: TakeoffRawRecord[],
): FinalOutputResult => {
  const matchById = new Map<string, MaterialMatchAssembly>();
  for (const a of materialMatch.assemblies) {
    if (a.assembly_id) matchById.set(String(a.assembly_id).trim(), a);
  }

  const groups = aggregateTakeoff(takeoffRows);
  const assemblies: FinalOutputAssembly[] = [];

  for (const group of groups) {
    const match = matchById.get(group.assembly_id);
    const level = group.levels.join(", ");

    if (!match) {
      assemblies.push({
        assembly_id: group.assembly_id,
        assembly_type: group.assembly_type,
        ceiling_area: group.is_ceiling ? group.ceiling_area : null,
        area_parementer: group.is_ceiling ? group.area_parementer : null,
        fire_rating: null,
        framing_category: null,
        height_category: group.height_category,
        height_ft: group.height_ft,
        level,
        materials_costing: [],
        project_location: null,
        project_province: null,
        review_notes: "Assembly not found in material match",
        selected_gauge: null,
        stc_rating: null,
        status: "REVIEW REQUIRED",
        total_length: group.total_length,
      });
      continue;
    }

    const materials_costing = enrichMaterialsCosting(match.materials_costing, group);
    const assembly_type =
      group.assembly_type && String(group.assembly_type).toLowerCase() === "ceiling"
        ? "ceiling"
        : "wall";

    assemblies.push({
      assembly_id: match.assembly_id,
      assembly_type: assembly_type,
      ceiling_area: group.is_ceiling ? group.ceiling_area : null,
      area_parementer: group.is_ceiling ? group.area_parementer : null,
      fire_rating: match.fire_rating ?? null,
      framing_category: match.framing_category ?? null,
      height_category: group.height_category,
      height_ft: group.height_ft,
      level,
      materials_costing,
      project_location: match.project_location ?? null,
      project_province: match.project_province ?? null,
      review_notes: null,
      selected_gauge: match.selected_gauge ?? null,
      stc_rating: match.stc_rating ?? null,
      status: "OK",
      total_length: group.total_length,
    });
  }

  return { assemblies };
};
