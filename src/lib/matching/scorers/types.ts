export interface MaterialItem {
  raw_text?: string | null;
  thickness?: number | null;
  type?: string | null;
  layers?: number | null;
  size?: string | number | null;
  gauge?: string | null;
  spacing?: number | null;
  description?: string | null;
  r_value?: string | null;
  depth?: number | null;
}

export interface MatchContext {
  /** Assembly height in feet — used for gauge selection in steel framing */
  assemblyHeightFt: number;
  /** Assembly fire_rating — used in sealant selection */
  fireRating: string | null;
}
