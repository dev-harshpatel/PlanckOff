import { NextRequest } from 'next/server';
import { withAuth, withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getAllLabour, getLabourCategories, insertLabourRow, getLabourTrash } from '@/lib/db/labourDatabase';
import type { LabourBandEntry } from '@/types';

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  if (searchParams.get('trash') === 'true') {
    const { data, error } = await getLabourTrash();
    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  }

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

export const POST = withRoleAuth(['Administrator', 'Team Lead'], async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body', 400);

  const parentSection = String(body.parentSection ?? '').trim();
  const category = String(body.category ?? '').trim();
  const description = String(body.description ?? '').trim();
  if (!parentSection) return errorResponse('parentSection is required', 400);
  if (!category) return errorResponse('category is required', 400);

  const labourBands: LabourBandEntry[] = Array.isArray(body.labourBands) ? body.labourBands : [];

  const row = {
    parent_section: parentSection,
    description,
    category,
    labour_bands: labourBands,
    qty1_formula: String(body.qty1Formula ?? '').trim(),
    qty1_uom: String(body.qty1Uom ?? '').trim(),
    notes: String(body.notes ?? '').trim(),
  };

  const { data, error } = await insertLabourRow(row);
  if (error) return errorResponse(error.message, 400);
  return successResponse(data, 201);
});
