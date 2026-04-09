'use client';

import type {
  AdministrativeRow,
  GeneralConditionsRow,
  InflationConfig,
  InflationResult,
  StaffingRow,
  TravelHotelConfig,
  TravelHotelResult,
} from './types';
export const TRAVEL_HOURS_PER_DAY = 8;

function safeNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Calculates the total for a single General Conditions row.
 * @param durationWeeks - auto-calculated from project dates (used by cleaning/weekly formulas)
 * @param durationMonths - auto-calculated from project dates including partial days (used by monthly formulas)
 */
export function calcGcRowTotal(
  row: GeneralConditionsRow,
  durationWeeks: number,
  durationMonths: number,
  workingHoursPerWeek: number,
): number {
  const effectiveWeeks =
    safeNumber(row.durationWeeks) > 0 ? safeNumber(row.durationWeeks) : safeNumber(durationWeeks);
  const effectiveMonths =
    safeNumber(row.durationMonths) > 0 ? safeNumber(row.durationMonths) : safeNumber(durationMonths);
  const effectiveHoursPerWeek = safeNumber(workingHoursPerWeek, 40);

  switch (row.formulaType) {
    case 'lump_sum':
      return safeNumber(row.amount);
    case 'duration_cleaners_rate':
      return effectiveWeeks * safeNumber(row.cleaners) * safeNumber(row.hourlyRate) * effectiveHoursPerWeek;
    case 'duration_weekly_expense':
      return effectiveWeeks * safeNumber(row.weeklyExpense);
    case 'units_months_monthly_rate':
      return safeNumber(row.units) * effectiveMonths * safeNumber(row.monthlyRate);
    case 'units_unit_rate':
      return safeNumber(row.units) * safeNumber(row.unitRate);
    case 'area_months_monthly_rate':
      return safeNumber(row.area) * effectiveMonths * safeNumber(row.monthlyRate);
    case 'months_units_monthly_rate':
      return effectiveMonths * safeNumber(row.units) * safeNumber(row.monthlyRate);
    case 'occurrences_hours_hourly_rate':
      return safeNumber(row.occurrences) * safeNumber(row.hoursPerOccurrence) * safeNumber(row.hourlyRate);
  }
}

/**
 * Calculates all Travel & Hotel derived values.
 * @param config - user-supplied rates
 * @param totalLaborCost - total labour cost from the trade breakdown
 */
export function calcTravelHotel(
  config: TravelHotelConfig,
  totalLaborCost: number,
): TravelHotelResult {
  const totalLaborHours =
    safeNumber(config.hourlyRate) > 0 ? safeNumber(totalLaborCost) / safeNumber(config.hourlyRate) : 0;
  const days = totalLaborHours / TRAVEL_HOURS_PER_DAY;
  const hoursPremium = safeNumber(config.hoursPremium);
  const travelCost = safeNumber(config.travelPerDiem) * days;
  const hotelCost = safeNumber(config.hotelPerDay) * days;
  const total = hoursPremium + travelCost + hotelCost;
  return { totalLaborHours, days, travelCost, hotelCost, total };
}

export function calcAdministrativeRowTotal(
  row: AdministrativeRow,
  durationWeeks: number,
): number {
  const effectiveWeeks =
    safeNumber(row.durationWeeks) > 0 ? safeNumber(row.durationWeeks) : safeNumber(durationWeeks);

  switch (row.formulaType) {
    case 'lump_sum':
      return safeNumber(row.amount);
    case 'parking_monthly':
      return safeNumber(row.parkingSpots) * safeNumber(row.months) * safeNumber(row.monthlyParkingCost);
    case 'weekly_budget':
      return effectiveWeeks * safeNumber(row.weeklyBudget);
  }
}

export function calcInflation(
  config: InflationConfig,
  totalLaborCost: number,
  totalMaterialCost: number,
): InflationResult {
  const currentYear = safeNumber(config.currentYear);
  const startYear = safeNumber(config.startYear);
  const yearsToStart = Math.max(0, startYear - currentYear);

  const effectivePreconstructionYears =
    yearsToStart > 0
      ? Array.from({ length: Math.max(yearsToStart, config.preconstructionYears.length) }, (_, index) => {
          const existing = config.preconstructionYears[index];
          return existing ?? {
            id: `pre-${index + 1}`,
            yearIndex: index + 1,
            laborInflationPercent: 0,
            materialInflationPercent: 0,
          };
        })
      : config.preconstructionYears.slice(0, 1);

  const preconstructionYears = effectivePreconstructionYears.map((row, index) => {
    const laborRate = safeNumber(row.laborInflationPercent) / 100;
    const materialRate = safeNumber(row.materialInflationPercent) / 100;
    const effectiveYears = yearsToStart > 0 ? index + 1 : 0;

    const labor =
      safeNumber(totalLaborCost)
      * Math.pow(1 + laborRate, effectiveYears);
    const material =
      safeNumber(totalMaterialCost)
      * Math.pow(1 + materialRate, effectiveYears);

    return {
      id: row.id,
      yearIndex: row.yearIndex || index + 1,
      labor,
      material,
    };
  });

  const preconstructionLabor =
    preconstructionYears[Math.min(Math.max(yearsToStart - 1, 0), preconstructionYears.length - 1)]?.labor ?? safeNumber(totalLaborCost);
  const preconstructionMaterial =
    preconstructionYears[Math.min(Math.max(yearsToStart - 1, 0), preconstructionYears.length - 1)]?.material ?? safeNumber(totalMaterialCost);

  const resolvedConstructionYears = config.constructionYears.map((row, index, allRows) => {
    const laborRate = safeNumber(row.laborInflationPercent) / 100;
    const materialRate = safeNumber(row.materialInflationPercent) / 100;
    const laborCompletionShare = safeNumber(row.laborCompletionPercent) / 100;
    const materialCompletionShare = safeNumber(row.materialCompletionPercent) / 100;
    let priorLabor = preconstructionLabor;
    let priorMaterial = preconstructionMaterial;

    for (let i = 0; i < index; i += 1) {
      const prev = allRows[i];
      priorLabor += safeNumber(totalLaborCost) * (safeNumber(prev.laborCompletionPercent) / 100) * (safeNumber(prev.laborInflationPercent) / 100);
      priorMaterial += safeNumber(totalMaterialCost) * (safeNumber(prev.materialCompletionPercent) / 100) * (safeNumber(prev.materialInflationPercent) / 100);
    }

    return {
      id: row.id,
      yearIndex: row.yearIndex || index + 1,
      labor: priorLabor + (safeNumber(totalLaborCost) * laborCompletionShare * laborRate),
      material: priorMaterial + (safeNumber(totalMaterialCost) * materialCompletionShare * materialRate),
    };
  });

  const duringConstructionLabor =
    resolvedConstructionYears.length > 0 ? resolvedConstructionYears[resolvedConstructionYears.length - 1].labor : preconstructionLabor;
  const duringConstructionMaterial =
    resolvedConstructionYears.length > 0 ? resolvedConstructionYears[resolvedConstructionYears.length - 1].material : preconstructionMaterial;

  const total = duringConstructionLabor + duringConstructionMaterial;

  return {
    preconstructionYears,
    constructionYears: resolvedConstructionYears,
    preconstructionLabor,
    preconstructionMaterial,
    duringConstructionLabor,
    duringConstructionMaterial,
    total,
  };
}

/**
 * Staffing cost formula:
 *   workers × (percentTime / 100) × durationWeeks × hourlyRate × workingHoursPerWeek
 */
export function calcStaffingRowTotal(
  row: StaffingRow,
  durationWeeks: number,
  workingHoursPerWeek: number,
): number {
  const effectiveWeeks =
    safeNumber(row.durationWeeks) > 0 ? safeNumber(row.durationWeeks) : safeNumber(durationWeeks);
  const effectiveHoursPerWeek = safeNumber(workingHoursPerWeek, 40);

  return safeNumber(row.workers)
    * (safeNumber(row.percentTime) / 100)
    * effectiveWeeks
    * safeNumber(row.hourlyRate)
    * effectiveHoursPerWeek;
}

/** Returns the ceiling of full weeks between two ISO date strings. Returns 0 if invalid. */
export function calcWeeksFromDates(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7));
}

/**
 * Returns fractional months between two ISO date strings, accounting for every day.
 * Uses 30.4375 days/month (365.25 / 12) for accuracy. Rounded to 2 decimal places.
 * Returns 0 if dates are invalid or end is before start.
 */
export function calcMonthsFromDates(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.round((diffDays / 30.4375) * 100) / 100;
}
