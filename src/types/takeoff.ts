// Types for OST Takeoff Schedule parsing

export interface TakeoffEntry {
  assemblyCode: string;   // e.g., "P1", "W4"
  height: number;         // e.g., 9.7, 10, 15
  wallLength: number;     // LF (Linear Feet) per row
  ceilingArea?: number;   // SF for ceiling types
  level?: string;         // Floor level (if present)
  description?: string;   // Row description (if present)
}

export interface HeightVariant {
  height: number;
  totalLF: number;        // Sum of wall lengths for this height
  totalSF: number;        // height * totalLF
  count: number;          // Number of rows summed
}

export interface AggregatedTakeoff {
  assemblyCode: string;
  heightVariants: HeightVariant[];
  totalLF: number;        // Sum across all heights
  totalSF: number;        // Sum across all heights
}

export interface UploadedFiles {
  pdf: File | null;
  excel: File | null;
}

export interface ParsedTakeoffResult {
  entries: TakeoffEntry[];
  aggregated: AggregatedTakeoff[];
  totalAssemblies: number;
  columnMapping: {
    assemblyCode: string;
    height: string;
    wallLength: string;
    ceilingArea?: string;
    level?: string;
    assemblyType?: string;
  };
}
