import { NextRequest } from 'next/server';
import { withRoleAuth } from '@/lib/auth/api-helpers';
import { successResponse, errorResponse } from '@/lib/api/response';
import { getAllMaterialRows, upsertMaterialRows } from '@/lib/db/materialDatabase';
import { getAllLabour, replaceLabourRows } from '@/lib/db/labourDatabase';
import { getAllAssemblyBunches, replaceAssemblyBranchRows } from '@/lib/db/assemblyBunchDatabase';
import type { SizeEntry, LabourBandEntry } from '@/types';

// ─── Comparison helpers ───────────────────────────────────────────────────────

function normalizeVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).sort().join(',');
  return String(v).trim();
}

function fingerprintSizes(sizes: SizeEntry[] | undefined): string {
  return (sizes ?? [])
    .map((s) => [s.size, s.sizeNum, s.containerUnit, s.sizeMm, s.sizeImperial].join('|'))
    .sort()
    .join(';;');
}

function fingerprintLabourBands(bands: LabourBandEntry[] | undefined): string {
  return (bands ?? [])
    .map((b) => [b.labourCode, b.code, b.htBand, b.htMinFt, b.htMaxFt, b.uom, b.ratePerUom].join('|'))
    .sort()
    .join(';;');
}

interface ImportResult {
  added: number;
  updated: number;
  unchanged: number;
  total: number;
}

interface AssemblyImportResult {
  branchesReplaced: number;
  branchesUnchanged: number;
  rowsInserted: number;
  total: number;
}

// ─── Material import ──────────────────────────────────────────────────────────

// Materials are NOT deduped by code alone — the same code can legitimately
// appear on multiple Excel rows, one per size variant (e.g. a furring
// channel sold in 10' and 16' lengths keeps the same CODE). Each parsed row
// always carries exactly one sizes_data entry, so "code + size" is the
// actual unique identity of a row.
function materialRowKey(code: string, sizes: SizeEntry[] | undefined): string {
  return `${code}|${sizes?.[0]?.size ?? ''}`;
}

async function importMaterials(rows: Record<string, unknown>[]): Promise<ImportResult> {
  const { data: existing, error } = await getAllMaterialRows();
  if (error) throw new Error(error.message);

  const existingMap = new Map(
    (existing ?? []).map((r) => [materialRowKey(r.code, r.sizes), r]),
  );

  const stats: ImportResult = { added: 0, updated: 0, unchanged: 0, total: rows.length };

  // upsertMaterialRows deletes ALL existing rows for a given `code`, then
  // re-inserts whatever is passed to it. So if any row for a code is
  // added/changed, EVERY uploaded row sharing that code must go into
  // toUpsert too — otherwise unchanged sibling size-rows (same code,
  // different size) would be deleted by that code-match and never
  // reinserted, since they weren't in the upsert batch.
  const codesTouched = new Set<string>();
  const rowsByCode = new Map<string, Record<string, unknown>[]>();

  for (const uploaded of rows) {
    const code = String(uploaded.code ?? '');
    if (!code) continue;
    if (!rowsByCode.has(code)) rowsByCode.set(code, []);
    rowsByCode.get(code)!.push(uploaded);

    const key = materialRowKey(code, uploaded.sizes_data as SizeEntry[]);
    const existing = existingMap.get(key);
    if (!existing) {
      stats.added++;
      codesTouched.add(code);
      continue;
    }

    const changed =
      normalizeVal(existing.description) !== normalizeVal(uploaded.description) ||
      normalizeVal(existing.type) !== normalizeVal(uploaded.type) ||
      normalizeVal(existing.category) !== normalizeVal(uploaded.category) ||
      normalizeVal(existing.assemblyCode) !== normalizeVal(uploaded.assembly_code) ||
      normalizeVal(existing.wallLabourCode) !== normalizeVal(uploaded.wall_labour_code) ||
      normalizeVal(existing.ceilingLabourCode) !== normalizeVal(uploaded.ceiling_labour_code) ||
      normalizeVal(existing.bulkheadLabourCode) !== normalizeVal(uploaded.bulkhead_labour_code) ||
      normalizeVal(existing.section) !== normalizeVal(uploaded.section) ||
      fingerprintSizes(existing.sizes) !== fingerprintSizes(uploaded.sizes_data as SizeEntry[]) ||
      normalizeVal(existing.unitPrice) !== normalizeVal(uploaded.unit_price) ||
      normalizeVal(existing.qty1Formula) !== normalizeVal(uploaded.qty1_formula) ||
      normalizeVal(existing.uom1) !== normalizeVal(uploaded.uom1) ||
      normalizeVal(existing.qty2Formula) !== normalizeVal(uploaded.qty2_formula) ||
      normalizeVal(existing.uom2) !== normalizeVal(uploaded.uom2) ||
      normalizeVal(existing.qty1FormulaCeiling) !== normalizeVal(uploaded.qty1_formula_ceiling) ||
      normalizeVal(existing.uom1Ceiling) !== normalizeVal(uploaded.uom1_ceiling) ||
      normalizeVal(existing.qty2FormulaCeiling) !== normalizeVal(uploaded.qty2_formula_ceiling) ||
      normalizeVal(existing.uom2Ceiling) !== normalizeVal(uploaded.uom2_ceiling) ||
      normalizeVal(existing.notes) !== normalizeVal(uploaded.notes);

    if (changed) {
      stats.updated++;
      codesTouched.add(code);
    } else {
      stats.unchanged++;
    }
  }

  const toUpsert = [...codesTouched].flatMap((code) => rowsByCode.get(code) ?? []);

  if (toUpsert.length > 0) {
    const { error: upsertErr } = await upsertMaterialRows(toUpsert);
    if (upsertErr) throw new Error(upsertErr.message);
  }

  return stats;
}

// ─── Labour import ────────────────────────────────────────────────────────────

// Labour rows are NOT deduped by category+description alone — the same
// category+description can legitimately appear on multiple Excel rows, one
// per height band (e.g. "Standard" vs "High"). Each parsed row always
// carries exactly one labour_bands entry, so adding htBand makes the key
// unique per row, same as it was per-row in the original sheet.
function labourRowKey(category: unknown, description: unknown, bands: LabourBandEntry[] | undefined): string {
  return `${category}|${description}|${bands?.[0]?.htBand ?? ''}`;
}

async function importLabour(rows: Record<string, unknown>[]): Promise<ImportResult> {
  const { data: existing, error } = await getAllLabour();
  if (error) throw new Error(error.message);

  const existingMap = new Map(
    (existing ?? []).map((r) => [labourRowKey(r.category, r.description, r.labourBands), r]),
  );

  const stats: ImportResult = { added: 0, updated: 0, unchanged: 0, total: rows.length };
  const idsToDelete: string[] = [];
  const toInsert: Record<string, unknown>[] = [];

  for (const uploaded of rows) {
    const key = labourRowKey(uploaded.category, uploaded.description, uploaded.labour_bands as LabourBandEntry[]);
    const existing = existingMap.get(key);
    if (!existing) {
      stats.added++;
      toInsert.push(uploaded);
    } else {
      const changed =
        normalizeVal(existing.parentSection) !== normalizeVal(uploaded.parent_section) ||
        fingerprintLabourBands(existing.labourBands) !== fingerprintLabourBands(uploaded.labour_bands as LabourBandEntry[]) ||
        normalizeVal(existing.qty1Formula) !== normalizeVal(uploaded.qty1_formula) ||
        normalizeVal(existing.qty1Uom) !== normalizeVal(uploaded.qty1_uom) ||
        normalizeVal(existing.notes) !== normalizeVal(uploaded.notes);

      if (changed) {
        stats.updated++;
        idsToDelete.push(existing.id);
        toInsert.push(uploaded);
      } else {
        stats.unchanged++;
      }
    }
  }

  if (idsToDelete.length > 0 || toInsert.length > 0) {
    const { error: replaceErr } = await replaceLabourRows(idsToDelete, toInsert);
    if (replaceErr) throw new Error(replaceErr.message);
  }

  return stats;
}

// ─── Assembly Bunch import ────────────────────────────────────────────────────

async function importAssemblyBunches(rows: Record<string, unknown>[]): Promise<AssemblyImportResult> {
  const { data: existing, error } = await getAllAssemblyBunches();
  if (error) throw new Error(error.message);

  // Build a map of existing branch items for comparison
  const existingByBranch = new Map<string, string>();
  for (const branch of existing ?? []) {
    const key = branch.branchCode;
    const fingerprint = branch.items
      .map((item) => [item.assemblyCode, item.itemCode, item.sortOrder, item.description, item.size, item.labourCode].join('|'))
      .join(';;');
    existingByBranch.set(key, fingerprint);
  }

  // Group uploaded rows by branch
  const uploadedByBranch = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const branchCode = String(row.branch_code ?? '');
    if (!branchCode) continue;
    if (!uploadedByBranch.has(branchCode)) uploadedByBranch.set(branchCode, []);
    uploadedByBranch.get(branchCode)!.push(row);
  }

  const result: AssemblyImportResult = {
    branchesReplaced: 0,
    branchesUnchanged: 0,
    rowsInserted: 0,
    total: rows.length,
  };

  const branchesToReplace: string[] = [];
  const rowsToInsert: Record<string, unknown>[] = [];

  for (const [branchCode, uploadedRows] of uploadedByBranch.entries()) {
    const uploadedFingerprint = uploadedRows
      .map((r) => [r.assembly_code, r.item_code, r.sort_order, r.description, r.size, r.labour_code].join('|'))
      .join(';;');

    const existingFingerprint = existingByBranch.get(branchCode) ?? null;

    if (existingFingerprint === uploadedFingerprint) {
      result.branchesUnchanged++;
    } else {
      result.branchesReplaced++;
      branchesToReplace.push(branchCode);
      rowsToInsert.push(...uploadedRows);
    }
  }

  if (branchesToReplace.length > 0) {
    const { error: replaceErr } = await replaceAssemblyBranchRows(branchesToReplace, rowsToInsert);
    if (replaceErr) throw new Error(replaceErr.message);
    result.rowsInserted = rowsToInsert.length;
  }

  return result;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const POST = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Invalid JSON body', 400);

    const { type, rows } = body as { type: unknown; rows: unknown };

    if (!type || !['materials', 'labour', 'assembly-bunches'].includes(type as string)) {
      return errorResponse('type must be one of: materials, labour, assembly-bunches', 400);
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return errorResponse('rows must be a non-empty array', 400);
    }

    try {
      if (type === 'materials') {
        const result = await importMaterials(rows as Record<string, unknown>[]);
        return successResponse(result);
      }
      if (type === 'labour') {
        const result = await importLabour(rows as Record<string, unknown>[]);
        return successResponse(result);
      }
      // assembly-bunches
      const result = await importAssemblyBunches(rows as Record<string, unknown>[]);
      return successResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      console.error('[database-import]', message);
      return errorResponse(message, 500);
    }
  },
);
