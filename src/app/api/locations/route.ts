/**
 * Locations API
 * GET /api/locations?country=USA  →  list of provinces/states for that country
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getProvincesByCountry } from '@/lib/db/locations';

const VALID_COUNTRY_CODES = ['USA', 'CA'] as const;

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country');

  if (!country) {
    return NextResponse.json(
      { success: false, error: 'country query parameter is required' },
      { status: 400 }
    );
  }

  if (!VALID_COUNTRY_CODES.includes(country as (typeof VALID_COUNTRY_CODES)[number])) {
    return NextResponse.json(
      { success: false, error: 'Invalid country code. Use USA or CA' },
      { status: 400 }
    );
  }

  const { data, error } = await getProvincesByCountry(country);

  if (error) {
    console.error('Failed to fetch provinces:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch provinces' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
});
