/**
 * Types and pure utilities for the Markups → General Requirements section.
 * All state shapes and formula implementations live here so components
 * import a single source-of-truth.
 */

// ─── Project Info ─────────────────────────────────────────────────────────────

export interface ProjectInfo {
  proposalNumber: string;
  projectName: string;
  address: string;
  location: string;
  buildingType: string;
  closingDateTime: string;
  squareFootage: string;
  ballParkValue: string;
  client: string;
  competition: string;
  startDate: string;
  endDate: string;
  /** Auto-calculated from startDate / endDate — do not set manually. */
  durationWeeks: number;
  /** Auto-calculated from startDate / endDate including partial days — do not set manually. */
  durationMonths: number;
  workingHoursPerWeek: number;
}

export const DEFAULT_PROJECT_INFO: ProjectInfo = {
  proposalNumber: '',
  projectName: '',
  address: '',
  location: '',
  buildingType: '',
  closingDateTime: '',
  squareFootage: '',
  ballParkValue: '',
  client: '',
  competition: '',
  startDate: '',
  endDate: '',
  durationWeeks: 0,
  durationMonths: 0,
  workingHoursPerWeek: 40,
};

// ─── Staffing ─────────────────────────────────────────────────────────────────

export interface StaffingRow {
  id: string;
  /** Display label — not user-editable. */
  label: string;
  /** Fixed hourly rate for this role. */
  hourlyRate: number;
  /** User input: number of workers in this role. */
  workers: number;
  /** User input: percentage of their time on project (0 – 100). */
  percentTime: number;
}

export const DEFAULT_STAFFING_ROWS: StaffingRow[] = [
  { id: 'ss1', label: 'Site Supervision',        hourlyRate: 0, workers: 0, percentTime: 100 },
  { id: 'ss2', label: 'Non-working Foreman',      hourlyRate: 0, workers: 0, percentTime: 100 },
  { id: 'ss3', label: 'Office Project Manager',   hourlyRate: 0, workers: 0, percentTime: 100 },
  { id: 'ss4', label: 'Project Co-Ordinator',     hourlyRate: 0, workers: 0, percentTime: 100 },
  { id: 'ss5', label: 'Health & Safety',          hourlyRate: 0, workers: 0, percentTime: 100 },
];

// ─── General Conditions ───────────────────────────────────────────────────────

/**
 * Each formula type maps to a different set of numeric inputs.
 * The component uses this to render the correct inline inputs per row.
 */
export type GcFormulaType =
  | 'lump_sum'                        // amount
  | 'duration_cleaners_rate'          // durationWeeks × cleaners × hourlyRate × 40
  | 'duration_weekly_expense'         // durationWeeks × weeklyExpense
  | 'units_months_monthly_rate'       // units × months × monthlyRate
  | 'units_unit_rate'                 // units × unitRate
  | 'area_months_monthly_rate'        // area(SF) × months × monthlyRate
  | 'months_units_monthly_rate'       // months × units × monthlyRate
  | 'occurrences_hours_hourly_rate';  // occurrences × hoursPerOccurrence × hourlyRate

export interface GeneralConditionsRow {
  id: string;
  label: string;
  formulaType: GcFormulaType;
  // ── numeric inputs — only the subset relevant to formulaType is used ──
  amount: number;
  cleaners: number;
  hourlyRate: number;
  weeklyExpense: number;
  units: number;
  months: number;
  monthlyRate: number;
  unitRate: number;
  area: number;
  occurrences: number;
  hoursPerOccurrence: number;
}

/** All numeric fields that can be updated via onRowChange. */
export type GcNumericField = Exclude<keyof GeneralConditionsRow, 'id' | 'label' | 'formulaType'>;

const gcBase: Omit<GeneralConditionsRow, 'id' | 'label' | 'formulaType'> = {
  amount: 0, cleaners: 0, hourlyRate: 0, weeklyExpense: 0,
  units: 0, months: 0, monthlyRate: 0, unitRate: 0,
  area: 0, occurrences: 0, hoursPerOccurrence: 0,
};

export const DEFAULT_GENERAL_CONDITIONS_ROWS: GeneralConditionsRow[] = [
  { id: 'gcc1',  label: 'Weekly Construction Cleaning',            formulaType: 'duration_cleaners_rate',        ...gcBase, hourlyRate: 60 },
  { id: 'gcc2',  label: 'Site Safety & Signage',                   formulaType: 'lump_sum',                      ...gcBase },
  { id: 'gcc3',  label: 'Small Tools & Office Supplies',           formulaType: 'lump_sum',                      ...gcBase },
  { id: 'gcc4',  label: 'Health & Safety Supplies',                formulaType: 'duration_weekly_expense',       ...gcBase },
  { id: 'gcc5',  label: 'Scissor Lift - Access',                   formulaType: 'units_months_monthly_rate',     ...gcBase },
  { id: 'gcc6',  label: 'Site Trailer',                            formulaType: 'units_months_monthly_rate',     ...gcBase },
  { id: 'gcc7',  label: 'Deliveries',                              formulaType: 'units_unit_rate',               ...gcBase },
  { id: 'gcc8',  label: 'Shop Drawings',                           formulaType: 'units_unit_rate',               ...gcBase },
  { id: 'gcc9',  label: 'Framing Layout',                          formulaType: 'units_unit_rate',               ...gcBase },
  { id: 'gcc10', label: 'Plywood Hoarding (To Divide Phases)',     formulaType: 'area_months_monthly_rate',      ...gcBase },
  { id: 'gcc11', label: 'Multiple Mobilization',                   formulaType: 'units_unit_rate',               ...gcBase },
  { id: 'gcc12', label: 'Budget for Mechanical Fasteners & Screws', formulaType: 'lump_sum',                     ...gcBase },
  { id: 'gcc13', label: 'Temporary Ventilation - Negative Air',    formulaType: 'months_units_monthly_rate',     ...gcBase },
  { id: 'gcc14', label: 'Misc Hoisting - Crane',                   formulaType: 'occurrences_hours_hourly_rate', ...gcBase, hourlyRate: 250, hoursPerOccurrence: 4 },
];

/**
 * Calculates the total for a single General Conditions row.
 * @param durationWeeks - auto-calculated from project dates (used by cleaning/weekly formulas)
 * @param durationMonths - auto-calculated from project dates including partial days (used by monthly formulas)
 */
export function calcGcRowTotal(
  row: GeneralConditionsRow,
  durationWeeks: number,
  durationMonths: number,
): number {
  switch (row.formulaType) {
    case 'lump_sum':
      return row.amount;
    case 'duration_cleaners_rate':
      return durationWeeks * row.cleaners * row.hourlyRate * 40;
    case 'duration_weekly_expense':
      return durationWeeks * row.weeklyExpense;
    case 'units_months_monthly_rate':
      return row.units * durationMonths * row.monthlyRate;
    case 'units_unit_rate':
      return row.units * row.unitRate;
    case 'area_months_monthly_rate':
      return row.area * durationMonths * row.monthlyRate;
    case 'months_units_monthly_rate':
      return durationMonths * row.units * row.monthlyRate;
    case 'occurrences_hours_hourly_rate':
      return row.occurrences * row.hoursPerOccurrence * row.hourlyRate;
  }
}

// ─── Travel & Hotel ───────────────────────────────────────────────────────────

export interface TravelHotelConfig {
  /** Fixed hourly rate used to back-calculate total labour hours from labour cost. */
  hourlyRate: number;
  /** Additional hours premium (informational input). */
  hoursPremium: number;
  /** Travel per-diem rate per day. */
  travelPerDiem: number;
  /** Hotel cost per day. */
  hotelPerDay: number;
}

export const DEFAULT_TRAVEL_HOTEL_CONFIG: TravelHotelConfig = {
  hourlyRate: 0,
  hoursPremium: 0,
  travelPerDiem: 0,
  hotelPerDay: 0,
};

export interface TravelHotelResult {
  totalLaborHours: number;
  days: number;
  travelCost: number;
  hotelCost: number;
  total: number;
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
    config.hourlyRate > 0 ? totalLaborCost / config.hourlyRate : 0;
  const days = totalLaborHours / 8;
  const travelCost = config.travelPerDiem * days;
  const hotelCost = config.hotelPerDay * days;
  const total = travelCost + hotelCost;
  return { totalLaborHours, days, travelCost, hotelCost, total };
}

// ─── Pure formula functions ───────────────────────────────────────────────────

/**
 * Staffing cost formula:
 *   workers × (percentTime / 100) × durationWeeks × hourlyRate × 40 hrs/wk
 */
export function calcStaffingRowTotal(row: StaffingRow, durationWeeks: number): number {
  return row.workers * (row.percentTime / 100) * durationWeeks * row.hourlyRate * 40;
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
