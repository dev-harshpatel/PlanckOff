import {
  applyProjectOverrideUpdates,
  removeProjectOverrideFields,
} from "@/lib/utils/projectOverrideState";
import type { ProjectOverrideMap } from "@/types/core/projectOverrides";

export type PersistedProjectOverrideField =
  | "productivity"
  | "hourlyRate"
  | "wastePercent";

export interface ProjectOverrideSyncItem {
  materialCode: string;
  field: PersistedProjectOverrideField;
  value: number;
  baselineValue?: number;
  existingValue?: number;
}

interface SyncProjectOverridesParams {
  projectId: string;
  items: ProjectOverrideSyncItem[];
  onOverrideMapChange?: React.Dispatch<React.SetStateAction<ProjectOverrideMap>>;
}

const isSameNumber = (left?: number, right?: number) =>
  left != null && right != null && Math.abs(left - right) < 0.0001;

export async function syncProjectOverrides({
  projectId,
  items,
  onOverrideMapChange,
}: SyncProjectOverridesParams): Promise<void> {
  const operations = items
    .map((item) => {
      const shouldDelete =
        isSameNumber(item.value, item.baselineValue) && item.existingValue != null;
      const shouldSkip =
        (item.existingValue == null && isSameNumber(item.value, item.baselineValue)) ||
        isSameNumber(item.value, item.existingValue);

      if (shouldSkip) return null;

      return {
        ...item,
        method: shouldDelete ? "DELETE" : ("PATCH" as const),
      };
    })
    .filter((item): item is ProjectOverrideSyncItem & { method: "PATCH" | "DELETE" } => item != null);

  if (operations.length === 0) return;

  await Promise.all(
    operations.map(async (item) => {
      const response = await fetch(`/api/projects/${projectId}/material-overrides`, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          item.method === "DELETE"
            ? {
                materialCode: item.materialCode,
                fields: [item.field],
              }
            : {
                materialCode: item.materialCode,
                updates: [{ field: item.field, value: item.value }],
              },
        ),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(
          json.error ??
            `Failed to synchronize override ${item.field} for ${item.materialCode}`,
        );
      }

      if (!onOverrideMapChange) return;

      onOverrideMapChange((prev) =>
        item.method === "DELETE"
          ? removeProjectOverrideFields(prev, item.materialCode, [item.field])
          : applyProjectOverrideUpdates(prev, item.materialCode, [
              { field: item.field, value: item.value },
            ]),
      );
    }),
  );
}
