import { NextRequest } from 'next/server';
import { withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { updateMaterialRow, softDeleteMaterialRow } from '@/lib/db/materialDatabase';
import { computeKeywords } from '@/lib/utils/databaseImportParsers';
import type { SizeEntry } from '@/types';

export const PATCH = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (request: NextRequest, _context, params) => {
    const { id } = params;
    if (!id) return errorResponse('id is required', 400);

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

    const updates = {
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

    const { data, error } = await updateMaterialRow(id, updates);
    if (error) return errorResponse(error.message, 400);
    return successResponse(data);
  },
);

export const DELETE = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (_request: NextRequest, _context, params) => {
    const { id } = params;
    if (!id) return errorResponse('id is required', 400);

    const { error } = await softDeleteMaterialRow(id);
    if (error) return errorResponse(error.message, 500);
    return successResponse({ deleted: true });
  },
);
