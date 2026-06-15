/**
 * Wall specification types (AI-parsed PDF)
 */

export interface WallMaterial {
  keyword: string;
  description: string;
  thickness?: string;
  specifications?: string;
}

export interface WallType {
  wallTypeId: string;
  description: string;
  materials: WallMaterial[];
  ocSpacing: number;
  layerCount: number;
  fireRating?: string;
  stcRating?: string;
  rawText?: string;
}

export interface ParsedWallSpec {
  wallTypes: WallType[];
  totalWallTypes: number;
  processingTime?: number;
  aiModel?: string;
}

export interface ParsePDFRequest {
  pdfBase64: string;
  fileName: string;
}

export interface ParsePDFResponse {
  success: boolean;
  data?: ParsedWallSpec;
  error?: string;
}
