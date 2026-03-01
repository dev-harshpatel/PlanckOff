/**
 * Material Validation Utilities
 * Validates and normalizes material data from Excel imports
 */

import { MaterialDefinition } from "@/types";

/**
 * Converts an Excel serial date number to a YYYY-MM-DD string.
 * Excel epoch is 1900-01-01 (with the known Lotus 123 leap-year bug for dates after Feb 28 1900).
 */
const excelSerialToDate = (serial: number): string => {
  const utcDays = Math.floor(serial) - 25569;
  const date = new Date(utcDays * 86400 * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Normalizes a priceUpdated value from Excel — could be a serial number,
 * a date string like "2/12/2024", or already ISO formatted.
 */
export const normalizePriceUpdatedDate = (raw: string | number | undefined | null): string => {
  if (raw == null || raw === "") return new Date().toISOString().slice(0, 10);

  const str = String(raw).trim();

  if (/^\d+$/.test(str) && parseInt(str) > 30000) {
    return excelSerialToDate(parseInt(str));
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return new Date().toISOString().slice(0, 10);
};

/**
 * Normalize Excel headers to standard keys (case-insensitive)
 */
export const normalizeExcelHeaders = (
  headers: string[],
): Record<string, string> => {
  const headerMap: Record<string, string> = {};

  const fieldMapping: Record<string, string[]> = {
    code: ["code", "material code", "item code", "mat code"],
    section: ["section", "csi section", "masterformat"],
    matCostCode: [
      "matcostcode",
      "mat cost code",
      "material cost code",
      "costcode",
      "cost code",
    ],
    laborCostCode: ["laborcostcode", "labor cost code", "labour cost code"],
    type: ["type", "division", "trade"],
    manufacturer: ["manufacturer", "vendor", "supplier", "brand"],
    description: ["description", "name", "item description", "material name"],
    matCost: [
      "matcost",
      "mat cost",
      "material cost",
      "price",
      "cost",
      "unit price",
    ],
    unitCost: [
      "unitcost",
      "unit cost",
    ],
    per: ["per", "unit", "uom", "unit of measure"],
    priceUpdated: [
      "priceupdated",
      "price updated",
      "date updated",
      "last updated",
    ],
    category: ["category", "material type", "mat type"],
    width: ["width", "w"],
    gauge: ["gauge", "ga", "thickness"],
    flange: ["flange", "fl"],
    sheetBagBox: [
      "sheet/bag/box",
      "sheetbagbox",
      "sheet bag box",
      "sheets",
      "bags",
      "boxes",
      "sheet/bag/box size",
      "sheet/bag/box/roll size",
      "sheetbagboxsize",  // JSON: sheetBagBoxSize
    ],
    sheetBagBoxSizeUnits: [
      "sheetbagboxsizeunits",
      "sheet/bag/box units",
      "sheet bag box units",
      "sheet/bag/box size units",
      "sheet units",
      "bag units",
      "box units",
    ],
    lengthCover: [
      "lengthcover",
      "length cover",
      "area/length cover",
      "area/ length cover",
      "area length cover",
      "coverage",
      "cover area",
    ],
    lengthCoverUnits: [
      "lengthcoverunits",
      "length cover units",
      "area/length cover units",
      "area/ length cover units",
      "coverage units",
      "cover units",
    ],
    size: ["size", "sz"],
    screwSpacing: [
      "screw_spacing",
      "screwspacing",
      "screw spacing",
    ],
    productivity: [
      "productivity",
      "prod",
      "units per hour",
      "u/hr",
      "production rate (per unit)",
      "production rate (pre unit)",
      "productionrate",
      "production rate",
      "productionRate",
    ],
    hourlyRate: [
      "hourlyrate",
      "hourly rate",
      "rate",
      "labor rate",
      "labour rate",
    ],
    coverPerHour: [
      "coverperhour",
      "cover per hour",
      "coverage per hour",
      "coverage/hr",
      "coverage per hr",
      "area/ length cover",
    ],
    // Wall formulas
    formulaQty: [
      "formula for qty",
      "formulaqty",
      "formula qty",
      "formulaforqty",
      "wall formula for qty",
      "formulaforwall",     // JSON: FormulaForWall
    ],
    formulaSecQty: [
      "formula for sec. qty",
      "formula for sec qty",
      "formulasecqty",
      "formula sec qty",
      "formulaforsecqty",
      "wall formula for sec. qty",
      "wall formula for sec qty",
      "formulaforsecqtywall",  // JSON: formulaForSecQtyWall
    ],
    // Ceiling formulas
    formulaCeilQty: [
      "formula",
      "ceiling formula",
      "ceiling formula for qty",
      "formulaceilqty",
      "formulaforceiling",    // JSON: formulaForCeiling
    ],
    formulaCeilSecQty: [
      "formula for sec. qty 2",
      "formulaforsecqty2",
      "ceiling formula for sec. qty",
      "ceiling formula for sec qty",
      "formulaceilsecqty",
      "formulaforsecqtyceiling",  // JSON: formulaForSecQtyCeiling
    ],
    // MOU / UOM fields - output unit for each formula
    // Excel sheet uses "Wall UOM", "Wall Sec. UOM", "Ceiling UOM", "Ceiling Sec. UOM"
    mouWall: [
      "walluom",                 // Excel: "Wall UOM"
      "wall uom",
      "mouforwall",              // JSON key: mouForWall
      "mou for wall",
      "mou wall",
      "mouwall",
      "wall mou",
    ],
    mouWallSec: [
      "wallsecuom",              // Excel: "Wall Sec. UOM"
      "wall sec uom",
      "wall sec. uom",
      "mouformulaforsecqty",     // JSON key: mouFormulaForSecQty
      "mou for sec qty",
      "mou wall sec",
      "mouwallsec",
      "wall sec mou",
    ],
    mouCeil: [
      "ceilinguom",              // Excel: "Ceiling UOM"
      "ceiling uom",
      "mouforceiling",           // JSON key: mouForCeiling
      "mou for ceiling",
      "mou ceiling",
      "mouceiling",
      "mouceil",
      "ceiling mou",
    ],
    mouCeilSec: [
      "ceilingsecuom",           // Excel: "Ceiling Sec. UOM"
      "ceiling sec uom",
      "ceiling sec. uom",
      "mouformulaforsecqtyceiling",  // JSON key: mouFormulaForSecQtyCeiling
      "mou ceiling sec",
      "mouceilsec",
      "ceiling sec mou",
    ],
    note: ["note", "notes", "comment", "comments", "remarks"],
  };

  // Track the previously mapped field so we can resolve ambiguous "Units" columns
  // by checking what column they follow (positional disambiguation).
  let prevMappedField = "";

  headers.forEach((header) => {
    const normalizedHeader = header
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "");

    // Handle duplicate "Units" columns by looking at the preceding column.
    // The import deduplicates headers as "Units", "Units 2", etc.,
    // so we match both "units" and "units2", "units3", etc.
    if (/^units\d*$/.test(normalizedHeader) || normalizedHeader === "unit") {
      if (
        prevMappedField === "sheetBagBox" &&
        !Object.values(headerMap).includes("sheetBagBoxSizeUnits")
      ) {
        headerMap[header] = "sheetBagBoxSizeUnits";
        prevMappedField = "sheetBagBoxSizeUnits";
        return;
      }
      if (
        prevMappedField === "lengthCover" &&
        !Object.values(headerMap).includes("lengthCoverUnits")
      ) {
        headerMap[header] = "lengthCoverUnits";
        prevMappedField = "lengthCoverUnits";
        return;
      }
    }

    let matched = false;
    for (const [standardKey, variations] of Object.entries(fieldMapping)) {
      if (
        variations.some((v) => normalizedHeader === v.replace(/[^a-z0-9]/g, ""))
      ) {
        headerMap[header] = standardKey;
        prevMappedField = standardKey;
        matched = true;
        break;
      }
    }
    if (!matched) {
      prevMappedField = "";
    }
  });

  return headerMap;
};

/**
 * Validate and transform Excel row to MaterialDefinition
 */
export const validateMaterialData = (
  row: any,
  headerMap: Record<string, string>,
): { material: MaterialDefinition | null; errors: string[] } => {
  const errors: string[] = [];

  // Get mapped values
  const getMappedValue = (standardKey: string): any => {
    const excelKey = Object.keys(headerMap).find(
      (k) => headerMap[k] === standardKey,
    );
    return excelKey ? row[excelKey] : undefined;
  };

  // Required fields
  const code = getMappedValue("code");
  const description = getMappedValue("description");
  const category = getMappedValue("category");

  if (!code || code.toString().trim() === "") {
    errors.push("Missing required field: code");
  }
  if (!description || description.toString().trim() === "") {
    errors.push("Missing required field: description");
  }
  if (!category || category.toString().trim() === "") {
    errors.push("Missing required field: category");
  }

  if (errors.length > 0) {
    return { material: null, errors };
  }

  // Helper to parse optional numeric field
  const parseOptionalNumeric = (key: string): number | undefined => {
    let val = getMappedValue(key);
    if (val === undefined || val === null || val === "") return undefined;
    if (typeof val === "string") val = parseFloat(val.replace(/[$,]/g, ""));
    else val = parseFloat(val);
    return isNaN(val) ? undefined : val;
  };

  // Helper to get optional string field
  const getOptionalString = (key: string): string | undefined => {
    const val = getMappedValue(key);
    if (val === undefined || val === null || val === "") return undefined;
    return val.toString().trim();
  };

  const unitCost = parseOptionalNumeric("unitCost");
  const productivity = parseOptionalNumeric("productivity");
  const hourlyRate = parseOptionalNumeric("hourlyRate");
  const coverPerHour = parseOptionalNumeric("coverPerHour");

  // Parse matCost, falling back to unitCost when explicit matCost column is missing
  let matCostRaw = getMappedValue("matCost");
  if (matCostRaw === undefined || matCostRaw === null || matCostRaw === "") {
    matCostRaw = unitCost ?? 0;
  }

  let matCost: number;
  if (typeof matCostRaw === "string") {
    matCost = parseFloat(matCostRaw.replace(/[$,]/g, "")) || 0;
  } else {
    matCost = parseFloat(String(matCostRaw));
  }
  if (isNaN(matCost)) {
    matCost = unitCost ?? 0;
  }

  // Normalize category
  const normalizedCategory = normalizeCategory(category.toString().trim());

  // Build material object
  const material: MaterialDefinition = {
    code: code.toString().trim(),
    section: (getMappedValue("section") || "00 00 00").toString().trim(),
    matCostCode: (getMappedValue("matCostCode") || "GEN").toString().trim(),
    laborCostCode: (getMappedValue("laborCostCode") || "").toString().trim(),
    type: (getMappedValue("type") || "Material").toString().trim(),
    manufacturer: (getMappedValue("manufacturer") || "Generic").toString().trim(),
    description: description.toString().trim(),
    matCost,
    unitCost,
    per: (getMappedValue("per") || inferUnitFromCategory(normalizedCategory)).toString().trim(),
    priceUpdated: normalizePriceUpdatedDate(getMappedValue("priceUpdated")),
    category: normalizedCategory,
    width: getOptionalString("width"),
    gauge: getOptionalString("gauge"),
    flange: getOptionalString("flange"),
    sheetBagBox: getOptionalString("sheetBagBox"),
    sheetBagBoxSizeUnits: getOptionalString("sheetBagBoxSizeUnits"),
    size: getOptionalString("size"),
    screwSpacing: getOptionalString("screwSpacing"),
    lengthCover: getOptionalString("lengthCover"),
    lengthCoverUnits: getOptionalString("lengthCoverUnits"),
    formulaQty: getOptionalString("formulaQty"),
    formulaSecQty: getOptionalString("formulaSecQty"),
    formulaCeilQty: getOptionalString("formulaCeilQty"),
    formulaCeilSecQty: getOptionalString("formulaCeilSecQty"),
    mouWall: getOptionalString("mouWall"),
    mouWallSec: getOptionalString("mouWallSec"),
    mouCeil: getOptionalString("mouCeil"),
    mouCeilSec: getOptionalString("mouCeilSec"),
    note: getOptionalString("note"),
    productivity,
    hourlyRate,
    coverPerHour,
  };

  return { material, errors };
};

/**
 * Normalize category to standard values
 */
const normalizeCategory = (
  category: string,
): MaterialDefinition["category"] => {
  const normalized = category.toLowerCase().trim();

  if (normalized.includes("fram")) return "Framing";
  if (normalized.includes("drywall") || normalized.includes("gypsum"))
    return "Drywall";
  if (normalized.includes("insul")) return "Insulation";
  if (normalized.includes("finish") || normalized.includes("paint"))
    return "Finishing";
  if (normalized.includes("ceiling") || normalized.includes("tile"))
    return "Ceiling";
  if (normalized.includes("labor") || normalized.includes("labour"))
    return "Labor";

  return "Other";
};

/**
 * Infer default unit from category
 */
const inferUnitFromCategory = (
  category: MaterialDefinition["category"],
): string => {
  switch (category) {
    case "Framing":
      return "1 LF";
    case "Drywall":
    case "Insulation":
    case "Ceiling":
      return "1,000 SF";
    case "Labor":
      return "1 HR";
    default:
      return "1 EA";
  }
};

/**
 * Validate batch of materials and return results
 * Uniquifies duplicate codes by appending _2, _3, etc. so all rows upload
 */
export const validateMaterialsBatch = (
  data: any[],
  headerMap: Record<string, string>,
): {
  validMaterials: MaterialDefinition[];
  invalidRows: { row: number; errors: string[] }[];
} => {
  const validMaterials: MaterialDefinition[] = [];
  const invalidRows: { row: number; errors: string[] }[] = [];
  const codeCount = new Map<string, number>();

  data.forEach((row, index) => {
    const { material, errors } = validateMaterialData(row, headerMap);

    if (material && errors.length === 0) {
      const baseCode = material.code;
      const count = (codeCount.get(baseCode) ?? 0) + 1;
      codeCount.set(baseCode, count);

      if (count > 1) {
        material.code = `${baseCode}_${count}`;
      }
      validMaterials.push(material);
    } else {
      invalidRows.push({
        row: index + 2, // +2 for Excel row number (1-indexed + header row)
        errors,
      });
    }
  });

  return { validMaterials, invalidRows };
};

/**
 * Extract unique categories from materials
 */
export const extractUniqueCategories = (
  materials: MaterialDefinition[],
): string[] => {
  const categories = new Set(materials.map((m) => m.category));
  return Array.from(categories).sort();
};
