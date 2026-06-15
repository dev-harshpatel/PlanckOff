import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-helpers';
import {
  getProjectOverrideMap,
  upsertMaterialOverride,
  deleteFieldOverride,
  deleteAllOverridesForMaterial,
  deleteAllProjectOverrides,
} from '@/lib/db/projectMaterialOverrides';
import type { OverrideableField } from '@/types/core/projectOverrides';

// GET /api/projects/[id]/material-overrides
export const GET = withAuth(async (_req: NextRequest, _ctx, params) => {
  const id = params?.id as string | undefined;
  if (!id) return NextResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });

  const { data, error } = await getProjectOverrideMap(id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
});

// PATCH /api/projects/[id]/material-overrides
// Body: { materialCode: string, field: OverrideableField, value: unknown }
//    or { materialCode: string, updates: Array<{ field: OverrideableField, value: unknown }> }
export const PATCH = withAuth(async (request: NextRequest, _ctx, params) => {
  const id = params?.id as string | undefined;
  if (!id) return NextResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });

  const { materialCode, field, value } = body as {
    materialCode?: string;
    field?: string;
    value?: unknown;
    updates?: Array<{ field?: string; value?: unknown }>;
  };

  if (!materialCode) return NextResponse.json({ success: false, error: 'materialCode is required' }, { status: 400 });
  const updates = Array.isArray(body.updates)
    ? body.updates
        .filter((update: { field?: string; value?: unknown } | null | undefined): update is { field: string; value: unknown } =>
          Boolean(update?.field) && update?.value !== undefined,
        )
    : field && value !== undefined
      ? [{ field, value }]
      : [];

  if (updates.length === 0) {
    return NextResponse.json(
      { success: false, error: 'field/value or updates[] is required' },
      { status: 400 },
    );
  }

  for (const update of updates) {
    const { error } = await upsertMaterialOverride(
      id,
      materialCode,
      update.field as OverrideableField,
      update.value as never,
    );
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { materialCode, updates } });
});

// DELETE /api/projects/[id]/material-overrides
// Body: { materialCode: string, field?: OverrideableField } — delete one material's overrides
// Body: { materialCode: string, fields?: OverrideableField[] } — delete selected fields
// Body: {} (no materialCode) — delete ALL overrides for the project (used on pipeline re-run)
export const DELETE = withAuth(async (request: NextRequest, _ctx, params) => {
  const id = params?.id as string | undefined;
  if (!id) return NextResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });

  const body = await request.json().catch(() => null);
  const materialCode = body?.materialCode as string | undefined;
  const field        = body?.field as OverrideableField | undefined;
  const fields       = Array.isArray(body?.fields)
    ? (body.fields.filter(Boolean) as OverrideableField[])
    : undefined;

  // No materialCode → wipe all overrides for the project
  if (!materialCode) {
    const { error } = await deleteAllProjectOverrides(id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: null });
  }

  if (fields && fields.length > 0) {
    for (const currentField of fields) {
      const { error } = await deleteFieldOverride(id, materialCode, currentField);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { materialCode, fields } });
  }

  const { error } = field
    ? await deleteFieldOverride(id, materialCode, field)
    : await deleteAllOverridesForMaterial(id, materialCode);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data: null });
});
