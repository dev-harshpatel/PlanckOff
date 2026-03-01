/**
 * Materials Repository
 * All material database operations for spec_database table
 *
 * This follows the Repository Pattern - isolating database logic
 * from API routes makes code reusable and testable.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { MaterialDefinition } from "@/types";

const TABLES = {
  MATERIALS: "spec_database",
};

/**
 * Transform database row to MaterialDefinition
 */
const transformToMaterial = (row: any): MaterialDefinition => ({
  code: row.code,
  section: row.section,
  matCostCode: row.mat_cost_code,
  laborCostCode: row.labor_cost_code,
  type: row.type,
  manufacturer: row.manufacturer,
  description: row.description,
  matCost: parseFloat(row.mat_cost),
  unitCost: row.unit_cost != null ? parseFloat(row.unit_cost) : undefined,
  per: row.per,
  priceUpdated: row.price_updated,
  category: row.category,
  width: row.width,
  gauge: row.gauge,
  flange: row.flange,
  sheetBagBox: row.sheet_bag_box ?? undefined,
  sheetBagBoxSizeUnits: row.sheet_bag_box_size_units ?? undefined,
  size: row.size ?? undefined,
  screwSpacing: row.screw_spacing ?? undefined,
  lengthCover: row.length_cover ?? undefined,
  lengthCoverUnits: row.length_cover_units ?? undefined,
  formulaQty: row.formula_qty ?? undefined,
  formulaSecQty: row.formula_sec_qty ?? undefined,
  formulaCeilQty: row.formula_ceil_qty ?? undefined,
  formulaCeilSecQty: row.formula_ceil_sec_qty ?? undefined,
  mouWall: row.mou_wall ?? undefined,
  mouWallSec: row.mou_wall_sec ?? undefined,
  mouCeil: row.mou_ceil ?? undefined,
  mouCeilSec: row.mou_ceil_sec ?? undefined,
  note: row.note ?? undefined,
  productivity: row.productivity ? parseFloat(row.productivity) : undefined,
  hourlyRate: row.hourly_rate ? parseFloat(row.hourly_rate) : undefined,
  coverPerHour: row.cover_per_hour ? parseFloat(row.cover_per_hour) : undefined,
});

/**
 * Transform MaterialDefinition to database format
 */
const transformToDbRow = (material: MaterialDefinition) => ({
  code: material.code,
  section: material.section,
  mat_cost_code: material.matCostCode,
  labor_cost_code: material.laborCostCode || "",
  type: material.type,
  manufacturer: material.manufacturer,
  description: material.description,
  mat_cost: material.matCost,
  unit_cost: material.unitCost ?? null,
  per: material.per,
  price_updated: material.priceUpdated || new Date().toISOString().slice(0, 10),
  category: material.category,
  width: material.width ?? null,
  gauge: material.gauge ?? null,
  flange: material.flange ?? null,
  sheet_bag_box: material.sheetBagBox ?? null,
  sheet_bag_box_size_units: material.sheetBagBoxSizeUnits ?? null,
  size: material.size ?? null,
  screw_spacing: material.screwSpacing ?? null,
  length_cover: material.lengthCover ?? null,
  length_cover_units: material.lengthCoverUnits ?? null,
  formula_qty: material.formulaQty ?? null,
  formula_sec_qty: material.formulaSecQty ?? null,
  formula_ceil_qty: material.formulaCeilQty ?? null,
  formula_ceil_sec_qty: material.formulaCeilSecQty ?? null,
  mou_wall: material.mouWall ?? null,
  mou_wall_sec: material.mouWallSec ?? null,
  mou_ceil: material.mouCeil ?? null,
  mou_ceil_sec: material.mouCeilSec ?? null,
  note: material.note ?? null,
  productivity: material.productivity ?? null,
  hourly_rate: material.hourlyRate ?? null,
  cover_per_hour: material.coverPerHour ?? null,
});

/**
 * Get all materials
 */
export async function getAllMaterials(): Promise<{
  data: MaterialDefinition[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .select("*")
    .order("code", { ascending: true });

  if (error) {
    return { data: null, error };
  }

  const materials = data?.map(transformToMaterial) || [];
  return { data: materials, error: null };
}

/**
 * Get material by code
 */
export async function getMaterialByCode(code: string): Promise<{
  data: MaterialDefinition | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .select("*")
    .eq("code", code)
    .single();

  if (error) {
    return { data: null, error };
  }

  return { data: data ? transformToMaterial(data) : null, error: null };
}

/**
 * Get materials by category
 */
export async function getMaterialsByCategory(category: string): Promise<{
  data: MaterialDefinition[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .select("*")
    .eq("category", category)
    .order("code", { ascending: true });

  if (error) {
    return { data: null, error };
  }

  const materials = data?.map(transformToMaterial) || [];
  return { data: materials, error: null };
}

/**
 * Create a new material
 */
export async function createMaterial(material: MaterialDefinition): Promise<{
  data: MaterialDefinition | null;
  error: { message: string; code: string } | null;
}> {
  const dbRow = transformToDbRow(material);

  const { data, error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .insert(dbRow)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }

  return { data: data ? transformToMaterial(data) : null, error: null };
}

/**
 * Update material by code
 */
export async function updateMaterial(
  code: string,
  updates: Partial<MaterialDefinition>,
): Promise<{
  data: MaterialDefinition | null;
  error: { message: string; code: string } | null;
}> {
  // Remove code from updates if present (can't update primary identifier)
  const { code: _, ...updateFields } = updates;

  // Transform updates to db format
  const dbUpdates: any = {};
  if (updates.section !== undefined) dbUpdates.section = updates.section;
  if (updates.matCostCode !== undefined)
    dbUpdates.mat_cost_code = updates.matCostCode;
  if (updates.laborCostCode !== undefined)
    dbUpdates.labor_cost_code = updates.laborCostCode;
  if (updates.type !== undefined) dbUpdates.type = updates.type;
  if (updates.manufacturer !== undefined)
    dbUpdates.manufacturer = updates.manufacturer;
  if (updates.description !== undefined)
    dbUpdates.description = updates.description;
  if (updates.matCost !== undefined) dbUpdates.mat_cost = updates.matCost;
  if (updates.per !== undefined) dbUpdates.per = updates.per;
  if (updates.priceUpdated !== undefined)
    dbUpdates.price_updated = updates.priceUpdated;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.unitCost !== undefined) dbUpdates.unit_cost = updates.unitCost;
  if (updates.width !== undefined) dbUpdates.width = updates.width;
  if (updates.gauge !== undefined) dbUpdates.gauge = updates.gauge;
  if (updates.flange !== undefined) dbUpdates.flange = updates.flange;
  if (updates.sheetBagBox !== undefined) dbUpdates.sheet_bag_box = updates.sheetBagBox;
  if (updates.sheetBagBoxSizeUnits !== undefined) dbUpdates.sheet_bag_box_size_units = updates.sheetBagBoxSizeUnits;
  if (updates.size !== undefined) dbUpdates.size = updates.size;
  if (updates.screwSpacing !== undefined) dbUpdates.screw_spacing = updates.screwSpacing;
  if (updates.lengthCover !== undefined) dbUpdates.length_cover = updates.lengthCover;
  if (updates.lengthCoverUnits !== undefined) dbUpdates.length_cover_units = updates.lengthCoverUnits;
  if (updates.formulaQty !== undefined) dbUpdates.formula_qty = updates.formulaQty;
  if (updates.formulaSecQty !== undefined) dbUpdates.formula_sec_qty = updates.formulaSecQty;
  if (updates.formulaCeilQty !== undefined) dbUpdates.formula_ceil_qty = updates.formulaCeilQty;
  if (updates.formulaCeilSecQty !== undefined) dbUpdates.formula_ceil_sec_qty = updates.formulaCeilSecQty;
  if (updates.mouWall !== undefined) dbUpdates.mou_wall = updates.mouWall;
  if (updates.mouWallSec !== undefined) dbUpdates.mou_wall_sec = updates.mouWallSec;
  if (updates.mouCeil !== undefined) dbUpdates.mou_ceil = updates.mouCeil;
  if (updates.mouCeilSec !== undefined) dbUpdates.mou_ceil_sec = updates.mouCeilSec;
  if (updates.note !== undefined) dbUpdates.note = updates.note;
  if (updates.productivity !== undefined)
    dbUpdates.productivity = updates.productivity;
  if (updates.hourlyRate !== undefined)
    dbUpdates.hourly_rate = updates.hourlyRate;
  if (updates.coverPerHour !== undefined)
    dbUpdates.cover_per_hour = updates.coverPerHour;

  const { data, error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .update(dbUpdates)
    .eq("code", code)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }

  return { data: data ? transformToMaterial(data) : null, error: null };
}

/**
 * Bulk upsert materials (insert or update)
 * Deduplicates by code (keeps last occurrence) to avoid PostgreSQL error:
 * "ON CONFLICT DO UPDATE command cannot affect row a second time"
 */
const UPSERT_CHUNK_SIZE = 250;

export async function bulkUpsertMaterials(
  materials: MaterialDefinition[],
): Promise<{
  data: MaterialDefinition[] | null;
  error: { message: string; code: string } | null;
}> {
  // Deduplicate by code - keep last occurrence (Excel-style: later row overwrites)
  const seen = new Map<string, MaterialDefinition>();
  for (const m of materials) {
    seen.set(m.code, m);
  }
  const deduped = Array.from(seen.values());

  // Chunk to avoid Supabase request-size and timeout limits
  const allData: MaterialDefinition[] = [];
  for (let i = 0; i < deduped.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + UPSERT_CHUNK_SIZE);
    const dbRows = chunk.map(transformToDbRow);

    const { data, error } = await supabaseAdmin
      .from(TABLES.MATERIALS)
      .upsert(dbRows, { onConflict: "code" })
      .select();

    if (error) {
      return { data: null, error };
    }

    allData.push(...(data?.map(transformToMaterial) ?? []));
  }

  return { data: allData, error: null };
}

/**
 * Delete material by code
 */
export async function deleteMaterial(code: string): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .delete()
    .eq("code", code);

  return { error };
}

/**
 * Delete ALL materials from the database
 */
export async function deleteAllMaterials(): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .delete()
    .not("code", "is", null);

  return { error };
}

/**
 * Get unique categories from materials
 */
export async function getUniqueCategories(): Promise<{
  data: string[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .select("category")
    .order("category", { ascending: true });

  if (error) {
    return { data: null, error };
  }

  const categories = [...new Set(data.map((row: any) => row.category))];
  return { data: categories, error: null };
}
