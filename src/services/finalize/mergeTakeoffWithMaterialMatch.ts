/**
 * Code-only finalize: merge material match + takeoff by deterministic rules.
 * No AI calls. Produces final_output shape identical to AI finalize.
 */

import type {
  MaterialItem,
  MaterialsCostingItem,
  MatchedLabor,
  MatchedMaterial,
} from "@/types/assembly";
import type { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";

/** Material match assembly (from match step) — has assembly_id and materials_costing; may have extra fields */
export interface MaterialMatchAssembly {
  assembly_id: string;
  materials_costing: MaterialsCostingItem[];
  assembly_type?: string | null;
  fire_rating?: string | null;
  framing_category?: string | null;
  project_country?: string | null;
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
  project_country?: string | null;
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

// ─── Height Categories ─────────────────────────────────────────────────────────

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

// ─── Height Segmentation ───────────────────────────────────────────────────────

interface HeightSegment {
  height_ft: number;
  category: string;
}

/**
 * Split wall height H (ft) into labor segments per business rules:
 *   H ≤ 12      → 1 segment: H @ "(Walls < 12 ft)"
 *   12 < H ≤ 24 → 2 segments: 12 + (H-12)
 *   H > 24      → 3 segments: 12 + 12 + (H-24)
 */
const getHeightSegments = (H: number): HeightSegment[] => {
  if (H <= 12) {
    return [{ height_ft: H, category: "(Walls < 12 ft)" }];
  } else if (H <= 24) {
    return [
      { height_ft: 12, category: "(Walls < 12 ft)" },
      { height_ft: H - 12, category: "(High 12 ft to 24 ft)" },
    ];
  } else {
    return [
      { height_ft: 12, category: "(Walls < 12 ft)" },
      { height_ft: 12, category: "(High 12 ft to 24 ft)" },
      { height_ft: H - 24, category: "(High Above 24 ft)" },
    ];
  }
};

/** Keywords in DB labor descriptions that identify each height segment */
const SEGMENT_KEYWORDS: Record<string, string> = {
  "(Walls < 12 ft)": "< 12ft",
  "(High 12 ft to 24 ft)": "12ft to 24",
  "(High Above 24 ft)": "> 24",
};

const matchesSegment = (description: string | undefined, category: string): boolean => {
  if (!description) return false;
  const keyword = SEGMENT_KEYWORDS[category];
  return !!keyword && description.includes(keyword);
};

/**
 * A labor item is height-segmentable if its description contains "< 12ft"
 * (meaning the DB has height variants for it).
 */
const isHeightSegmentedLabor = (description: string | undefined): boolean =>
  !!description && description.includes("< 12ft");

// ─── Material DB Index ─────────────────────────────────────────────────────────

interface DbLaborEntry {
  code: string;
  laborCostCode: string;
  description: string;
  section: string;
  per: string;
  matCost: string | number;
  category: string;
}

interface LaborIndex {
  byCode: Map<string, DbLaborEntry>;
  byLaborCostCode: Map<string, DbLaborEntry[]>;
}

const buildLaborIndex = (db: unknown[]): LaborIndex => {
  const byCode = new Map<string, DbLaborEntry>();
  const byLaborCostCode = new Map<string, DbLaborEntry[]>();

  for (const entry of db) {
    const e = entry as Record<string, unknown>;
    if (e.category !== "Labor") continue;
    const row: DbLaborEntry = {
      code: String(e.code ?? ""),
      laborCostCode: String(e.laborCostCode ?? ""),
      description: String(e.description ?? ""),
      section: String(e.section ?? ""),
      per: String(e.per ?? ""),
      matCost: e.matCost as string | number,
      category: "Labor",
    };
    byCode.set(row.code, row);
    const siblings = byLaborCostCode.get(row.laborCostCode) ?? [];
    siblings.push(row);
    byLaborCostCode.set(row.laborCostCode, siblings);
  }

  return { byCode, byLaborCostCode };
};

/**
 * Expand a single matched_labor entry into one entry per height segment.
 * If the labor is not height-segmentable, returns it unchanged (single entry).
 */
const expandLaborForHeight = (
  labor: MatchedLabor,
  segments: HeightSegment[],
  laborIndex: LaborIndex,
): MatchedLabor[] => {
  // Not height-based labor OR only one segment → keep as-is
  if (!isHeightSegmentedLabor(labor.description) || segments.length === 1) {
    return [
      {
        ...labor,
        height_ft: segments[0].height_ft,
        height_category: segments[0].category,
      },
    ];
  }

  // Look up the DB entry to get laborCostCode
  const dbEntry = laborIndex.byCode.get(labor.code);
  if (!dbEntry) {
    // Not in DB — can't find variants, return with first segment info
    return [
      {
        ...labor,
        height_ft: segments[0].height_ft,
        height_category: segments[0].category,
      },
    ];
  }

  const variants = laborIndex.byLaborCostCode.get(dbEntry.laborCostCode) ?? [];

  return segments.map((segment) => {
    const variant = variants.find((v) =>
      matchesSegment(v.description, segment.category),
    );
    if (variant) {
      return {
        code: variant.code,
        section: variant.section,
        description: variant.description,
        unit: variant.per,
        unit_cost:
          typeof variant.matCost === "string"
            ? parseFloat(variant.matCost)
            : variant.matCost,
        height_ft: segment.height_ft,
        height_category: segment.category,
      };
    }
    // No variant found for segment — fall back to original code with segment tags
    return {
      ...labor,
      height_ft: segment.height_ft,
      height_category: segment.category,
    };
  });
};

// ─── Steel Framing Gauge Filter ────────────────────────────────────────────────

/**
 * Extracts the mil (thousandths of an inch) value from a material code.
 * e.g. "ST-358-18" → 18, "TR-358-43" → 43, "DLT-358-33" → 33
 */
const getMilFromCode = (code: string): number | null => {
  const m = code.match(/-(\d{2,3})$/);
  return m ? parseInt(m[1], 10) : null;
};

/**
 * Returns the target mil value for a given wall height using USA ASTM C645/C955 defaults.
 * ≤ 12 ft → 25ga (18mil), 12–20 ft → 20ga (30mil), > 20 ft → 18ga (43mil)
 */
const getTargetMilForHeight = (heightFt: number): number => {
  if (heightFt <= 12) return 18;
  if (heightFt <= 20) return 30;
  return 43;
};

const STUD_CODE_RE = /^ST-/i;
const STD_TRACK_CODE_RE = /^TR-/i;
const SPECIAL_TRACK_CODE_RE = /^(DLT|SLT)-/i;
const FRAMING_SCREW_CODE_RE = /^SC-FRM/i;
const STEEL_FRAMING_TEXT_RE = /STUD|FURRING|TRACK|METAL STUD/i;

/** Given a list of same-category framing items, keep only the one closest to targetMil. */
const selectBestGauge = <T extends { code: string }>(
  items: T[],
  targetMil: number,
): T[] => {
  if (items.length <= 1) return items;
  const withMil = items.map((item) => ({
    item,
    mil: getMilFromCode(item.code),
  }));
  const exact = withMil.find((x) => x.mil === targetMil);
  if (exact) return [exact.item];
  // Closest mil >= target (next heavier gauge up)
  const above = withMil
    .filter((x) => x.mil != null && x.mil >= targetMil)
    .sort((a, b) => (a.mil ?? 999) - (b.mil ?? 999));
  if (above.length > 0) return [above[0].item];
  // Fallback: lightest available
  const sorted = withMil
    .filter((x) => x.mil != null)
    .sort((a, b) => (a.mil ?? 999) - (b.mil ?? 999));
  return sorted.length > 0 ? [sorted[0].item] : [items[0]];
};

/**
 * For steel framing matched_materials: keep exactly one stud, one standard track,
 * at most one special track (DLT/SLT), and all framing screws.
 * Gauge selection is based on wall height.
 */
const filterSteelFramingGauges = <T extends { code: string }>(
  materials: T[],
  heightFt: number,
): T[] => {
  const targetMil = getTargetMilForHeight(heightFt);
  const studs = materials.filter((m) => STUD_CODE_RE.test(m.code));
  const stdTracks = materials.filter((m) => STD_TRACK_CODE_RE.test(m.code));
  const specialTracks = materials.filter((m) =>
    SPECIAL_TRACK_CODE_RE.test(m.code),
  );
  const screws = materials.filter((m) => FRAMING_SCREW_CODE_RE.test(m.code));
  const other = materials.filter(
    (m) =>
      !STUD_CODE_RE.test(m.code) &&
      !STD_TRACK_CODE_RE.test(m.code) &&
      !SPECIAL_TRACK_CODE_RE.test(m.code) &&
      !FRAMING_SCREW_CODE_RE.test(m.code),
  );
  return [
    ...selectBestGauge(studs, targetMil),
    ...selectBestGauge(stdTracks, targetMil),
    ...selectBestGauge(specialTracks, targetMil),
    ...screws,
    ...other,
  ];
};

// ─── Takeoff Helpers ───────────────────────────────────────────────────────────

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

const isCeilingRow = (
  assemblyType: string | number | null | undefined,
): boolean =>
  String(assemblyType ?? "")
    .toLowerCase()
    .includes("ceiling");

/** Group takeoff rows by (wall_type, height) and sum quantities */
const aggregateTakeoff = (
  rows: TakeoffRawRecord[],
): AggregatedTakeoffGroup[] => {
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
        assembly_type:
          row.assembly_type != null ? String(row.assembly_type) : "wall",
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

// ─── Enrich Materials Costing ──────────────────────────────────────────────────

/**
 * Deep clone materials_costing, enrich extracted_material with takeoff fields,
 * and apply height segmentation to labor (walls only).
 */
const enrichMaterialsCosting = (
  materialsCosting: MaterialsCostingItem[],
  takeoff: AggregatedTakeoffGroup,
  laborIndex: LaborIndex,
): MaterialsCostingItem[] => {
  const items = Array.isArray(materialsCosting) ? materialsCosting : [];
  const segments = takeoff.is_ceiling
    ? []
    : getHeightSegments(takeoff.height_ft);

  return items.map((item) => {
    const ext = item.extracted_material;
    if (!ext) return item; // AI occasionally returns null extracted_material — skip enrichment

    const enriched: MaterialItem = {
      ...ext,
      area_parementer: takeoff.is_ceiling ? takeoff.area_parementer : null,
      ceiling_area: takeoff.is_ceiling ? takeoff.ceiling_area : null,
      height_category: takeoff.is_ceiling ? undefined : takeoff.height_category,
      height_ft: takeoff.is_ceiling ? undefined : takeoff.height_ft,
      total_length: takeoff.is_ceiling ? undefined : takeoff.total_length,
    };

    // Expand labor for height segments (walls only)
    const matchedLabor = Array.isArray(item.matched_labor)
      ? (item.matched_labor as MatchedLabor[]).map((labor) => ({ ...labor }))
      : [];
    let expandedLabor: MatchedLabor[];
    if (takeoff.is_ceiling || segments.length === 0) {
      expandedLabor = [...(matchedLabor as MatchedLabor[])];
    } else {
      expandedLabor = (matchedLabor as MatchedLabor[]).flatMap((labor) =>
        expandLaborForHeight(labor, segments, laborIndex),
      );
    }

    // Apply gauge filtering for steel framing items (walls only) so that stale
    // match data with multiple gauge variants is reduced to one stud + one track.
    const rawMatchedMaterials = Array.isArray(item.matched_materials)
      ? (item.matched_materials as MatchedMaterial[]).map((m) => ({ ...m }))
      : [];
    const isSteelFraming =
      !takeoff.is_ceiling &&
      STEEL_FRAMING_TEXT_RE.test(ext.raw_text ?? "") &&
      rawMatchedMaterials.some(
        (m) => STUD_CODE_RE.test(m.code) || STD_TRACK_CODE_RE.test(m.code),
      );
    const filteredMaterials = isSteelFraming
      ? filterSteelFramingGauges(rawMatchedMaterials, takeoff.height_ft)
      : rawMatchedMaterials;

    return {
      extracted_material: enriched,
      matched_materials: filteredMaterials,
      matched_labor: expandedLabor,
    };
  });
};

// ─── Public Interface ──────────────────────────────────────────────────────────

export interface ProjectContext {
  country?: string | null;
  province?: string | null;
  location?: string | null;
}

/**
 * Merge material match with takeoff rows using deterministic rules.
 * Match: takeoff.wall_type === assembly.assembly_id.
 * Aggregate: one output assembly per (assembly_id, height) with summed quantities.
 * Height segmentation: labor entries are expanded into per-segment entries (walls only).
 * Output shape matches final_output JSON for downstream (assembly-data, project page).
 */
export const mergeTakeoffWithMaterialMatch = (
  materialMatch: MaterialMatchInput,
  takeoffRows: TakeoffRawRecord[],
  projectContext?: ProjectContext,
  materialDb?: unknown[],
): FinalOutputResult => {
  const laborIndex = buildLaborIndex(materialDb ?? []);

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
        project_country: projectContext?.country ?? null,
        project_location: projectContext?.location ?? null,
        project_province: projectContext?.province ?? null,
        review_notes: "Assembly not found in material match",
        selected_gauge: null,
        stc_rating: null,
        status: "REVIEW REQUIRED",
        total_length: group.total_length,
      });
      continue;
    }

    // Match step may return "materials" or "materials_costing" (AI sometimes uses "materials")
    const matchAny = match as { materials_costing?: MaterialsCostingItem[]; materials?: MaterialsCostingItem[] };
    const rawMaterialsCosting = matchAny.materials_costing ?? matchAny.materials ?? [];
    const materials_costing = enrichMaterialsCosting(
      Array.isArray(rawMaterialsCosting) ? rawMaterialsCosting : [],
      group,
      laborIndex,
    );
    const assembly_type = group.assembly_type ? String(group.assembly_type) : "wall";

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
      project_country: projectContext?.country ?? match.project_country ?? null,
      project_location:
        projectContext?.location ?? match.project_location ?? null,
      project_province:
        projectContext?.province ?? match.project_province ?? null,
      review_notes: null,
      selected_gauge: match.selected_gauge ?? null,
      stc_rating: match.stc_rating ?? null,
      status: "OK",
      total_length: group.total_length,
    });
  }

  return { assemblies };
};
