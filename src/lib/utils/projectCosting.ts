/**
 * Single aggregation layer for all project cost calculations.
 *
 * THIS IS THE CANONICAL FUNCTION — all tabs read from its output.
 * Never recompute costs inline in components or re-traverse materialCostingData.
 *
 * See: .claude/rules/calculations.md — Section 0 (Cardinal Law) and Section 1
 */

import type { MaterialCosting } from '@/types/assembly';
import type { ProjectOverrideMap } from '@/types/core/projectOverrides';

export interface TradeCosts {
  /** Sum of all material unit_cost × quantity for this trade */
  material: number;
  /** Sum of all labor unit_cost × quantity for this trade */
  labor: number;
}

export interface CostLineItem {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  isLabor: boolean;
  /**
   * Trade grouping: 'Framing' | 'Dry Wall' | 'Insulation' | 'Other'
   * Derived from item description/section by getTradeFromDescription().
   * Matches the breakdown categories in Markups.tsx.
   */
  trade: string;
  /**
   * Level / floor from the assembly — comma-separated when the assembly spans multiple levels.
   * Use parseLevels(area) in consuming code to split into individual level strings.
   */
  area: string;
  /**
   * Assembly category: 'Interior Walls' | 'Exterior Walls' | 'Ceiling' | 'BulkHead' | 'Access Pannel' | 'HM Frames'
   * Derived from assembly_type via normalizeAssemblyType().
   */
  assemblyType: string;
  assemblyId: string;
  /** CSI cost code section */
  section: string;
}

export interface ProjectCosts {
  /** Sum of all material line item costs */
  totalMaterial: number;
  /** Sum of all labor line item costs */
  totalLabor: number;
  /** totalMaterial + totalLabor */
  netDirectCost: number;
  /** Breakdown by trade (Framing, Dry Wall, Insulation, Other) */
  byTrade: Record<string, TradeCosts>;
  /** Flat list — every component and tab reads THIS, never re-traverses raw data */
  lineItems: CostLineItem[];
}

const EMPTY_PROJECT_COSTS: ProjectCosts = {
  totalMaterial: 0,
  totalLabor: 0,
  netDirectCost: 0,
  byTrade: {},
  lineItems: [],
};

/**
 * Derives a trade grouping from item description and CSI section.
 * Produces the same categories used in Markups.tsx trade breakdown:
 * 'Framing' | 'Dry Wall' | 'Insulation' | 'Other'
 *
 * Source: mirrors getTradeFromCategory() logic in Markups.tsx (unified in Phase 3)
 */
function getTradeFromDescription(description: string, section: string): string {
  const d = (description || '').toLowerCase();
  const s = (section || '').toLowerCase();

  if (
    d.includes('stud') ||
    d.includes('track') ||
    d.includes('furring') ||
    s.startsWith('09 22 16') ||
    s.startsWith('05 40 00')
  )
    return 'Framing';

  if (
    d.includes('board') ||
    d.includes('drywall') ||
    d.includes('mud') ||
    d.includes('tape') ||
    d.includes('joint') ||
    d.includes('finishing') ||
    s.startsWith('09 29 00') ||
    s.startsWith('09 22 00')
  )
    return 'Dry Wall';

  if (
    d.includes('insulation') ||
    d.includes('rockwool') ||
    d.includes('fiberglass') ||
    d.includes('batt') ||
    d.includes('mineral wool') ||
    d.includes('comfortbatt') ||
    s.startsWith('07 21 00')
  )
    return 'Insulation';

  return 'Other';
}

/**
 * Normalizes assembly_type string to a canonical assembly category.
 * Matches normalizeAssemblyTypeForCategory() in Markups.tsx (unified in Phase 3).
 */
function normalizeAssemblyType(raw: string): string {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('ceiling')) return 'Ceiling';
  if (lower.includes('exterior')) return 'Exterior Walls';
  if (lower.includes('bulkhead')) return 'BulkHead';
  if (
    (lower.includes('access') && lower.includes('panel')) ||
    lower.includes('access pannel')
  )
    return 'Access Pannel';
  if (lower.includes('hm') || lower.includes('hollow metal')) return 'HM Frames';
  return 'Interior Walls';
}

/**
 * Aggregate all project costs from pipeline output in a single traversal.
 * Overrides are applied inline — this is the ONLY place overrides affect cost totals.
 *
 * Override mapping (from projectWasteOverrides.ts contract):
 *   overrideMap[code].productivity → material unit_cost
 *   overrideMap[code].hourlyRate  → labor unit_cost
 *   (wastePercent is informational — quantity is pre-stored from the finalize step)
 *
 * Unit cost resolution order:
 *   1. overrideMap[code].productivity/hourlyRate (user override) — highest priority
 *   2. mat.unit_cost / lab.unit_cost (AI-set from pipeline output)
 *   3. 0 — last resort, never silently NaN
 *
 * Source: calculations.md § 1 (Canonical Calculation Architecture) and § 9 (priceMap Contract)
 */
export function aggregateProjectCosts(
  materialCostingData: MaterialCosting[],
  overrideMap: ProjectOverrideMap = {},
): ProjectCosts {
  if (!materialCostingData.length) return EMPTY_PROJECT_COSTS;

  // ─── Build lineItems in a single traversal ─────────────────────────────────
  const lineItems: CostLineItem[] = [];

  for (const assembly of materialCostingData) {
    const assemblyExt = assembly as { level?: string; assembly_type?: string };
    const assemblyId = assembly.assembly_id ?? '';
    const area = assemblyExt.level ?? 'Unknown';
    const assemblyType = normalizeAssemblyType(assemblyExt.assembly_type ?? '');

    for (const costingItem of assembly.materials_costing ?? []) {
      // ── Materials ──
      const matRows = costingItem.matched_material != null ? [costingItem.matched_material] : [];

      for (const mat of matRows) {
        const quantity = mat.quantity ?? 0;
        // Apply productivity override if present; fall back to pipeline unit_cost; then 0
        const unitCost = overrideMap[mat.code]?.productivity ?? mat.unit_cost ?? 0;
        const totalCost = quantity * unitCost;

        lineItems.push({
          code: mat.code,
          description: mat.description,
          quantity,
          unit: mat.unit,
          unitCost,
          totalCost,
          isLabor: false,
          trade: getTradeFromDescription(mat.description, mat.section ?? ''),
          area,
          assemblyType,
          assemblyId,
          section: mat.section ?? '',
        });
      }

      // ── Labor ──
      // New-arch omits matched_labor entirely; old DB data may still have it.
      // Only process when matched_material is absent (old pipeline output).
      if (costingItem.matched_material == null) {
        for (const lab of costingItem.matched_labor ?? []) {
          const quantity = lab.quantity ?? 0;
          // Apply hourlyRate override if present; fall back to pipeline unit_cost; then 0
          const unitCost = overrideMap[lab.code]?.hourlyRate ?? lab.unit_cost ?? 0;
          const totalCost = quantity * unitCost;

          lineItems.push({
            code: lab.code,
            description: lab.description,
            quantity,
            unit: lab.unit,
            unitCost,
            totalCost,
            isLabor: true,
            trade: getTradeFromDescription(lab.description, lab.section ?? ''),
            area,
            assemblyType,
            assemblyId,
            section: lab.section ?? '',
          });
        }
      }
    }
  }

  // ─── Derive all totals from lineItems (never traverse materialCostingData again) ─
  let totalMaterial = 0;
  let totalLabor = 0;
  const byTrade: Record<string, TradeCosts> = {};

  for (const item of lineItems) {
    if (!byTrade[item.trade]) {
      byTrade[item.trade] = { material: 0, labor: 0 };
    }

    if (item.isLabor) {
      totalLabor += item.totalCost;
      byTrade[item.trade].labor += item.totalCost;
    } else {
      totalMaterial += item.totalCost;
      byTrade[item.trade].material += item.totalCost;
    }
  }

  return {
    totalMaterial,
    totalLabor,
    netDirectCost: totalMaterial + totalLabor,
    byTrade,
    lineItems,
  };
}
