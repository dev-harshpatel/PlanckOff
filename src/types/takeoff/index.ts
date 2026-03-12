/**
 * Takeoff schedule parsing types
 */

export interface TakeoffEntry {
  assemblyCode: string;
  height: number;
  wallLength: number;
  ceilingArea?: number;
  level?: string;
  description?: string;
}

export interface HeightVariant {
  height: number;
  totalLF: number;
  totalSF: number;
  count: number;
}

export interface AggregatedTakeoff {
  assemblyCode: string;
  heightVariants: HeightVariant[];
  totalLF: number;
  totalSF: number;
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
