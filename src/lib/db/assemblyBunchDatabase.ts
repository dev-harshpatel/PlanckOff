import { supabaseAdmin } from '@/lib/supabase/server';
import type { AssemblyBunchItem, AssemblyBunchBranch } from '@/types';

// ─── Transformer ──────────────────────────────────────────────────────────────

const toAssemblyBunchItem = (row: Record<string, unknown>): AssemblyBunchItem => ({
  assemblyCode: (row.assembly_code as string) ?? '',
  itemCode: (row.item_code as string) ?? '',
  section: (row.section as string) ?? '',
  layers: row.layers as number | null,
  description: (row.description as string) ?? '',
  size: (row.size as string) ?? '',
  labourCode: (row.labour_code as string) ?? '',
  note: (row.note as string) ?? '',
  sortOrder: (row.sort_order as number) ?? 0,
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
    .order('parent_category');

  if (error) return { data: null, error: { message: error.message } };
  const unique = [...new Set((data ?? []).map((r) => r.parent_category as string).filter(Boolean))];
  return { data: unique, error: null };
}
