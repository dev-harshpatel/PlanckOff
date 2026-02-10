/**
 * Wall Specification Types
 * Types for AI-parsed wall spec PDF data
 */

export interface WallMaterial {
  keyword: string; // "GYPSUM WALLBOARD", "METAL STUDS", etc.
  description: string; // Full description from PDF
  thickness?: string; // e.g., "5/8\"", "3-5/8\""
  specifications?: string; // Additional specs
}

export interface WallType {
  wallTypeId: string; // "P1", "W4", etc.
  description: string; // Full wall type description
  materials: WallMaterial[];
  ocSpacing: number; // On-center spacing in inches (default 16)
  layerCount: number; // Default 1, "Two Layers" = 2
  fireRating?: string; // e.g., "1 Hour", "2 Hour"
  stcRating?: string; // e.g., "STC 50"
  rawText?: string; // Original text from PDF for reference
}

export interface ParsedWallSpec {
  wallTypes: WallType[];
  totalWallTypes: number;
  processingTime?: number; // ms
  aiModel?: string;
}

export interface ParsePDFRequest {
  pdfBase64: string; // Base64 encoded PDF content
  fileName: string;
}

export interface ParsePDFResponse {
  success: boolean;
  data?: ParsedWallSpec;
  error?: string;
}
