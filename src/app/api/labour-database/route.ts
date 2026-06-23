import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getAllLabour, getLabourCategories } from '@/lib/db/labourDatabase';

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  if (searchParams.get('meta') === 'categories') {
    const { data, error } = await getLabourCategories();
    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  }

  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const parentSection = searchParams.get('parentSection') ?? '';
  const htBand = searchParams.get('htBand') ?? '';

  const { data, error } = await getAllLabour({ search, category, parentSection, htBand });
  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
});
