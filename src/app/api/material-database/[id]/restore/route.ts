import { NextRequest } from 'next/server';
import { withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { restoreMaterialRow } from '@/lib/db/materialDatabase';

export const POST = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (_request: NextRequest, _context, params) => {
    const { id } = params;
    if (!id) return errorResponse('id is required', 400);

    const { error } = await restoreMaterialRow(id);
    if (error) return errorResponse(error.message, 500);
    return successResponse({ restored: true });
  },
);
