import type { MaterialDefinition } from '@/types/core';

/**
 * Fields of MaterialDefinition that can be overridden per-project.
 * Identity / display fields (code, description, section, etc.) are intentionally excluded.
 */
export type OverrideableField = keyof Pick<MaterialDefinition,
  | 'formulaQty'
  | 'formulaSecQty'
  | 'formulaCeilQty'
  | 'formulaCeilSecQty'
  | 'mouWall'
  | 'mouWallSec'
  | 'mouCeil'
  | 'mouCeilSec'
  | 'productivity'
  | 'matCost'
  | 'hourlyRate'
  | 'sheetBagBox'
  | 'lengthCover'
>;

export type OverrideValues = Partial<Pick<MaterialDefinition, OverrideableField>>;

/** One record per material per project in project_material_overrides */
export interface ProjectMaterialOverride {
  id: string;
  projectId: string;
  materialCode: string;
  overrides: OverrideValues;
  createdAt: string;
  updatedAt: string;
}

/**
 * Keyed by material_code for O(1) lookup.
 * Loaded once per project and passed through context.
 */
export type ProjectOverrideMap = Record<string, OverrideValues>;
