import { supabaseAdmin } from '@/lib/supabase/server';
import type { ProjectOverrideMap, OverrideableField, OverrideValues } from '@/types/core/projectOverrides';

const TABLE = 'project_material_overrides';

/**
 * Load all overrides for a project as a map keyed by material_code.
 * Returns an empty map when no overrides exist — safe to spread everywhere.
 */
export async function getProjectOverrideMap(projectId: string): Promise<{
  data: ProjectOverrideMap | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('material_code, overrides')
    .eq('project_id', projectId);

  if (error) return { data: null, error: { message: error.message } };

  const map: ProjectOverrideMap = {};
  (data ?? []).forEach((row: { material_code: string; overrides: OverrideValues }) => {
    map[row.material_code] = row.overrides;
  });

  return { data: map, error: null };
}

/**
 * Atomically upsert a single field override.
 * Uses a Postgres RPC to merge only the changed key into the existing JSONB.
 */
export async function upsertMaterialOverride(
  projectId: string,
  materialCode: string,
  field: OverrideableField,
  value: OverrideValues[OverrideableField],
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin.rpc('upsert_material_override', {
    p_project_id:    projectId,
    p_material_code: materialCode,
    p_field:         field,
    p_value:         JSON.stringify(value),
  });

  return { error: error ? { message: error.message } : null };
}

/**
 * Remove a single field override, reverting that field to the global DB value.
 */
export async function deleteFieldOverride(
  projectId: string,
  materialCode: string,
  field: OverrideableField,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin.rpc('delete_material_override_field', {
    p_project_id:    projectId,
    p_material_code: materialCode,
    p_field:         field,
  });

  return { error: error ? { message: error.message } : null };
}

/**
 * Delete ALL overrides for every material in a project (used on pipeline re-run / overwrite).
 */
export async function deleteAllProjectOverrides(
  projectId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('project_id', projectId);

  return { error: error ? { message: error.message } : null };
}

/**
 * Delete ALL field overrides for a material in a project (full revert to global).
 */
export async function deleteAllOverridesForMaterial(
  projectId: string,
  materialCode: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('project_id', projectId)
    .eq('material_code', materialCode);

  return { error: error ? { message: error.message } : null };
}
