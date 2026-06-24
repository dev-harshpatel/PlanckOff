import { TakeoffInstance, WallAssembly } from "@/types";
import { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";

/**
 * Safely parse a raw cell value into a finite number.
 * Returns undefined for nullish, empty, or non-finite inputs.
 */
export const normalizeTakeoffNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const parsed = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Convert the current in-memory takeoffs map into a flat array of TakeoffRawRecord
 * rows, suitable for persisting to the takeoff_outputs table.
 */
export const serializeTakeoffsToRawRows = (
  currentTakeoffs: Record<string, TakeoffInstance[]>,
  currentAssemblies: WallAssembly[],
): TakeoffRawRecord[] => {
  const assembliesById = new Map(currentAssemblies.map((a) => [a.id, a]));
  const rows: TakeoffRawRecord[] = [];

  Object.entries(currentTakeoffs).forEach(([assemblyId, instances]) => {
    const assembly = assembliesById.get(assemblyId);
    if (!assembly) return;

    instances.forEach((instance) => {
      const assemblyType = String(assembly.assemblyType || "Interior Walls").trim();
      const isCeiling = assemblyType.toLowerCase().includes("ceiling");
      if (!assembly.code) return;

      const length = normalizeTakeoffNumber(instance.length) ?? 0;
      const ceilingArea = normalizeTakeoffNumber(instance.ceilingArea) ?? 0;
      const perimeter = normalizeTakeoffNumber(instance.perimeter);

      rows.push({
        level: instance.level || null,
        description: instance.description || null,
        assembly_type: assemblyType,
        wall_type: assembly.code,
        wall_length: isCeiling ? undefined : length,
        ceiling_area: isCeiling ? ceilingArea : undefined,
        area_parementer: perimeter,
        unit: isCeiling ? "SF" : "LF",
        unit_1: perimeter != null ? "LF" : null,
      });
    });
  });

  return rows;
};
