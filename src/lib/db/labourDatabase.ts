import { supabaseAdmin } from '@/lib/supabase/server';
import type { LabourDatabaseRow } from '@/types';

// ─── Transformer ──────────────────────────────────────────────────────────────

const toLabourDatabaseRow = (row: Record<string, unknown>): LabourDatabaseRow => ({
  id: row.id as string,
  parentSection: (row.parent_section as string) ?? '',
  labourCode: (row.labour_code as string) ?? '',
  code: (row.code as string) ?? '',
  description: (row.description as string) ?? '',
  category: (row.category as string) ?? '',
  htBand: (row.ht_band as string) ?? '',
  htMinFt: (row.ht_min_ft as number) ?? 0,
  htMaxFt: (row.ht_max_ft as number) ?? 0,
  uom: (row.uom as string) ?? '',
  ratePerUom: (row.rate_per_uom as number) ?? 0,
  qty1Formula: (row.qty1_formula as string) ?? '',
  qty1Uom: (row.qty1_uom as string) ?? '',
  notes: (row.notes as string) ?? '',
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getAllLabour(opts?: {
  search?: string;
  category?: string;
  parentSection?: string;
  htBand?: string;
}): Promise<{ data: LabourDatabaseRow[] | null; error: { message: string } | null }> {
  let query = supabaseAdmin.from('labour_database').select('*');

  if (opts?.parentSection && opts.parentSection !== 'all') {
    query = query.eq('parent_section', opts.parentSection);
  }
  if (opts?.category && opts.category !== 'all') {
    query = query.eq('category', opts.category);
  }
  if (opts?.htBand && opts.htBand !== 'all') {
    query = query.eq('ht_band', opts.htBand);
  }
  if (opts?.search?.trim()) {
    const term = opts.search.trim();
    query = query.or(
      `labour_code.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`,
    );
  }

  query = query.order('parent_section').order('category').order('ht_band');

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
    .order('category', { ascending: true });

  if (error) return { data: null, error: { message: error.message } };
  const unique = [...new Set((data ?? []).map((r) => r.category as string).filter(Boolean))];
  return { data: unique, error: null };
}

export async function getLabourByCode(labourCode: string): Promise<{
  data: LabourDatabaseRow[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('labour_database')
    .select('*')
    .eq('labour_code', labourCode)
    .order('ht_band');

  if (error) return { data: null, error: { message: error.message } };
  return { data: (data ?? []).map(toLabourDatabaseRow), error: null };
}
