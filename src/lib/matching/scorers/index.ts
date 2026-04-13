import type { MaterialDefinition } from "@/types";
import type { ExtractCategory } from "@/constants/extractionCategories";
import type { MaterialItem, MatchContext } from "./types";
import { scoreGwb }        from "./scoreGwb";
import { scoreFraming }    from "./scoreFraming";
import { scoreInsulation } from "./scoreInsulation";
import { scoreGeneric }    from "./scoreGeneric";

export type ScorerFn = (
  extracted: MaterialItem,
  db: MaterialDefinition,
  ctx: MatchContext,
) => number;

export const CATEGORY_SCORERS: Record<ExtractCategory, ScorerFn> = {
  gypsum_board:         scoreGwb,
  gypsum_sheathing:     scoreGwb,       // same logic — sheathing also identified by thickness + type
  steel_framing:        scoreFraming,
  insulation:           scoreInsulation,
  vapor_barriers:       scoreGeneric,
  sealants:             () => 0,        // sealants handled entirely by autoAddEngine
  plywood:              scoreGeneric,
  blocking_and_bracing: scoreGeneric,
  steel_deck:           scoreGeneric,
  trim_and_accessories: scoreGeneric,
};

export type { MaterialItem, MatchContext };
