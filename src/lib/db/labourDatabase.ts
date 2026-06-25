import { supabaseAdmin } from '@/lib/supabase/server';
import type { LabourDatabaseRow, LabourBandEntry } from '@/types';

// ─── Transformer ──────────────────────────────────────────────────────────────

const toLabourDatabaseRow = (row: Record<string, unknown>): LabourDatabaseRow => ({
  id: row.id as string,
  parentCode: (row.parent_code as string) ?? '',
  parentSection: (row.parent_section as string) ?? '',
  description: (row.description as string) ?? '',
  category: (row.category as string) ?? '',
  labourBands: Array.isArray(row.labour_bands) ? (row.labour_bands as LabourBandEntry[]) : [],
  qty1Formula: (row.qty1_formula as string) ?? '',
  qty1Uom: (row.qty1_uom as string) ?? '',
  notes: (row.notes as string) ?? '',
  deletedAt: (row.deleted_at as string) ?? null,
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getAllLabour(opts?: {
  search?: string;
  category?: string;
  parentSection?: string;
  htBand?: string;
}): Promise<{ data: LabourDatabaseRow[] | null; error: { message: string } | null }> {
  let query = supabaseAdmin.from('labour_database').select('*').is('deleted_at', null);

  if (opts?.parentSection && opts.parentSection !== 'all') {
    query = query.eq('parent_section', opts.parentSection);
  }
  if (opts?.category && opts.category !== 'all') {
    query = query.eq('category', opts.category);
  }
  // Each row always has exactly one band entry — filter on its htBand directly.
  if (opts?.htBand && opts.htBand !== 'all') {
    // Filter rows that have at least one band matching the requested htBand.
    // JSONB @> checks if the array contains an object with htBand == requested value.
    query = query.filter(
      'labour_bands',
      'cs',
      JSON.stringify([{ htBand: opts.htBand }]),
    );
  }
  if (opts?.search?.trim()) {
    const term = opts.search.trim();
    // Search parent code, description, and category.
    // parent_code is the primary key callers (Material form) search by.
    query = query.or(
      `parent_code.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`,
    );
  }

  query = query.order('parent_section').order('parent_code');

  const { data, error } = await query;
  if (error) return { data: null, error: { message: error.message } };
  return { data: (data ?? []).map(toLabourDatabaseRow), error: null };
}

export async function getLabourCategories(): Promise<{
  data: string[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .select('category')
    .is('deleted_at', null)
    .order('category', { ascending: true });

  if (error) return { data: null, error: { message: error.message } };
  const unique = [...new Set((data ?? []).map((r) => r.category as string).filter(Boolean))];
  return { data: unique, error: null };
}

export async function insertLabourRow(row: Record<string, unknown>): Promise<{
  data: LabourDatabaseRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .insert(row)
    .select()
    .single();
  if (error) return { data: null, error: { message: error.message } };
  return { data: toLabourDatabaseRow(data as Record<string, unknown>), error: null };
}

export async function replaceLabourRows(
  idsToDelete: string[],
  rows: Record<string, unknown>[],
): Promise<{
  data: { deleted: number; inserted: number } | null;
  error: { message: string } | null;
}> {
  if (idsToDelete.length > 0) {
    const { error: delError } = await supabaseAdmin
      .from('labour_database')
      .delete()
      .in('id', idsToDelete);
    if (delError) return { data: null, error: { message: delError.message } };
  }

  if (rows.length === 0) return { data: { deleted: idsToDelete.length, inserted: 0 }, error: null };

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from('labour_database').insert(chunk);
    if (error) return { data: null, error: { message: error.message } };
    inserted += chunk.length;
  }

  return { data: { deleted: idsToDelete.length, inserted }, error: null };
}

export async function updateLabourRow(id: string, updates: Record<string, unknown>): Promise<{
  data: LabourDatabaseRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: { message: error.message } };
  return { data: toLabourDatabaseRow(data as Record<string, unknown>), error: null };
}

export async function softDeleteLabourRow(id: string): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('labour_database')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? { message: error.message } : null };
}

export async function restoreLabourRow(id: string): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('labour_database')
    .update({ deleted_at: null })
    .eq('id', id);
  return { error: error ? { message: error.message } : null };
}

export async function getLabourTrash(): Promise<{
  data: LabourDatabaseRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) return { data: null, error: { message: error.message } };
  return { data: (data ?? []).map(toLabourDatabaseRow), error: null };
}

export async function getLabourByParentCode(parentCode: string): Promise<{
  data: LabourDatabaseRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .select('*')
    .eq('parent_code', parentCode)
    .is('deleted_at', null)
    .single();

  if (error) return { data: null, error: { message: error.message } };
  return { data: toLabourDatabaseRow(data as Record<string, unknown>), error: null };
}

export async function purgeExpiredLabourTrash(): Promise<{
  data: { purged: number } | null;
  error: { message: string } | null;
}> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .select('id');

  if (error) return { data: null, error: { message: error.message } };
  return { data: { purged: (data ?? []).length }, error: null };
}
