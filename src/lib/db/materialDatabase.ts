import { supabaseAdmin } from '@/lib/supabase/server';
import type { MaterialDatabaseRow, PaginatedResponse } from '@/types';

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
  size: (row.size as string) ?? '',
  sizeNum: (row.size_num as number) ?? 0,
  sizeMm: row.size_mm as number | null,
  sizeImperial: row.size_imperial as string | null,
  unitPrice: (row.unit_price as number) ?? 0,
  containerUnit: (row.container_unit as string) ?? '',
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

  let query = supabaseAdmin.from('material_database').select('*', { count: 'exact' });

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
    .order('parent_section', { ascending: true })
    .order('row_num', { ascending: true });

  if (error) return { data: null, error: { message: error.message } };
  return { data: (data ?? []).map(toMaterialDatabaseRow), error: null };
}
