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
  per: row.per,
  priceUpdated: row.price_updated,
  category: row.category,
  width: row.width,
  gauge: row.gauge,
  flange: row.flange,
  productivity: row.productivity ? parseFloat(row.productivity) : undefined,
  hourlyRate: row.hourly_rate ? parseFloat(row.hourly_rate) : undefined,
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
  per: material.per,
  price_updated: material.priceUpdated || new Date().toLocaleDateString(),
  category: material.category,
  width: material.width,
  gauge: material.gauge,
  flange: material.flange,
  productivity: material.productivity,
  hourly_rate: material.hourlyRate,
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
  if (updates.width !== undefined) dbUpdates.width = updates.width;
  if (updates.gauge !== undefined) dbUpdates.gauge = updates.gauge;
  if (updates.flange !== undefined) dbUpdates.flange = updates.flange;
  if (updates.productivity !== undefined)
    dbUpdates.productivity = updates.productivity;
  if (updates.hourlyRate !== undefined)
    dbUpdates.hourly_rate = updates.hourlyRate;

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

  const dbRows = deduped.map(transformToDbRow);

  const { data, error } = await supabaseAdmin
    .from(TABLES.MATERIALS)
    .upsert(dbRows, { onConflict: "code" })
    .select();

  if (error) {
    return { data: null, error };
  }

  const transformedData = data?.map(transformToMaterial) || [];
  return { data: transformedData, error: null };
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
