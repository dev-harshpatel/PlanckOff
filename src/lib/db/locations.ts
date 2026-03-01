/**
 * Locations Repository
 * Queries against the countries_provinces lookup table
 */

import { supabaseAdmin } from '@/lib/supabase/server';

export interface ProvinceOption {
  code: string;
  name: string;
}

export async function getProvincesByCountry(countryCode: string): Promise<{
  data: ProvinceOption[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('countries_provinces')
    .select('province_code, province_name')
    .eq('country_code', countryCode)
    .order('sort_order', { ascending: true });

  if (error) return { data: null, error: { message: error.message } };

  // Deduplicate by name in case the migration was run more than once
  const seen = new Set<string>();
  const provinces: ProvinceOption[] = [];
  for (const row of data ?? []) {
    const name = row.province_name as string;
    if (!seen.has(name)) {
      seen.add(name);
      provinces.push({ code: row.province_code as string, name });
    }
  }

  return { data: provinces, error: null };
}
