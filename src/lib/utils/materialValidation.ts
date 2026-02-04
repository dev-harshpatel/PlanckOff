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
      "cost code",
    ],
    laborCostCode: ["laborcostcode", "labor cost code", "labour cost code"],
    type: ["type", "division", "trade"],
    manufacturer: ["manufacturer", "vendor", "supplier", "brand"],
    description: ["description", "name", "item description", "material name"],
    matCost: ["matcost", "mat cost", "material cost", "price", "cost"],
    per: ["per", "unit", "uom", "unit of measure"],
    priceUpdated: [
      "priceupdated",
      "price updated",
      "date updated",
      "last updated",
    ],
    category: ["category", "type", "material type", "mat type"],
    width: ["width", "w"],
    gauge: ["gauge", "ga", "thickness"],
    flange: ["flange", "fl"],
    productivity: ["productivity", "prod", "units per hour", "u/hr"],
    hourlyRate: [
      "hourlyrate",
      "hourly rate",
      "rate",
      "labor rate",
      "labour rate",
    ],
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

  // Parse matCost
  let matCost = getMappedValue("matCost") || 0;
  if (typeof matCost === "string") {
    matCost = parseFloat(matCost.replace(/[$,]/g, "")) || 0;
  }
  matCost = parseFloat(matCost);

  if (isNaN(matCost)) {
    errors.push("Invalid material cost - must be a number");
    matCost = 0;
  }

  // Parse optional numeric fields
  let productivity = getMappedValue("productivity");
  if (
    productivity !== undefined &&
    productivity !== null &&
    productivity !== ""
  ) {
    productivity = parseFloat(productivity);
    if (isNaN(productivity)) {
      errors.push("Invalid productivity - must be a number");
      productivity = undefined;
    }
  } else {
    productivity = undefined;
  }

  let hourlyRate = getMappedValue("hourlyRate");
  if (hourlyRate !== undefined && hourlyRate !== null && hourlyRate !== "") {
    if (typeof hourlyRate === "string") {
      hourlyRate = parseFloat(hourlyRate.replace(/[$,]/g, "")) || undefined;
    }
    hourlyRate = parseFloat(hourlyRate);
    if (isNaN(hourlyRate)) {
      errors.push("Invalid hourly rate - must be a number");
      hourlyRate = undefined;
    }
  } else {
    hourlyRate = undefined;
  }

  // Normalize category
  const normalizedCategory = normalizeCategory(category.toString().trim());

  // Get width, gauge, flange values
  const widthValue = getMappedValue("width");
  const gaugeValue = getMappedValue("gauge");
  const flangeValue = getMappedValue("flange");

  // Build material object
  const material: MaterialDefinition = {
    code: code.toString().trim(),
    section: (getMappedValue("section") || "00 00 00").toString().trim(),
    matCostCode: (getMappedValue("matCostCode") || "GEN").toString().trim(),
    laborCostCode: (getMappedValue("laborCostCode") || "").toString().trim(),
    type: (getMappedValue("type") || "Material").toString().trim(),
    manufacturer: (getMappedValue("manufacturer") || "Generic")
      .toString()
      .trim(),
    description: description.toString().trim(),
    matCost,
    per: (getMappedValue("per") || inferUnitFromCategory(normalizedCategory))
      .toString()
      .trim(),
    priceUpdated: (
      getMappedValue("priceUpdated") || new Date().toLocaleDateString()
    )
      .toString()
      .trim(),
    category: normalizedCategory,
    width:
      widthValue !== undefined && widthValue !== null && widthValue !== ""
        ? widthValue.toString().trim()
        : undefined,
    gauge:
      gaugeValue !== undefined && gaugeValue !== null && gaugeValue !== ""
        ? gaugeValue.toString().trim()
        : undefined,
    flange:
      flangeValue !== undefined && flangeValue !== null && flangeValue !== ""
        ? flangeValue.toString().trim()
        : undefined,
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

  data.forEach((row, index) => {
    const { material, errors } = validateMaterialData(row, headerMap);

    if (material && errors.length === 0) {
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
