/**
 * Takeoff schedule parsing types
 */

export interface TakeoffEntry {
  assemblyCode: string;
  wallLength: number;
  ceilingArea?: number;
  level?: string;
  description?: string;
}

export interface AggregatedTakeoff {
  assemblyCode: string;
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
    wallLength: string;
    ceilingArea?: string;
    level?: string;
    assemblyType?: string;
  };
}
