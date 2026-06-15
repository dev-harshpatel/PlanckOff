import type { MaterialDefinition } from '@/types/core';
import type { ProjectOverrideMap } from '@/types/core/projectOverrides';

/**
 * Merge a single global material with its project-specific overrides.
 * Returns the original reference when no override exists — zero allocation overhead.
 */
export function resolveProjectMaterial(
  global: MaterialDefinition,
  overrideMap: ProjectOverrideMap,
): MaterialDefinition {
  const override = overrideMap[global.code];
  if (!override || Object.keys(override).length === 0) return global;
  return { ...global, ...override };
}

/**
 * Resolve an entire materials array against the project override map.
 * Returns the original array reference when the map is empty.
 */
export function resolveProjectMaterials(
  globals: MaterialDefinition[],
  overrideMap: ProjectOverrideMap,
): MaterialDefinition[] {
  if (Object.keys(overrideMap).length === 0) return globals;
  return globals.map((m) => resolveProjectMaterial(m, overrideMap));
}
