/**
 * Core application types (materials, assemblies, takeoffs, estimates)
 */

export interface MaterialDefinition {
  code: string;
  section: string;
  matCostCode: string;
  laborCostCode: string;
  type: string;
  manufacturer: string;
  description: string;
  matCost: number;
  unitCost?: number;
  per: string;
  priceUpdated: string;
  width?: string;
  gauge?: string;
  flange?: string;
  sheetBagBox?: string;
  sheetBagBoxSizeUnits?: string;
  size?: string;
  screwSpacing?: string;
  sizeOfUnit?: number;
  lengthCover?: string;
  lengthCoverUnits?: string;
  formulaQty?: string;
  formulaSecQty?: string;
  formulaCeilQty?: string;
  formulaCeilSecQty?: string;
  mouWall?: string;
  mouWallSec?: string;
  mouCeil?: string;
  mouCeilSec?: string;
  note?: string;
  category: "Framing" | "Drywall" | "Insulation" | "Finishing" | "Ceiling" | "Labor" | "Other";
  productivity?: number;
  hourlyRate?: number;
  coverPerHour?: number;
}

export type CalculationMethod =
  | 'Vertical @ 12" OC'
  | 'Vertical @ 16" OC'
  | 'Vertical @ 24" OC'
  | "Tracks (Top & Bottom)"
  | "Coverage (1 Layer)"
  | "Coverage (2 Layers)"
  | "Insulation (Cavity)"
  | "Fastener (per SqFt)"
  | "Joint Treatment (per SqFt)"
  | "Fixed Qty"
  | "Suspension - Main Runner (4' OC)"
  | "Suspension - Cross Tee (4' OC)"
  | "Suspension - Cross Tee (2' OC)"
  | "Suspension - CRC (4' OC)"
  | "Suspension - Furring (16\" OC)"
  | "Suspension - Furring (24\" OC)"
  | "Suspension - Hanger Wire (16sf)"
  | "Ceiling - Perimeter (Linear)"
  | "Ceiling - Tile (2x4)"
  | "Ceiling - Tile (2x2)"
  | "Soffit - Vertical Framing"
  | "Structural - Steel Joist (Span)"
  | "Structural - Deep Leg Track"
  | "Structural - Lateral Bracing"
  | "Ceiling - Baffle (Linear Calc)"
  | "Ceiling - CRC (Primary 4' OC)"
  | "Ceiling - Hat Channel (Secondary 24\" OC)"
  | "Custom Formula"
  | "Structural Studs"
  | "Coverage (Shared Wall)"
  | "Insulation (Continuous)"
  | "Level 5 Finish"
  | "Ceiling - Grid"
  | "Backing/Blocking"
  | "Boxed Column"
  | "Corner Bead (Vertical)"
  | "Suspension - Main T (4ft)"
  | "Suspension - Cross T (4ft)"
  | "Ceiling Tile (2x2)"
  | "Ceiling Tile (2x4)"
  | "Framing Labor (Linear Feet)";

export interface AssemblyComponent {
  id: string;
  materialName: string;
  usage: CalculationMethod | string;
  customFormula?: string;
  rValue?: number;
  wasteFactor?: number;
  installRate?: number;
  laborProduction?: number;
  laborHourlyRate?: number;
  materialCost?: number;
  heightCondition?: { min?: number; max?: number };
  crew?: number;
  productionRate?: number;
  selectedUnit?: string;
  overrideHeight?: number;
  heightCategory?: string;
  muted?: boolean;
  /** Index of the materials_costing group this component belongs to (from final_output).
   *  Used to scope height propagation and override maps so that changing one
   *  material's height only affects labors within the same spec-line group. */
  groupId?: number;
  overrideLayers?: number;
  overrideQuantity?: number;
  overrideMatCost?: number;
  overrideLaborCost?: number;
  productivityFromDb?: number;
  materialCode?: string;
  sectionCode?: string;
  ocSpacing?: string;
  formulaQtyOverride?: string;
  formulaSecQtyOverride?: string;
  formulaCeilQtyOverride?: string;
  formulaCeilSecQtyOverride?: string;
  lengthOverride?: number;
}

export interface WallAssembly {
  id: string;
  code: string;
  description: string;
  components: AssemblyComponent[];
  framingType?: "Wood" | "Light Metal" | "Heavy Metal";
  scope?: string;
  assemblyType?:
    | "Wall"
    | "Ceiling"
    | "Soffit"
    | "Interior Wall"
    | "Exterior Wall"
    | "Interior Walls"
    | "Exterior Walls"
    | "Bulkhead"
    | "BulkHead"
    | "Hollow Metal Frame"
    | "HM Frames"
    | "Access Panel"
    | "Access Pannel";
  ceilingSubtype?: "Suspended" | "Hard Lid" | "Baffles" | "Steel Joist";
  defaultLength?: number;
  defaultHeight?: number;
  defaultWidth?: number;
  defaultArea?: number;
  defaultPerimeter?: number;
  baffleSpacing?: number;
  baffleLength?: number;
  finishLevel?: string;
  spanLength?: number;
  studSize?: string;
  roomLength?: number;
  roomWidth?: number;
}

export interface CalculatedMaterial {
  category: "Framing" | "Drywall" | "Insulation" | "Finishing" | "Ceiling" | "Labor" | "Other";
  item: string;
  quantity: number;
  unit: string;
  notes?: string;
  overridePrice?: number;
  grade?: string;
  code?: string;
  sect?: string;
  height?: number;
  oc?: number;
  layers?: number;
  laborCode?: string;
  crew?: string;
  productionRate?: number;
  wastePercent?: number;
  secQuantity?: number;
  secUnit?: string;
}

export interface TakeoffInstance {
  id: string;
  level: string;
  description: string;
  quantity: number;
  length: number;
  height: number;
  ceilingArea?: number;
  perimeter?: number;
  lengthUnit?: string;
  areaUnit?: string;
}

export interface EstimateState {
  assemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
}

export enum AppState {
  IDLE = "IDLE",
  ANALYZING = "ANALYZING",
  ESTIMATING = "ESTIMATING",
  ERROR = "ERROR",
}

export interface ProposalConfig {
  taxRate: number;
  markup: number;
  overhead: number;
  clientName: string;
  clientAddress: string;
  preparedBy: string;
  validityDays: number;
  company?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  company: string;
  status: "Working Project Progress" | "Under Review" | "Submitted" | "Hold" | "Archive";
  dueDate: string;
  projectNumber: string;
  assignedTo?: string;
  location?: string;
  country?: string;
  province?: string;
  pricingConfig?: ProposalConfig;
}

export interface TeamMember {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  initials: string;
  status: "Active" | "Invited" | "Inactive";
}

export type GcCategory = "Staffing" | "Site" | "Admin";

export interface GeneralRequirement {
  id: string;
  category: GcCategory;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
}

export type UserRole = "Administrator" | "Team Lead" | "Estimator";

export interface AppSettings {
  geminiApiKey?: string;
  theme?: "light" | "dark";
  defaultCurrency?: "USD" | "CAD" | "EUR";
}

export * from './projectOverrides';
