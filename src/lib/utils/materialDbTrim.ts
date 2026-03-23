/**
 * Trim material database to fields needed for matching.
 * Reduces payload size for AI prompts.
 */

export interface TrimmedMaterialDbEntry {
  code: string;
  section: string;
  type: string;
  description: string;
  category: string;
  matCost: string;
  per: string;
  manufacturer: string;
  productivity?: string;
  unitCost?: string;
  sizeOfUnit?: string;
  hourlyRate?: string;
  size?: string;
}

/** Trim material DB to fields needed for matching — reduces payload size per batch. */
export const trimMaterialDbForMatching = (db: unknown): TrimmedMaterialDbEntry[] => {
  const arr = Array.isArray(db) ? db : [];
  return arr.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      code: String(r.code ?? ""),
      section: String(r.section ?? ""),
      type: String(r.type ?? ""),
      description: String(r.description ?? ""),
      category: String(r.category ?? ""),
      // For non-labor: use productivity (production rate per unit = col J). For labor: use matCost (= hourlyRate/productivity).
      matCost: String((r.category as string ?? "").toLowerCase() === "labor" ? (r.matCost ?? "") : (r.productivity ?? r.matCost ?? "")),
      per: String(r.per ?? ""),
      manufacturer: String(r.manufacturer ?? ""),
      productivity:
        r.productivity == null ? undefined : String(r.productivity),
      unitCost: r.unitCost == null ? undefined : String(r.unitCost),
      sizeOfUnit:
        r.sizeOfUnit == null ? undefined : String(r.sizeOfUnit),
      hourlyRate:
        r.hourlyRate == null ? undefined : String(r.hourlyRate),
      size: r.size == null ? undefined : String(r.size),
    };
  });
};
