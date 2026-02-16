/**
 * Raw takeoff Excel parser - matches scripts/excel_to_json.py output
 * No aggregation; one JSON record per row
 */

import * as XLSX from "xlsx";

export interface TakeoffRawRecord {
  assembly_type: string | number | null;
  ceiling_area?: number;
  height: number | string | null;
  level: string | number | null;
  no?: number | string | null;
  unit?: string | number | null;
  unit_1?: string | number | null;
  uom3?: string | number | null;
  wall_length?: number;
  wall_type: string | number | null;
  area_parementer?: number | string | null;
  qty_3?: number | string | null;
}

const cleanValue = (val: unknown): string | number | null => {
  if (val === null || val === undefined || (typeof val === "string" && val.trim() === ""))
    return null;
  if (typeof val === "number") {
    return Number.isInteger(val) ? val : val;
  }
  if (typeof val === "string") return val.trim();
  return String(val).trim();
};

const getValueKeyForAssemblyType = (assemblyType: string | null): string => {
  if (!assemblyType) return "wall_length";
  const at = String(assemblyType).trim();
  if (at === "Ceiling") return "ceiling_area";
  if (at === "Access Panel Install") return "access_panel";
  if (at === "HM Frame Install") return "hm_frame";
  return "wall_length";
};

const findColumnIndex = (headers: string[], patterns: string[]): number => {
  const normalized = headers.map((h) => (h || "").toString().toLowerCase().trim());
  for (const pattern of patterns) {
    const idx = normalized.findIndex((h) => h === pattern || h.includes(pattern));
    if (idx !== -1) return idx;
  }
  return -1;
};

const COLUMN_PATTERNS: Record<string, string[]> = {
  level: ["level"],
  assemblyType: ["assembly type", "assemblytype"],
  wallType: ["wall type", "walltype", "wall type"],
  height: ["height"],
  wallLengthCeilingArea: [
    "wall length/ ceiling area",
    "wall length/ceiling area",
    "wall length / ceiling area",
  ],
  no: ["no.", "no"],
  unit: ["unit"],
  areaParementer: ["area parementer", "area parameter", "area paremeter"],
  unit1: ["unit.1", "unit 1"],
  qty3: ["qty 3", "qty3"],
  uom3: ["uom3", "uom 3"],
};

/**
 * Parse Excel buffer to raw takeoff records (matches Python script output)
 */
export const parseRawTakeoffSheet = (buffer: ArrayBuffer): TakeoffRawRecord[] => {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets");

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  if (data.length < 2) throw new Error("Excel file has no data rows");

  const rawHeaders = (data[0] as unknown[]).map((c) => (c ?? "").toString().trim());
  const unnamedCols = rawHeaders
    .map((h, i) => (h.startsWith("Unnamed:") ? i : -1))
    .filter((i) => i >= 0);
  const keepIndices = rawHeaders
    .map((_, i) => i)
    .filter((i) => !unnamedCols.includes(i));
  const headers = keepIndices.map((i) => rawHeaders[i]);

  const colIdx: Record<string, number> = {};
  for (const [key, patterns] of Object.entries(COLUMN_PATTERNS)) {
    const idx = findColumnIndex(headers, patterns);
    if (idx >= 0) colIdx[key] = keepIndices[idx];
  }

  const hasRequired =
    colIdx.assemblyType !== undefined &&
    colIdx.wallType !== undefined &&
    colIdx.height !== undefined &&
    colIdx.wallLengthCeilingArea !== undefined;

  if (!hasRequired) {
    throw new Error(
      "Missing required columns: Assembly type, Wall Type, Height, wall Length/ Ceiling area",
    );
  }

  const outputRecords: TakeoffRawRecord[] = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r] as unknown[];
    if (!row) continue;

    const get = (key: string): unknown =>
      colIdx[key] !== undefined ? row[colIdx[key]] : undefined;

    const assemblyTypeRaw = get("assemblyType");
    const wallTypeRaw = get("wallType");
    const heightRaw = get("height");
    const wallLengthRaw = get("wallLengthCeilingArea");

    if (
      assemblyTypeRaw === undefined ||
      assemblyTypeRaw === null ||
      String(assemblyTypeRaw).trim() === "" ||
      wallTypeRaw === undefined ||
      wallTypeRaw === null ||
      String(wallTypeRaw).trim() === "" ||
      heightRaw === undefined ||
      heightRaw === null ||
      (String(heightRaw).trim() === "" && Number.isNaN(Number(heightRaw))) ||
      wallLengthRaw === undefined ||
      wallLengthRaw === null
    ) {
      continue;
    }

    const assemblyType = cleanValue(assemblyTypeRaw) as string | null;
    const valueKey = getValueKeyForAssemblyType(assemblyType);
    const wallLengthVal =
      typeof wallLengthRaw === "number"
        ? wallLengthRaw
        : parseFloat(String(wallLengthRaw).replace(/,/g, "")) || 0;
    const numVal =
      Number.isInteger(wallLengthVal) || wallLengthVal === Math.floor(wallLengthVal)
        ? Math.floor(wallLengthVal)
        : wallLengthVal;

    const record: TakeoffRawRecord = {
      level: cleanValue(get("level")),
      assembly_type: assemblyType,
      wall_type: cleanValue(wallTypeRaw),
      height: cleanValue(heightRaw),
      [valueKey]: numVal,
    } as TakeoffRawRecord;

    const noVal = get("no");
    if (noVal !== undefined && noVal !== null && String(noVal).trim() !== "")
      record.no = cleanValue(noVal);

    const unitVal = get("unit");
    if (unitVal !== undefined && unitVal !== null && String(unitVal).trim() !== "")
      record.unit = cleanValue(unitVal);

    const areaVal = get("areaParementer");
    if (areaVal !== undefined && areaVal !== null && String(areaVal).trim() !== "")
      record.area_parementer = cleanValue(areaVal);

    const unit1Val = get("unit1");
    if (unit1Val !== undefined && unit1Val !== null && String(unit1Val).trim() !== "")
      record.unit_1 = cleanValue(unit1Val);

    const qty3Val = get("qty3");
    if (qty3Val !== undefined && qty3Val !== null && String(qty3Val).trim() !== "")
      record.qty_3 = cleanValue(qty3Val);

    const uom3Val = get("uom3");
    if (uom3Val !== undefined && uom3Val !== null && String(uom3Val).trim() !== "")
      record.uom3 = cleanValue(uom3Val);

    outputRecords.push(record);
  }

  return outputRecords;
};
