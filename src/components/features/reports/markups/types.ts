/**
 * Types and defaults for the Markups → General Requirements section.
 * Formula logic lives in `formulas.ts` so markup calculations have a
 * dedicated source-of-truth.
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
  durationWeeks: number;
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
  /** Optional per-row duration override. Uses project duration when 0. */
  durationWeeks: number;
}

export const DEFAULT_STAFFING_ROWS: StaffingRow[] = [
  { id: 'ss1', label: 'Site Supervision',        hourlyRate: 0, workers: 0, percentTime: 100, durationWeeks: 0 },
  { id: 'ss2', label: 'Non-working Foreman',      hourlyRate: 0, workers: 0, percentTime: 100, durationWeeks: 0 },
  { id: 'ss3', label: 'Office Project Manager',   hourlyRate: 0, workers: 0, percentTime: 100, durationWeeks: 0 },
  { id: 'ss4', label: 'Project Co-Ordinator',     hourlyRate: 0, workers: 0, percentTime: 100, durationWeeks: 0 },
  { id: 'ss5', label: 'Health & Safety',          hourlyRate: 0, workers: 0, percentTime: 100, durationWeeks: 0 },
];

// ─── General Conditions ───────────────────────────────────────────────────────

/**
 * Each formula type maps to a different set of numeric inputs.
 * The component uses this to render the correct inline inputs per row.
 */
export type GcFormulaType =
  | 'lump_sum'                        // amount
  | 'duration_cleaners_rate'          // durationWeeks × cleaners × hourlyRate × workingHoursPerWeek
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
  /** Optional per-row duration override. Uses project duration when 0. */
  durationWeeks: number;
  /** Optional per-row duration override. Uses project duration when 0. */
  durationMonths: number;
}

/** All numeric fields that can be updated via onRowChange. */
export type GcNumericField = Exclude<keyof GeneralConditionsRow, 'id' | 'label' | 'formulaType'>;

const gcBase: Omit<GeneralConditionsRow, 'id' | 'label' | 'formulaType'> = {
  amount: 0, cleaners: 0, hourlyRate: 0, weeklyExpense: 0,
  units: 0, months: 0, monthlyRate: 0, unitRate: 0,
  area: 0, occurrences: 0, hoursPerOccurrence: 0,
  durationWeeks: 0, durationMonths: 0,
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

// ─── Travel & Hotel ───────────────────────────────────────────────────────────

export interface TravelHotelConfig {
  /** Fixed hourly rate used to back-calculate total labour hours from labour cost. */
  hourlyRate: number;
  /** Additional premium cost entered as a dollar amount. */
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

// ─── Administrative ───────────────────────────────────────────────────────────

export type AdministrativeFormulaType =
  | 'lump_sum'
  | 'parking_monthly'
  | 'weekly_budget';

export interface AdministrativeRow {
  id: string;
  label: string;
  formulaType: AdministrativeFormulaType;
  isCustom?: boolean;
  amount: number;
  parkingSpots: number;
  months: number;
  monthlyParkingCost: number;
  weeklyBudget: number;
  /** Optional per-row duration override. Uses project duration when 0. */
  durationWeeks: number;
}

export type AdministrativeField = Exclude<keyof AdministrativeRow, 'id' | 'formulaType'>;

const adminBase: Omit<AdministrativeRow, 'id' | 'label' | 'formulaType' | 'isCustom'> = {
  amount: 0,
  parkingSpots: 0,
  months: 0,
  monthlyParkingCost: 0,
  weeklyBudget: 0,
  durationWeeks: 0,
};

export const DEFAULT_ADMINISTRATIVE_ROWS: AdministrativeRow[] = [
  { id: 'adm1', label: 'LEED Project Documentation', formulaType: 'lump_sum', ...adminBase },
  { id: 'adm2', label: 'Liquidated Damages', formulaType: 'lump_sum', ...adminBase },
  { id: 'adm3', label: 'Parking', formulaType: 'parking_monthly', ...adminBase },
  { id: 'adm4', label: 'Fuel & Oil', formulaType: 'weekly_budget', ...adminBase },
  { id: 'adm5', label: 'Meals and Entertainment', formulaType: 'weekly_budget', ...adminBase },
];

// ─── Inflation ───────────────────────────────────────────────────────────────

export interface PreconstructionInflationYear {
  id: string;
  yearIndex: number;
  laborInflationPercent: number;
  materialInflationPercent: number;
}

export interface ConstructionInflationYear {
  id: string;
  yearIndex: number;
  laborCompletionPercent: number;
  materialCompletionPercent: number;
  laborInflationPercent: number;
  materialInflationPercent: number;
}

export interface InflationConfig {
  currentYear: number;
  startYear: number;
  preconstructionYears: PreconstructionInflationYear[];
  constructionYears: ConstructionInflationYear[];
}

export const DEFAULT_INFLATION_CONFIG: InflationConfig = {
  currentYear: new Date().getFullYear(),
  startYear: new Date().getFullYear(),
  preconstructionYears: [
    { id: 'pre-1', yearIndex: 1, laborInflationPercent: 0, materialInflationPercent: 0 },
  ],
  constructionYears: [
    { id: 'con-1', yearIndex: 1, laborCompletionPercent: 0, materialCompletionPercent: 0, laborInflationPercent: 0, materialInflationPercent: 0 },
  ],
};

export interface InflationYearResult {
  id: string;
  yearIndex: number;
  labor: number;
  material: number;
}

export interface InflationResult {
  preconstructionYears: InflationYearResult[];
  constructionYears: InflationYearResult[];
  preconstructionLabor: number;
  preconstructionMaterial: number;
  duringConstructionLabor: number;
  duringConstructionMaterial: number;
  total: number;
}
