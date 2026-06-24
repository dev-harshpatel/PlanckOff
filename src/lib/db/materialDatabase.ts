import { supabaseAdmin } from '@/lib/supabase/server';
import type { MaterialDatabaseRow, SizeEntry, PaginatedResponse } from '@/types';

// ─── Transformer ──────────────────────────────────────────────────────────────

const toMaterialDatabaseRow = (row: Record<string, unknown>): MaterialDatabaseRow => ({
  id: row.id as string,
  parentSection: (row.parent_section as string) ?? '',
  rowNum: row.row_num as number | null,
  category: (row.category as string) ?? '',
  assemblyCode: (row.assembly_code as string) ?? '',
  code: (row.code as string) ?? '',
  wallLabourCode: (row.wall_labour_code as string) ?? '',
  ceilingLabourCode: (row.ceiling_labour_code as string) ?? '',
  bulkheadLabourCode: (row.bulkhead_labour_code as string) ?? '',
  type: (row.type as string) ?? '',
  description: (row.description as string) ?? '',
  section: (row.section as string) ?? '',
  sizes: Array.isArray(row.sizes_data) ? (row.sizes_data as SizeEntry[]) : [],
  unitPrice: (row.unit_price as number) ?? 0,
  qty1Formula: (row.qty1_formula as string) ?? '',
  uom1: (row.uom1 as string) ?? '',
  qty2Formula: (row.qty2_formula as string) ?? '',
  uom2: (row.uom2 as string) ?? '',
  qty1FormulaCeiling: (row.qty1_formula_ceiling as string) ?? '',
  uom1Ceiling: (row.uom1_ceiling as string) ?? '',
  qty2FormulaCeiling: (row.qty2_formula_ceiling as string) ?? '',
  uom2Ceiling: (row.uom2_ceiling as string) ?? '',
  notes: (row.notes as string) ?? '',
  searchKeywords: (row.search_keywords as string[]) ?? [],
  deletedAt: (row.deleted_at as string) ?? null,
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getMaterialsPaginated(opts: {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  parentSection?: string;
}): Promise<{ data: PaginatedResponse<MaterialDatabaseRow> | null; error: { message: string } | null }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin.from('material_database').select('*', { count: 'exact' }).is('deleted_at', null);

  if (opts.parentSection && opts.parentSection !== 'all') {
    query = query.eq('parent_section', opts.parentSection);
  }
  if (opts.category && opts.category !== 'all') {
    query = query.eq('category', opts.category);
  }
  if (opts.search?.trim()) {
    const term = opts.search.trim();
    query = query.or(
      `code.ilike.%${term}%,description.ilike.%${term}%,type.ilike.%${term}%,category.ilike.%${term}%`,
    );
  }

  query = query
    .order('parent_section', { ascending: true })
    .order('row_num', { ascending: true })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) return { data: null, error: { message: error.message } };

  const total = count ?? 0;
  return {
    data: {
      data: (data ?? []).map(toMaterialDatabaseRow),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
    error: null,
  };
}

export async function getMaterialCategories(): Promise<{
  data: string[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .select('category')
    .is('deleted_at', null)
    .order('category', { ascending: true });

  if (error) return { data: null, error: { message: error.message } };

  const unique = [...new Set((data ?? []).map((r) => r.category as string).filter(Boolean))];
  return { data: unique, error: null };
}

export async function getMaterialByCode(code: string): Promise<{
  data: MaterialDatabaseRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .select('*')
    .eq('code', code)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: null };
  return { data: toMaterialDatabaseRow(data as Record<string, unknown>), error: null };
}

export async function getAllMaterialRows(): Promise<{
  data: MaterialDatabaseRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .select('*')
    .is('deleted_at', null)
    .order('parent_section', { ascending: true })
    .order('row_num', { ascending: true });

  if (error) return { data: null, error: { message: error.message } };
  return { data: (data ?? []).map(toMaterialDatabaseRow), error: null };
}

export async function getNextRowNumForCategory(category: string): Promise<{
  data: number | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .select('row_num')
    .eq('category', category)
    .order('row_num', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  const maxNum = (data as Record<string, unknown> | null)?.row_num;
  return { data: typeof maxNum === 'number' ? maxNum + 1 : 1, error: null };
}

export async function insertMaterialRow(row: Record<string, unknown>): Promise<{
  data: MaterialDatabaseRow | null;
  error: { message: string } | null;
}> {
  const category = row.category as string | undefined;
  if (category) {
    const { data: maxRow } = await supabaseAdmin
      .from('material_database')
      .select('row_num')
      .eq('category', category)
      .order('row_num', { ascending: false })
      .limit(1)
      .maybeSingle();
    const maxNum = (maxRow as Record<string, unknown> | null)?.row_num;
    row = { ...row, row_num: typeof maxNum === 'number' ? maxNum + 1 : 1 };
  }

  const { data, error } = await supabaseAdmin
    .from('material_database')
    .insert(row)
    .select()
    .single();
  if (error) return { data: null, error: { message: error.message } };
  return { data: toMaterialDatabaseRow(data as Record<string, unknown>), error: null };
}

export async function upsertMaterialRows(rows: Record<string, unknown>[]): Promise<{
  data: { inserted: number } | null;
  error: { message: string } | null;
}> {
  if (rows.length === 0) return { data: { inserted: 0 }, error: null };

  const codes = rows.map((r) => r.code as string).filter(Boolean);

  const { error: delError } = await supabaseAdmin
    .from('material_database')
    .delete()
    .in('code', codes);

  if (delError) return { data: null, error: { message: delError.message } };

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from('material_database').insert(chunk);
    if (error) return { data: null, error: { message: error.message } };
    inserted += chunk.length;
  }

  return { data: { inserted }, error: null };
}

export async function updateMaterialRow(id: string, updates: Record<string, unknown>): Promise<{
  data: MaterialDatabaseRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: { message: error.message } };
  return { data: toMaterialDatabaseRow(data as Record<string, unknown>), error: null };
}

export async function softDeleteMaterialRow(id: string): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('material_database')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? { message: error.message } : null };
}

export async function restoreMaterialRow(id: string): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('material_database')
    .update({ deleted_at: null })
    .eq('id', id);
  return { error: error ? { message: error.message } : null };
}

export async function getMaterialsTrash(): Promise<{
  data: MaterialDatabaseRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) return { data: null, error: { message: error.message } };
  return { data: (data ?? []).map(toMaterialDatabaseRow), error: null };
}

export async function purgeExpiredMaterialTrash(): Promise<{
  data: { purged: number } | null;
  error: { message: string } | null;
}> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('material_database')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .select('id');

  if (error) return { data: null, error: { message: error.message } };
  return { data: { purged: (data ?? []).length }, error: null };
}
