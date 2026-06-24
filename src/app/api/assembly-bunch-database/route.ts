import { NextRequest } from 'next/server';
import { withAuth, withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getAllAssemblyBunches, getAssemblyBunchGroups, insertAssemblyBunchItem, getAssemblyBunchTrash } from '@/lib/db/assemblyBunchDatabase';

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  if (searchParams.get('trash') === 'true') {
    const { data, error } = await getAssemblyBunchTrash();
    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  }

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

export const POST = withRoleAuth(['Administrator', 'Team Lead'], async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body', 400);

  const branchCode = String(body.branchCode ?? '').trim();
  const group = String(body.group ?? '').trim();
  if (!branchCode) return errorResponse('branchCode is required', 400);
  if (!group) return errorResponse('group is required', 400);

  const row = {
    branch_code: branchCode,
    parent_category: group,
    item_code: String(body.itemCode ?? '').trim(),
    assembly_code: String(body.assemblyCode ?? '').trim(),
    description: String(body.description ?? '').trim(),
    size: String(body.size ?? '').trim(),
    layers: body.layers != null && body.layers !== '' ? Number(body.layers) : null,
    labour_code: String(body.labourCode ?? '').trim(),
    section: String(body.section ?? '').trim(),
    note: String(body.note ?? '').trim(),
    sort_order: Number(body.sortOrder) || 0,
  };

  const { error } = await insertAssemblyBunchItem(row);
  if (error) return errorResponse(error.message, 400);
  return successResponse({ inserted: 1 }, 201);
});
