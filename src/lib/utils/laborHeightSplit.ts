/**
 * Labor height segmentation logic.
 *
 * Business rules:
 *   H ≤ 12      → 1 segment: H @ "(Walls < 12 ft)"
 *   12 < H ≤ 24 → 2 segments: 12 + (H-12) @ "(High 12 ft to 24 ft)"
 *   H > 24      → 3 segments: 12 + 12 + (H-24) @ "(High Above 24 ft)"
 *
 * Shared by the finalize service (initial pipeline) and the override utils
 * (real-time recalculation when user changes assembly height in the editor).
 */

export interface HeightSegment {
  height_ft: number;
  category: string;
}

export const LABOR_HEIGHT_CATEGORIES = {
  STD: "(Walls < 12 ft)",
  HI: "(High 12 ft to 24 ft)",
  VHI: "(High Above 24 ft)",
} as const;

export function getHeightSegments(H: number): HeightSegment[] {
  if (H <= 12) {
    return [{ height_ft: H, category: LABOR_HEIGHT_CATEGORIES.STD }];
  } else if (H <= 24) {
    return [
      { height_ft: 12, category: LABOR_HEIGHT_CATEGORIES.STD },
      { height_ft: H - 12, category: LABOR_HEIGHT_CATEGORIES.HI },
    ];
  } else {
    return [
      { height_ft: 12, category: LABOR_HEIGHT_CATEGORIES.STD },
      { height_ft: 12, category: LABOR_HEIGHT_CATEGORIES.HI },
      { height_ft: H - 24, category: LABOR_HEIGHT_CATEGORIES.VHI },
    ];
  }
}

export function getActiveCategories(H: number): Set<string> {
  return new Set(getHeightSegments(H).map((segment) => segment.category));
}
