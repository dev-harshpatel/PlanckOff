import { NextRequest } from 'next/server';
import { withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { restoreLabourRow } from '@/lib/db/labourDatabase';

export const POST = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (_request: NextRequest, _context, params) => {
    const { id } = params;
    if (!id) return errorResponse('id is required', 400);

    const { error } = await restoreLabourRow(id);
    if (error) return errorResponse(error.message, 500);
    return successResponse({ restored: true });
  },
);
