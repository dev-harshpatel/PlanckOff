import { repairJSONForMaterialMatch, stripMarkdownAndTrim } from "@/lib/utils/jsonRepair";
import {
  trimMaterialDbForMatching,
  type TrimmedMaterialDbEntry,
} from "@/lib/utils/materialDbTrim";
import type { AssemblyMeta, MatchResult } from "@/types/pipeline";

const MATCH_PROMPT = `You are a construction cost estimator. Match each extracted assembly material to database entries. Output ONLY valid JSON.

INPUTS: (1) Extracted assemblies (assemblies, materials, raw_text, thickness_mm, layers, fire_rating). (2) Material & labor DB (code, section, type, description, category, matCost, per, manufacturer).

RULES:
1) Material match: Use category, thickness (mm→inch OK), keywords (Type X, Regular, Shaftliner, Furring, CH Stud). No match → null.
2) Metal stud: Also attach matching TRACK and Deflection/Slotted track from DB (same width).
3) Screws: Add from DB — drywall screws for gypsum, fire-rated for Type X, framing/tek for metal studs & furring. No labor unless in DB.
4) Fire rating non-null: Attach fire sealant/caulking material + fire-stop labor from DB. STC/sound: acoustic sealant + labor if in DB.
5) Labor: Gypsum→Hang Drywall + Type X premium if Type X; Sheathing/Shaftliner→Shaftliner install; Metal studs→Install Metal Studs; CH→Shaftwall Framing; Furring→Furring Channel; Batt→Install Batt; Sealants→Fire-Stop/Caulking. Labor additive.
6) Do NOT invent codes, SKUs, or sealants. Only use DB entries.
7) SKIP null/empty materials: If an extracted material has null or empty raw_text, OMIT it entirely from the output. Do not match, do not guess, do not assign any materials or labor to it. Only process materials that have a real, non-null raw_text value.
8) REQUIRED — section: Each matched_materials and matched_labor entry MUST include the "section" field. Copy the exact "section" value (e.g. "09 22 16", "09 29 00", "01 00 00") from the DB entry you matched. Never omit section.

OUTPUT (valid JSON only, no markdown):
{"assemblies":[{"assembly_id":"string","materials_costing":[{"extracted_material":{...},"matched_materials":[{"code","section","description","manufacturer","unit","unit_cost"}],"matched_labor":[{"code","section","description","unit","unit_cost"}]}]}]}
Required fields: "unit" = per from DB, "unit_cost" = number from matCost (this is the production rate per unit for materials, or cost per labor unit for labor), "section" = exact section code from DB (REQUIRED for every matched_materials and matched_labor entry). Process all assemblies but only materials with non-null raw_text. Preserve extracted raw_text.`;

/** Collect keywords from a batch of assemblies for optional DB filtering (e.g. raw_text, categories). */
function getBatchKeywords(assemblies: unknown[]): Set<string> {
  const keywords = new Set<string>();
  const pushWords = (s: string) =>
    s.split(/\s+/).forEach((w) => {
      const t = w.replace(/\W/g, "").toLowerCase();
      if (t.length >= 2) keywords.add(t);
    });
  for (const a of assemblies) {
    const ass = a as { materials?: Record<string, unknown[]> };
    if (!ass.materials) continue;
    for (const items of Object.values(ass.materials)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const raw = (item as { raw_text?: string }).raw_text;
        if (raw && typeof raw === "string") pushWords(raw);
      }
    }
    const cat = (a as { assembly_id?: string }).assembly_id;
    if (cat && typeof cat === "string") pushWords(cat);
  }
  return keywords;
}

/** Optionally reduce DB to rows that might match this batch (saves tokens, keeps quality). */
const filterDbForBatch = (
  db: TrimmedMaterialDbEntry[],
  batchAssemblies: unknown[],
): TrimmedMaterialDbEntry[] => {
  const keywords = getBatchKeywords(batchAssemblies);
  if (keywords.size === 0) return db;
  const include = (row: TrimmedMaterialDbEntry): boolean => {
    const parts = [
      row.code,
      row.section,
      row.type,
      row.description,
      row.category,
      row.manufacturer,
    ]
      .join(" ")
      .toLowerCase()
      .replace(/\W/g, " ");
    const rowWords = new Set(parts.split(/\s+/).filter((w) => w.length >= 2));
    for (const kw of keywords) {
      if (rowWords.has(kw)) return true;
      for (const rw of rowWords) {
        if (rw.includes(kw) || kw.includes(rw)) return true;
      }
    }
    return false;
  };
  const filtered = db.filter(include);
  if (filtered.length < db.length * 0.5) return db;
  return filtered;
};

const MAX_BATCH_RETRIES = 2;
const BATCH_SIZE = 15;
const MODEL = "google/gemini-2.5-flash";
/** When true, send a smaller DB per batch (saves tokens, no cache benefit). When false, send full DB first for prompt-cache hits on batches 2+. */
const USE_PER_BATCH_DB_FILTER = false;

export type { MatchResult };

export async function matchMaterialsToDatabase(
  extraction: { assemblies: unknown[] },
  materialDb: Record<string, unknown>[],
  apiKey: string,
  routeStartMs: number = Date.now(),
): Promise<MatchResult> {
  const elapsed = () => ((Date.now() - routeStartMs) / 1000).toFixed(2);
  const trimmedDb = trimMaterialDbForMatching(materialDb);

  // Preserve fire_rating and stc_rating from extraction so they survive the match step.
  const metaById = new Map<string, AssemblyMeta>();
  for (const assembly of extraction.assemblies ?? []) {
    const src = assembly as {
      assembly_id?: unknown;
      fire_rating?: unknown;
      stc_rating?: unknown;
    };
    const id =
      typeof src.assembly_id === "string" && src.assembly_id.trim() !== ""
        ? src.assembly_id.trim()
        : null;
    if (!id) continue;

    const fireRating =
      src.fire_rating === undefined || src.fire_rating === null
        ? null
        : String(src.fire_rating);
    const stcRating =
      src.stc_rating === undefined || src.stc_rating === null
        ? null
        : String(src.stc_rating);

    metaById.set(id, { fire_rating: fireRating, stc_rating: stcRating });
  }

  // Pre-filter: strip out materials with null/empty raw_text from each assembly
  const MATERIAL_CATEGORIES = [
    "gypsum_board", "gypsum_sheathing", "steel_framing", "insulation",
    "plywood", "blocking_and_bracing", "steel_deck", "vapor_barriers",
    "sealants", "trim_and_accessories",
  ];

  const cleanedAssemblies = (extraction.assemblies ?? []).map((assembly: any) => {
    if (!assembly.materials) return assembly;
    const cleanedMaterials: Record<string, unknown[]> = {};
    for (const cat of MATERIAL_CATEGORIES) {
      const items = assembly.materials[cat];
      if (Array.isArray(items)) {
        cleanedMaterials[cat] = items.filter(
          (item: any) => item.raw_text != null && String(item.raw_text).trim() !== "",
        );
      } else {
        cleanedMaterials[cat] = [];
      }
    }
    return { ...assembly, materials: cleanedMaterials };
  });

  const assemblies = cleanedAssemblies;
  const totalBatches = Math.ceil(assemblies.length / BATCH_SIZE);

  console.log(`[match] matchMaterialsToDatabase entered — ${assemblies.length} assemblies, ${totalBatches} batch(es) (elapsed ${elapsed()}s)`);

  const allMatched: unknown[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStartMs = Date.now();
    const batchNum = batchIdx + 1;

    const batchAssemblies = assemblies.slice(
      batchIdx * BATCH_SIZE,
      (batchIdx + 1) * BATCH_SIZE,
    );

    const dbForBatch = USE_PER_BATCH_DB_FILTER
      ? filterDbForBatch(trimmedDb, batchAssemblies)
      : trimmedDb;
    const userMessage =
      `MATERIAL & LABOR DATABASE (use only these entries):\n${JSON.stringify(dbForBatch)}\n\nEXTRACTED ASSEMBLIES — Batch ${batchNum}/${totalBatches}:\n${JSON.stringify({ assemblies: batchAssemblies })}`;

    console.log(`[match] Batch ${batchNum}/${totalBatches} — START at ${new Date().toISOString()} (elapsed ${elapsed()}s) — sending request to OpenRouter (${batchAssemblies.length} assemblies, DB rows: ${dbForBatch.length}, ${userMessage.length.toLocaleString()} chars)`);

    const requestBody = {
      model: MODEL,
      max_tokens: 32768,
      messages: [
        { role: "system", content: MATCH_PROMPT },
        { role: "user", content: userMessage },
      ],
    };

    let parsed: { assemblies?: unknown[] } | null = null;

    for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt++) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const apiResponseMs = ((Date.now() - batchStartMs) / 1000).toFixed(2);
      console.log(`[match] Batch ${batchNum}/${totalBatches} — API responded in ${apiResponseMs}s (attempt ${attempt}, status: ${response.status}, elapsed ${elapsed()}s)`);

      if (!response.ok) {
        const err = await response.text();
        if (attempt < MAX_BATCH_RETRIES && response.status >= 500) {
          console.log(`[match] Batch ${batchNum} — retrying after 5xx...`);
          continue;
        }
        console.error(`[match] Batch ${batchNum} — OpenRouter API error:`, response.status, err.slice(0, 500));
        throw new Error(`OpenRouter API error (batch ${batchNum}): ${err}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const lastRaw = data.choices?.[0]?.message?.content ?? "";
      const lastUsage = data.usage ?? {};

      if (lastUsage.prompt_tokens !== undefined) totalPromptTokens += lastUsage.prompt_tokens;
      if (lastUsage.completion_tokens !== undefined) totalCompletionTokens += lastUsage.completion_tokens;

      const cleaned = stripMarkdownAndTrim(lastRaw);

      try {
        parsed = JSON.parse(cleaned) as { assemblies?: unknown[] };
        break;
      } catch {
        try {
          parsed = JSON.parse(repairJSONForMaterialMatch(cleaned)) as { assemblies?: unknown[] };
          console.log(`[match] Batch ${batchNum} — repaired successfully`);
          break;
        } catch (repairErr) {
          console.error(`[match] Batch ${batchNum} — JSON parse/repair failed (attempt ${attempt}):`, repairErr);
          if (attempt >= MAX_BATCH_RETRIES) continue;
        }
      }
    }

    if (!parsed?.assemblies) {
      console.error(`[match] Batch ${batchNum} — skipped (parse failed)`);
      continue;
    }

    const batchMs = ((Date.now() - batchStartMs) / 1000).toFixed(2);
    allMatched.push(...parsed.assemblies);
    console.log(`[match] Batch ${batchNum}/${totalBatches} — DONE in ${batchMs}s (total matched so far: ${allMatched.length}, elapsed ${elapsed()}s)`);
  }

  console.log(`[match] Total matched: ${allMatched.length} assemblies`);
  console.log(`[match] Tokens: ${totalPromptTokens} prompt + ${totalCompletionTokens} completion`);

  const propagatedAssemblies = allMatched.map((assembly) => {
    const obj = assembly as Record<string, unknown>;
    const idValue = obj.assembly_id;
    if (typeof idValue !== "string" || idValue.trim() === "") {
      return obj;
    }

    const meta = metaById.get(idValue.trim());
    if (!meta) {
      return obj;
    }

    const existingFire = obj.fire_rating as string | null | undefined;
    const existingStc = obj.stc_rating as string | null | undefined;

    return {
      ...obj,
      fire_rating: existingFire ?? meta.fire_rating,
      stc_rating: existingStc ?? meta.stc_rating,
    };
  });

  return {
  assemblies: propagatedAssemblies,
    usage: {
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_tokens: totalPromptTokens + totalCompletionTokens,
    },
  };
}
