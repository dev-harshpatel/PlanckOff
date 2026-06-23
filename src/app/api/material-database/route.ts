import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getMaterialsPaginated, getMaterialCategories } from '@/lib/db/materialDatabase';

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  // Return only categories if requested
  if (searchParams.get('meta') === 'categories') {
    const { data, error } = await getMaterialCategories();
    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  }

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);
  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const parentSection = searchParams.get('parentSection') ?? '';

  const { data, error } = await getMaterialsPaginated({
    page,
    pageSize,
    search,
    category,
    parentSection,
  });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
});
