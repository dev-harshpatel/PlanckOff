import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getAllAssemblyBunches, getAssemblyBunchGroups } from '@/lib/db/assemblyBunchDatabase';

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  if (searchParams.get('meta') === 'groups') {
    const { data, error } = await getAssemblyBunchGroups();
    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  }

  const search = searchParams.get('search') ?? '';
  const group = searchParams.get('group') ?? '';
  const branchCode = searchParams.get('branchCode') ?? '';

  const { data, error } = await getAllAssemblyBunches({ search, group, branchCode });
  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
});
