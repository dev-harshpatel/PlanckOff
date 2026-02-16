export interface MaterialDefinition {
  code: string;           // Replaces id
  section: string;        // CSI MasterFormat (e.g., 09 20 00)
  matCostCode: string;    // Material Category Code
  laborCostCode: string;  // Labor Code
  type: string;           // Division/Trade
  manufacturer: string;   // Vendor (or Role for Labor)
  description: string;    // Replaces name
  matCost: number;        // Replaces price (or Labor Rate)
  per: string;            // Pricing Unit (e.g., "1,000 LF", "1 EA", "1 HR")
  priceUpdated: string;   // Date

  // Technical Specs
  width?: string;         // e.g., 3-5/8", 6"
  gauge?: string;         // e.g., 20ga, 33mil
  flange?: string;        // e.g., 1-1/4", 1-5/8", 2"

  // Helper for app logic
  category: 'Framing' | 'Drywall' | 'Insulation' | 'Finishing' | 'Ceiling' | 'Labor' | 'Other';
  productivity?: number; // Units/Hour (for Labor items)
  hourlyRate?: number; // Base Hourly Rate (e.g. $65)
}

export type CalculationMethod =
  | 'Vertical @ 12" OC'
  | 'Vertical @ 16" OC'
  | 'Vertical @ 24" OC'
  | 'Tracks (Top & Bottom)'
  | 'Coverage (1 Layer)'
  | 'Coverage (2 Layers)'
  | 'Insulation (Cavity)'
  | 'Fastener (per SqFt)'
  | 'Joint Treatment (per SqFt)'
  | 'Fixed Qty'
  // Ceiling & Soffit Methods
  | 'Suspension - Main Runner (4\' OC)'
  | 'Suspension - Cross Tee (4\' OC)'
  | 'Suspension - Cross Tee (2\' OC)'
  | 'Suspension - CRC (4\' OC)'
  | 'Suspension - Furring (16" OC)'
  | 'Suspension - Furring (24" OC)'
  | 'Suspension - Hanger Wire (16sf)'
  | 'Ceiling - Perimeter (Linear)'
  | 'Ceiling - Tile (2x4)'
  | 'Ceiling - Tile (2x2)'
  | 'Soffit - Vertical Framing'
  // Advanced Structural & Special Ceiling
  | 'Structural - Steel Joist (Span)'
  | 'Structural - Deep Leg Track'
  | 'Structural - Lateral Bracing'
  | 'Ceiling - Baffle (Linear Calc)'
  | 'Ceiling - CRC (Primary 4\' OC)'
  | 'Ceiling - Hat Channel (Secondary 24" OC)'
  // Custom
  | 'Custom Formula'
  // Missing Methods from Gemini
  | 'Structural Studs'
  | 'Coverage (Shared Wall)'
  | 'Insulation (Continuous)'
  | 'Level 5 Finish'
  | 'Ceiling - Grid'
  | 'Backing/Blocking'
  | 'Boxed Column'
  | 'Corner Bead (Vertical)'
  | 'Suspension - Main T (4ft)'
  | 'Suspension - Cross T (4ft)'
  | 'Ceiling Tile (2x2)'
  | 'Ceiling Tile (2x4)'
  | 'Framing Labor (Linear Feet)';

export interface AssemblyComponent {
  id: string;
  materialName: string;
  usage: CalculationMethod | string;
  customFormula?: string; // For user-defined math
  rValue?: number;
  wasteFactor?: number; // Optional override: 0.10 = 10%
  installRate?: number; // Labor productivity: Hrs / Unit (OST Style)
  laborProduction?: number; // Units / Hour (User View)
  laborHourlyRate?: number; // $ / Hour
  materialCost?: number; // $ / Unit
  heightCondition?: {
    min?: number;
    max?: number;
  };
  crew?: number; // Crew size (default 1)
  productionRate?: number; // Qty / Crew Hour
  selectedUnit?: string; // User selected UOM override (e.g. 'SF', 'LF', 'Pcs')
  overrideHeight?: number;
  overrideLayers?: number;
  overrideQuantity?: number;
  overrideMatCost?: number;
  overrideLaborCost?: number;
  // Fields from JSON import
  materialCode?: string; // Code from matched_materials or matched_labor
  sectionCode?: string; // Section code (e.g., "09200")
  ocSpacing?: string; // OC spacing (e.g., "400 mm O.C." or "16\"")
}

export interface WallAssembly {
  id: string;
  code: string;
  description: string;
  components: AssemblyComponent[];
  framingType?: 'Wood' | 'Light Metal' | 'Heavy Metal';
  scope?: string; // Pricing scope (e.g., 'Base Bid', 'Alternate 1')

  // Assembly Categorization
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
  ceilingSubtype?: 'Suspended' | 'Hard Lid' | 'Baffles' | 'Steel Joist';

  // Manual Defaults for Prototyping (Used when no takeoff instances exist)
  defaultLength?: number;
  defaultHeight?: number;
  defaultWidth?: number; // Added for Ceiling Dimensions
  defaultArea?: number;
  defaultPerimeter?: number;

  // Advanced Ceiling Params
  baffleSpacing?: number; // inches OC (also used for Joist Spacing)
  baffleLength?: number;  // feet
  finishLevel?: string;   // Level 3, 4, 5

  // Structural Ceiling Params
  spanLength?: number;    // feet (Shortest wall / Joist Span)
  studSize?: string;      // e.g., "6 inch", "8 inch"
  roomLength?: number;    // feet
  roomWidth?: number;     // feet
}

export interface CalculatedMaterial {
  category: 'Framing' | 'Drywall' | 'Insulation' | 'Finishing' | 'Ceiling' | 'Labor' | 'Other';
  item: string;
  quantity: number;
  unit: string;
  notes?: string;
  overridePrice?: number; // Optional override for price per unit (e.g. labor rate)
  grade?: string; // Material Grade (e.g. Type X, Commercial)

  // QuickBid Style Details
  sect?: string; // CSI Section e.g. 09100
  height?: number;
  oc?: number;
  layers?: number;
  laborCode?: string;
  crew?: string;
  productionRate?: number; // Qty per Hour or similar
  wastePercent?: number;
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
  lengthUnit?: string;  // LF, SF, M, M2
  areaUnit?: string;    // SF, M2
}

export interface EstimateState {
  assemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  ESTIMATING = 'ESTIMATING',
  ERROR = 'ERROR',
}

export interface ProposalConfig {
  taxRate: number;      // %
  markup: number;       // %
  overhead: number;     // %
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
  status: 'Working Project Progress' | 'Under Review' | 'Submitted' | 'Hold' | 'Archive';
  dueDate: string;
  projectNumber: string;
  assignedTo?: string; // User ID or Name
  location?: string;
  pricingConfig?: ProposalConfig;
}

export interface TeamMember {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  initials: string;
  status: 'Active' | 'Invited' | 'Inactive';
}

export type GcCategory = 'Staffing' | 'Site' | 'Admin';

export interface GeneralRequirement {
  id: string;
  category: GcCategory;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
}

export type UserRole = 'Administrator' | 'Team Lead' | 'Estimator';

export interface AppSettings {
  geminiApiKey?: string;
  theme?: 'light' | 'dark';
  defaultCurrency?: 'USD' | 'CAD' | 'EUR';
}
