import { NextRequest } from 'next/server';
import { withAuth, withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getMaterialsPaginated, getMaterialCategories, getNextRowNumForCategory, insertMaterialRow, getMaterialsTrash } from '@/lib/db/materialDatabase';
import { computeKeywords } from '@/lib/utils/databaseImportParsers';
import type { SizeEntry } from '@/types';

export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  if (searchParams.get('trash') === 'true') {
    const { data, error } = await getMaterialsTrash();
    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  }

  if (searchParams.get('meta') === 'categories') {
    const { data, error } = await getMaterialCategories();
    if (error) return errorResponse(error.message, 500);
    return successResponse(data);
  }

  if (searchParams.get('meta') === 'nextRowNum') {
    const category = searchParams.get('category') ?? '';
    if (!category) return errorResponse('category is required', 400);
    const { data, error } = await getNextRowNumForCategory(category);
    if (error) return errorResponse(error.message, 500);
    return successResponse({ rowNum: data });
  }

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);
  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const parentSection = searchParams.get('parentSection') ?? '';

  const { data, error } = await getMaterialsPaginated({ page, pageSize, search, category, parentSection });
  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
});

export const POST = withRoleAuth(['Administrator', 'Team Lead'], async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body', 400);

  const code = String(body.code ?? '').trim();
  const parentSection = String(body.parentSection ?? '').trim();
  if (!code) return errorResponse('code is required', 400);
  if (!parentSection) return errorResponse('parentSection is required', 400);

  const category = String(body.category ?? '').trim();
  const type = String(body.type ?? '').trim();
  const description = String(body.description ?? '').trim();
  const wallLabourCode = String(body.wallLabourCode ?? '').trim();
  const ceilingLabourCode = String(body.ceilingLabourCode ?? '').trim();
  const sizes: SizeEntry[] = Array.isArray(body.sizes) ? body.sizes : [];

  const firstSize = sizes[0];
  const searchKeywords = computeKeywords([
    category, type, description,
    firstSize?.sizeImperial ?? null,
    firstSize?.sizeMm != null ? `${firstSize.sizeMm}mm` : null,
    wallLabourCode, ceilingLabourCode,
  ]);

  const row = {
    parent_section: parentSection,
    category,
    assembly_code: String(body.assemblyCode ?? '').trim(),
    code,
    wall_labour_code: wallLabourCode,
    ceiling_labour_code: ceilingLabourCode,
    bulkhead_labour_code: String(body.bulkheadLabourCode ?? '').trim(),
    type,
    description,
    section: String(body.section ?? '').trim(),
    sizes_data: sizes,
    unit_price: Number(body.unitPrice) || 0,
    qty1_formula: String(body.qty1Formula ?? '').trim(),
    uom1: String(body.uom1 ?? '').trim(),
    qty2_formula: String(body.qty2Formula ?? '').trim(),
    uom2: String(body.uom2 ?? '').trim(),
    qty1_formula_ceiling: String(body.qty1FormulaCeiling ?? '').trim(),
    uom1_ceiling: String(body.uom1Ceiling ?? '').trim(),
    qty2_formula_ceiling: String(body.qty2FormulaCeiling ?? '').trim(),
    uom2_ceiling: String(body.uom2Ceiling ?? '').trim(),
    notes: String(body.notes ?? '').trim(),
    search_keywords: searchKeywords,
  };

  const { data, error } = await insertMaterialRow(row);
  if (error) return errorResponse(error.message, 400);
  return successResponse(data, 201);
});
