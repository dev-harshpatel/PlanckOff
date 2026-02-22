/**
 * Material Validation Utilities
 * Validates and normalizes material data from Excel imports
 */

import { MaterialDefinition } from "@/types";

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
      "sheet/bag/box size", // "Sheet/bag/Box  size" combined column
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
      "production rate (pre unit)",
      "productionrate",
      "production rate",
    ],
    hourlyRate: [
      "hourlyrate",
      "hourly rate",
      "rate",
      "labor rate",
      "labour rate",
    ],
    formulaQty: [
      "formula for qty",
      "formulaqty",
      "formula qty",
      "formulaforqty",
    ],
    formulaSecQty: [
      "formula for sec. qty",
      "formula for sec qty",
      "formulasecqty",
      "formula sec qty",
      "formulaforsecqty",
    ],
    // Ceiling formula columns — "Formula" (unique name) and the deduplicated
    // second "Formula for Sec. Qty 2" (from the import deduplication step)
    formulaCeilQty: [
      "formula",
      "ceiling formula",
      "ceiling formula for qty",
      "formulaceilqty",
    ],
    formulaCeilSecQty: [
      "formula for sec. qty 2",   // deduplicated second occurrence
      "formulaforsecqty2",
      "ceiling formula for sec. qty",
      "ceiling formula for sec qty",
      "formulaceilsecqty",
    ],
    note: ["note", "notes", "comment", "comments", "remarks"],
  };

  headers.forEach((header) => {
    const normalizedHeader = header
      .toLowerCase()
      .trim()
      .replace(/[_\s]+/g, "");

    for (const [standardKey, variations] of Object.entries(fieldMapping)) {
      if (
        variations.some((v) => normalizedHeader === v.replace(/[_\s]+/g, ""))
      ) {
        headerMap[header] = standardKey;
        break;
      }
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

  // Parse matCost
  let matCost = getMappedValue("matCost") || 0;
  if (typeof matCost === "string") {
    matCost = parseFloat(matCost.replace(/[$,]/g, "")) || 0;
  }
  matCost = parseFloat(matCost);
  if (isNaN(matCost)) matCost = 0;

  const unitCost = parseOptionalNumeric("unitCost");
  const productivity = parseOptionalNumeric("productivity");
  const hourlyRate = parseOptionalNumeric("hourlyRate");

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
    priceUpdated: (getMappedValue("priceUpdated") || new Date().toLocaleDateString()).toString().trim(),
    category: normalizedCategory,
    width: getOptionalString("width"),
    gauge: getOptionalString("gauge"),
    flange: getOptionalString("flange"),
    sheetBagBox: getOptionalString("sheetBagBox"),
    size: getOptionalString("size"),
    screwSpacing: getOptionalString("screwSpacing"),
    formulaQty: getOptionalString("formulaQty"),
    formulaSecQty: getOptionalString("formulaSecQty"),
    formulaCeilQty: getOptionalString("formulaCeilQty"),
    formulaCeilSecQty: getOptionalString("formulaCeilSecQty"),
    note: getOptionalString("note"),
    productivity,
    hourlyRate,
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
