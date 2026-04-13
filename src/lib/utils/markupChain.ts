/**
 * markupChain.ts — Single source of truth for the markup chain formula.
 *
 * This is the ONLY place this formula sequence is implemented.
 * Import from here; never inline the chain elsewhere.
 *
 * Formula order (never change the order without updating this comment and all callers):
 *   netDirectCost    = totalMaterial + totalLabor
 *   grossCost        = netDirectCost + gcTotal
 *   escalationCost   = netDirectCost  × (escalation%  / 100)  ← applied to direct costs
 *   taxCost          = totalMaterial  × (tax%          / 100)  ← material only
 *   burdenCost       = totalLabor     × (laborBurden%  / 100)  ← labor only
 *   subTotalWithTaxes = grossCost + escalationCost + taxCost + burdenCost
 *   overheadCost     = subTotalWithTaxes × (overhead%  / 100)
 *   profitBasis      = subTotalWithTaxes + overheadCost
 *   profitCost       = profitBasis       × (profit%    / 100)
 *   finalTotal       = profitBasis + profitCost
 *
 * Source: Dhruv's markup formula sheet — verified 2026-04-09.
 */

export interface MarkupBase {
  totalMaterial: number;
  totalLabor: number;
  /** General Conditions / Division 01 total. Pass 0 when not applicable. */
  gcTotal: number;
}

export interface MarkupConfig {
  escalation: number;
  /** Tax rate applied to material cost only. */
  tax: number;
  /** Labor burden rate applied to labor cost only. */
  laborBurden: number;
  overhead: number;
  profit: number;
}

export interface MarkupChainResult {
  totalMaterial: number;
  totalLabor: number;
  gcTotal: number;
  netDirectCost: number;
  grossCost: number;
  escalationCost: number;
  taxCost: number;
  burdenCost: number;
  subTotalWithTaxes: number;
  overheadCost: number;
  profitBasis: number;
  profitCost: number;
  finalTotal: number;
}

/**
 * Applies the full markup chain to the given base costs.
 * All inputs are raw numbers — never pre-formatted strings or rounded values.
 * Returns every intermediate value for display and audit purposes.
 */
export function applyMarkupChain(
  base: MarkupBase,
  config: MarkupConfig,
): MarkupChainResult {
  const { totalMaterial, totalLabor } = base;
  const gcTotal = base.gcTotal ?? 0;
  const netDirectCost = totalMaterial + totalLabor;
  const grossCost = netDirectCost + gcTotal;
  const escalationCost = netDirectCost * ((config.escalation ?? 0) / 100);
  const taxCost = totalMaterial * ((config.tax ?? 0) / 100);
  const burdenCost = totalLabor * ((config.laborBurden ?? 0) / 100);
  const subTotalWithTaxes = grossCost + escalationCost + taxCost + burdenCost;
  const overheadCost = subTotalWithTaxes * ((config.overhead ?? 0) / 100);
  const profitBasis = subTotalWithTaxes + overheadCost;
  const profitCost = profitBasis * ((config.profit ?? 0) / 100);
  const finalTotal = profitBasis + profitCost;

  return {
    totalMaterial,
    totalLabor,
    gcTotal,
    netDirectCost,
    grossCost,
    escalationCost,
    taxCost,
    burdenCost,
    subTotalWithTaxes,
    overheadCost,
    profitBasis,
    profitCost,
    finalTotal,
  };
}
