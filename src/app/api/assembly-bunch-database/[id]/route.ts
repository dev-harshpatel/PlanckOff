import { NextRequest } from 'next/server';
import { withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { updateAssemblyBunchItem, softDeleteAssemblyBunchItem } from '@/lib/db/assemblyBunchDatabase';

export const PATCH = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (request: NextRequest, _context, params) => {
    const { id } = params;
    if (!id) return errorResponse('id is required', 400);

    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const branchCode = String(body.branchCode ?? '').trim();
    const group = String(body.group ?? '').trim();
    if (!branchCode) return errorResponse('branchCode is required', 400);
    if (!group) return errorResponse('group is required', 400);

    const updates = {
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

    const { data, error } = await updateAssemblyBunchItem(id, updates);
    if (error) return errorResponse(error.message, 400);
    return successResponse(data);
  },
);

export const DELETE = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (_request: NextRequest, _context, params) => {
    const { id } = params;
    if (!id) return errorResponse('id is required', 400);

    const { error } = await softDeleteAssemblyBunchItem(id);
    if (error) return errorResponse(error.message, 500);
    return successResponse({ deleted: true });
  },
);
