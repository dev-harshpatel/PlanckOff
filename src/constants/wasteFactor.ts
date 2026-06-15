// Default waste factors by material category

export const DEFAULT_WASTE_FACTORS: Record<string, number> = {
  Framing: 0.08, // 8% waste for framing materials
  Track: 0.05, // 5% waste for tracks
  Drywall: 0.1, // 10% waste for drywall
  Insulation: 0.05, // 5% waste for insulation
  Finishing: 0.05, // 5% waste for finishing materials
  Ceiling: 0.05, // 5% waste for ceiling materials
  Labor: 0.0, // No waste for labor
  Other: 0.0, // No waste for other items
} as const;

/**
 * Get waste factor for a material category
 * @param category - Material category
 * @param override - Optional override value
 * @returns Waste factor as decimal (e.g., 0.08 = 8%)
 */
export const getWasteFactor = (
  category: string,
  override?: number | null,
): number => {
  if (override !== undefined && override !== null) {
    return override;
  }
  return DEFAULT_WASTE_FACTORS[category] ?? 0.05;
};

/** Infer material category from raw text and/or code when MaterialDefinition is not available */
export const inferCategoryFromMaterial = (
  rawText: string | null | undefined,
  code: string | null | undefined,
): string => {
  const text = (rawText ?? "").toLowerCase();
  const c = (code ?? "").toUpperCase();
  if (
    /gypsum|wallboard|drywall|type x|sheathing|shaftliner/i.test(text) ||
    /^DW-|^SH-/.test(c)
  )
    return "Drywall";
  if (
    /stud|track|metal stud|furring|framing/i.test(text) ||
    /^ST-|^TR-|^SC-FRM/.test(c)
  )
    return /track|^TR-/i.test(text + c) ? "Track" : "Framing";
  if (/insulation|batt|r-\d/i.test(text) || /^INS-|^BATT/.test(c))
    return "Insulation";
  if (/tape|mud|joint|finish|screw.*drywall/i.test(text) || /^SC-|^JT-/.test(c))
    return "Finishing";
  if (/ceiling|tile|grid|runner|tee/i.test(text)) return "Ceiling";
  if (/labor|hang|install|tape.*finish/i.test(text) || /^LAB-/.test(c))
    return "Labor";
  return "Other";
};
