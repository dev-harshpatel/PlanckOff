/**
 * Raw takeoff Excel parser - matches scripts/excel_to_json.py output
 * No aggregation; one JSON record per row
 */

import * as XLSX from "xlsx";

export interface TakeoffRawRecord {
  assembly_type: string | number | null;
  ceiling_area?: number;
  description?: string | null;
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

export interface TakeoffParserIssue {
  excelRow: number;
  field: "wall_length_ceiling_area" | "area_parementer" | "qty_3";
  rawValue: string;
  reason: string;
}

export interface TakeoffRawParseValidationSummary {
  dataRowCount: number;
  parsedRowCount: number;
  skippedEmptyRowCount: number;
  malformedNumericRowCount: number;
  malformedRows: TakeoffParserIssue[];
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

const findHeaderRow = (
  data: unknown[][],
): { headerRowIndex: number; headers: string[] } => {
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (!row || !Array.isArray(row)) continue;

    const headers = row.map((cell) => (cell ?? "").toString().trim());
    const normalized = headers.map((header) => header.toLowerCase().trim());

    const hasWallType = normalized.some((header) =>
      COLUMN_PATTERNS.wallType.some((pattern) => header === pattern || header.includes(pattern)),
    );
    const hasAssemblyType = normalized.some((header) =>
      COLUMN_PATTERNS.assemblyType.some((pattern) => header === pattern || header.includes(pattern)),
    );

    if (hasWallType && hasAssemblyType) {
      return { headerRowIndex: i, headers };
    }
  }

  return {
    headerRowIndex: 0,
    headers: (data[0] as unknown[]).map((cell) => (cell ?? "").toString().trim()),
  };
};

const parseOptionalNumericCell = (value: unknown) => {
  if (value === null || value === undefined) {
    return { hasValue: false, isValid: true, value: undefined as number | undefined };
  }

  const raw = String(value).trim();
  if (!raw) {
    return { hasValue: false, isValid: true, value: undefined as number | undefined };
  }

  if (typeof value === "number") {
    return {
      hasValue: true,
      isValid: Number.isFinite(value),
      value: Number.isFinite(value) ? value : undefined,
    };
  }

  const parsed = Number.parseFloat(raw.replace(/,/g, ""));
  return {
    hasValue: true,
    isValid: Number.isFinite(parsed),
    value: Number.isFinite(parsed) ? parsed : undefined,
  };
};

/**
 * Parse Excel buffer to raw takeoff records (matches Python script output)
 */
export const parseRawTakeoffSheetDetailed = (buffer: ArrayBuffer): {
  records: TakeoffRawRecord[];
  validation: TakeoffRawParseValidationSummary;
} => {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets");

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  if (data.length < 2) throw new Error("Excel file has no data rows");

  const { headerRowIndex, headers: detectedHeaders } = findHeaderRow(data);
  const rawHeaders = detectedHeaders;
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
    colIdx.wallLengthCeilingArea !== undefined;

  if (!hasRequired) {
    throw new Error(
      `Missing required columns: Assembly type, Wall Type, wall Length/ Ceiling area. Found headers: [${headers.join(", ")}]`,
    );
  }

  const outputRecords: TakeoffRawRecord[] = [];
  const malformedRows: TakeoffParserIssue[] = [];
  let skippedEmptyRowCount = 0;

  for (let r = headerRowIndex + 1; r < data.length; r++) {
    const row = data[r] as unknown[];
    if (!row) continue;

    const get = (key: string): unknown =>
      colIdx[key] !== undefined ? row[colIdx[key]] : undefined;

    const assemblyTypeRaw = get("assemblyType");
    const wallTypeRaw = get("wallType");
    const wallLengthRaw = get("wallLengthCeilingArea");

    if (
      assemblyTypeRaw === undefined ||
      assemblyTypeRaw === null ||
      String(assemblyTypeRaw).trim() === "" ||
      wallTypeRaw === undefined ||
      wallTypeRaw === null ||
      String(wallTypeRaw).trim() === "" ||
      wallLengthRaw === undefined ||
      wallLengthRaw === null
    ) {
      skippedEmptyRowCount += 1;
      continue;
    }

    const assemblyType = cleanValue(assemblyTypeRaw) as string | null;
    const valueKey = getValueKeyForAssemblyType(assemblyType);
    const wallLengthNumeric = parseOptionalNumericCell(wallLengthRaw);
    const areaNumeric = parseOptionalNumericCell(get("areaParementer"));
    const qty3Numeric = parseOptionalNumericCell(get("qty3"));

    if (!wallLengthNumeric.isValid) {
      malformedRows.push({
        excelRow: r + 1,
        field: "wall_length_ceiling_area",
        rawValue: String(wallLengthRaw),
        reason: "Wall length / ceiling area is not numeric",
      });
      continue;
    }

    if (areaNumeric.hasValue && !areaNumeric.isValid) {
      malformedRows.push({
        excelRow: r + 1,
        field: "area_parementer",
        rawValue: String(get("areaParementer")),
        reason: "Area perimeter is not numeric",
      });
      continue;
    }

    if (qty3Numeric.hasValue && !qty3Numeric.isValid) {
      malformedRows.push({
        excelRow: r + 1,
        field: "qty_3",
        rawValue: String(get("qty3")),
        reason: "Qty 3 is not numeric",
      });
      continue;
    }

    const wallLengthVal = wallLengthNumeric.value ?? 0;
    const numVal =
      Number.isInteger(wallLengthVal) || wallLengthVal === Math.floor(wallLengthVal)
        ? Math.floor(wallLengthVal)
        : wallLengthVal;

    const record: TakeoffRawRecord = {
      level: cleanValue(get("level")),
      assembly_type: assemblyType,
      wall_type: cleanValue(wallTypeRaw),
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
      record.area_parementer = areaNumeric.value ?? cleanValue(areaVal);

    const unit1Val = get("unit1");
    if (unit1Val !== undefined && unit1Val !== null && String(unit1Val).trim() !== "")
      record.unit_1 = cleanValue(unit1Val);

    const qty3Val = get("qty3");
    if (qty3Val !== undefined && qty3Val !== null && String(qty3Val).trim() !== "")
      record.qty_3 = qty3Numeric.value ?? cleanValue(qty3Val);

    const uom3Val = get("uom3");
    if (uom3Val !== undefined && uom3Val !== null && String(uom3Val).trim() !== "")
      record.uom3 = cleanValue(uom3Val);

    outputRecords.push(record);
  }

  return {
    records: outputRecords,
    validation: {
      dataRowCount: Math.max(0, data.length - (headerRowIndex + 1)),
      parsedRowCount: outputRecords.length,
      skippedEmptyRowCount,
      malformedNumericRowCount: malformedRows.length,
      malformedRows: malformedRows.slice(0, 25),
    },
  };
};

export const parseRawTakeoffSheet = (buffer: ArrayBuffer): TakeoffRawRecord[] =>
  parseRawTakeoffSheetDetailed(buffer).records;
