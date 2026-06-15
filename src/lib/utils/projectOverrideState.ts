import type {
  OverrideableField,
  OverrideValues,
  ProjectOverrideMap,
} from "@/types/core/projectOverrides";

export interface ProjectOverrideUpdate {
  field: OverrideableField;
  value: OverrideValues[OverrideableField];
}

export function applyProjectOverrideUpdates(
  prev: ProjectOverrideMap,
  materialCode: string,
  updates: ProjectOverrideUpdate[],
): ProjectOverrideMap {
  const nextMaterialOverrides = {
    ...(prev[materialCode] ?? {}),
  } as Record<string, unknown>;

  updates.forEach(({ field, value }) => {
    nextMaterialOverrides[field] = value;
  });

  return {
    ...prev,
    [materialCode]: nextMaterialOverrides as OverrideValues,
  };
}

export function removeProjectOverrideFields(
  prev: ProjectOverrideMap,
  materialCode: string,
  fields: OverrideableField[],
): ProjectOverrideMap {
  const existing = { ...(prev[materialCode] ?? {}) } as OverrideValues;
  fields.forEach((field) => {
    delete existing[field];
  });

  if (Object.keys(existing).length === 0) {
    const next = { ...prev };
    delete next[materialCode];
    return next;
  }

  return {
    ...prev,
    [materialCode]: existing,
  };
}
