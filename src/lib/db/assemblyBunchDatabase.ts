import { supabaseAdmin } from '@/lib/supabase/server';
import type { AssemblyBunchItem, AssemblyBunchBranch } from '@/types';

// ─── Transformer ──────────────────────────────────────────────────────────────

const toAssemblyBunchItem = (row: Record<string, unknown>): AssemblyBunchItem => ({
  id: row.id as string,
  assemblyCode: (row.assembly_code as string) ?? '',
  itemCode: (row.item_code as string) ?? '',
  section: (row.section as string) ?? '',
  layers: row.layers as number | null,
  description: (row.description as string) ?? '',
  size: (row.size as string) ?? '',
  labourCode: (row.labour_code as string) ?? '',
  note: (row.note as string) ?? '',
  sortOrder: (row.sort_order as number) ?? 0,
  deletedAt: (row.deleted_at as string) ?? null,
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getAllAssemblyBunches(opts?: {
  search?: string;
  group?: string;
  branchCode?: string;
}): Promise<{ data: AssemblyBunchBranch[] | null; error: { message: string } | null }> {
  let query = supabaseAdmin
    .from('assembly_bunch_database')
    .select('*')
    .is('deleted_at', null)
    .order('parent_category')
    .order('branch_code')
    .order('sort_order');

  if (opts?.group && opts.group !== 'all') {
    query = query.eq('parent_category', opts.group);
  }
  if (opts?.branchCode && opts.branchCode !== 'all') {
    query = query.eq('branch_code', opts.branchCode);
  }
  if (opts?.search?.trim()) {
    const term = opts.search.trim();
    query = query.or(
      `branch_code.ilike.%${term}%,description.ilike.%${term}%,item_code.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) return { data: null, error: { message: error.message } };

  // Group rows into AssemblyBunchBranch[]
  const branchMap = new Map<string, AssemblyBunchBranch>();
  for (const row of data ?? []) {
    const branchCode = (row.branch_code as string) ?? '';
    const group = (row.parent_category as string) ?? '';
    if (!branchMap.has(branchCode)) {
      branchMap.set(branchCode, { branchCode, group, items: [] });
    }
    branchMap.get(branchCode)!.items.push(toAssemblyBunchItem(row as Record<string, unknown>));
  }

  return { data: [...branchMap.values()], error: null };
}

export async function getAssemblyBunchGroups(): Promise<{
  data: string[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .select('parent_category')
    .is('deleted_at', null)
    .order('parent_category');

  if (error) return { data: null, error: { message: error.message } };
  const unique = [...new Set((data ?? []).map((r) => r.parent_category as string).filter(Boolean))];
  return { data: unique, error: null };
}

export async function insertAssemblyBunchItem(row: Record<string, unknown>): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .insert(row);
  return { error: error ? { message: error.message } : null };
}

export async function replaceAssemblyBranchRows(
  branchCodes: string[],
  rows: Record<string, unknown>[],
): Promise<{
  data: { deleted: number; inserted: number } | null;
  error: { message: string } | null;
}> {
  if (branchCodes.length === 0) return { data: { deleted: 0, inserted: 0 }, error: null };

  // Delete existing rows for each branch being replaced
  const { error: delError } = await supabaseAdmin
    .from('assembly_bunch_database')
    .delete()
    .in('branch_code', branchCodes);

  if (delError) return { data: null, error: { message: delError.message } };

  if (rows.length === 0) return { data: { deleted: 0, inserted: 0 }, error: null };

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from('assembly_bunch_database').insert(chunk);
    if (error) return { data: null, error: { message: error.message } };
    inserted += chunk.length;
  }

  return { data: { deleted: branchCodes.length, inserted }, error: null };
}

export async function updateAssemblyBunchItem(id: string, updates: Record<string, unknown>): Promise<{
  data: AssemblyBunchItem | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: { message: error.message } };
  return { data: toAssemblyBunchItem(data as Record<string, unknown>), error: null };
}

export async function softDeleteAssemblyBunchItem(id: string): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? { message: error.message } : null };
}

export async function restoreAssemblyBunchItem(id: string): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .update({ deleted_at: null })
    .eq('id', id);
  return { error: error ? { message: error.message } : null };
}

export async function getAssemblyBunchTrash(): Promise<{
  data: (AssemblyBunchItem & { branchCode: string; group: string })[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) return { data: null, error: { message: error.message } };
  return {
    data: (data ?? []).map((row) => ({
      ...toAssemblyBunchItem(row as Record<string, unknown>),
      branchCode: (row.branch_code as string) ?? '',
      group: (row.parent_category as string) ?? '',
    })),
    error: null,
  };
}

export async function purgeExpiredAssemblyBunchTrash(): Promise<{
  data: { purged: number } | null;
  error: { message: string } | null;
}> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('assembly_bunch_database')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .select('id');

  if (error) return { data: null, error: { message: error.message } };
  return { data: { purged: (data ?? []).length }, error: null };
}
