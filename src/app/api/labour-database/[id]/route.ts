import { NextRequest } from 'next/server';
import { withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { updateLabourRow, softDeleteLabourRow } from '@/lib/db/labourDatabase';
import type { LabourBandEntry } from '@/types';

export const PATCH = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (request: NextRequest, _context, params) => {
    const { id } = params;
    if (!id) return errorResponse('id is required', 400);

    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const parentSection = String(body.parentSection ?? '').trim();
    const category = String(body.category ?? '').trim();
    if (!parentSection) return errorResponse('parentSection is required', 400);
    if (!category) return errorResponse('category is required', 400);

    const labourBands: LabourBandEntry[] = Array.isArray(body.labourBands) ? body.labourBands : [];

    const updates = {
      parent_section: parentSection,
      description: String(body.description ?? '').trim(),
      category,
      labour_bands: labourBands,
      qty1_formula: String(body.qty1Formula ?? '').trim(),
      qty1_uom: String(body.qty1Uom ?? '').trim(),
      notes: String(body.notes ?? '').trim(),
    };

    const { data, error } = await updateLabourRow(id, updates);
    if (error) return errorResponse(error.message, 400);
    return successResponse(data);
  },
);

export const DELETE = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (_request: NextRequest, _context, params) => {
    const { id } = params;
    if (!id) return errorResponse('id is required', 400);

    const { error } = await softDeleteLabourRow(id);
    if (error) return errorResponse(error.message, 500);
    return successResponse({ deleted: true });
  },
);
