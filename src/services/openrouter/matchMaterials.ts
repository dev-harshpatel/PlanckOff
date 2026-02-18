const PROMPT = `You are a construction cost estimator. Match each extracted assembly material to database entries. Output ONLY valid JSON.

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
Required fields: "unit" = per from DB, "unit_cost" = number from matCost, "section" = exact section code from DB (REQUIRED for every matched_materials and matched_labor entry). Process all assemblies but only materials with non-null raw_text. Preserve extracted raw_text.`;

function repairJSON(input: string): string {
  try {
    JSON.parse(input);
    return input;
  } catch {
    // continue to repair
  }

  const assemblyEndPattern = /\}\s*\]\s*\}\s*(?=,|\])/g;
  let lastCompleteEnd = -1;
  let match;
  while ((match = assemblyEndPattern.exec(input)) !== null) {
    lastCompleteEnd = match.index + match[0].length;
  }

  if (lastCompleteEnd > 0) {
    let fixed = input.substring(0, lastCompleteEnd);
    fixed = fixed.replace(/,\s*$/, "");
    fixed += "\n  ]\n}";
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {
      // fall through
    }
  }

  let fixed = input;

  let inString = false;
  let escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; }
  }
  if (inString) fixed += '"';

  fixed = fixed.replace(/,\s*"[^"]*"\s*:\s*"[^"]*"\s*$/, "");
  fixed = fixed.replace(/,\s*"[^"]*"\s*:\s*$/, "");
  fixed = fixed.replace(/,\s*"[^"]*$/, "");
  fixed = fixed.replace(/,\s*$/, "");

  const closeMap: Record<string, string> = { "{": "}", "[": "]" };
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
  }
  while (stack.length > 0) {
    const open = stack.pop()!;
    fixed += closeMap[open];
  }

  return fixed;
}

type TrimmedDbEntry = {
  code: string;
  section: string;
  type: string;
  description: string;
  category: string;
  matCost: string;
  per: string;
  manufacturer: string;
};

function trimDatabaseForMatch(db: Record<string, unknown>[]): TrimmedDbEntry[] {
  return db.map((row) => ({
    code: String(row.code ?? ""),
    section: String(row.section ?? ""),
    type: String(row.type ?? ""),
    description: String(row.description ?? ""),
    category: String(row.category ?? ""),
    matCost: String(row.matCost ?? ""),
    per: String(row.per ?? ""),
    manufacturer: String(row.manufacturer ?? ""),
  }));
}

const MAX_BATCH_RETRIES = 2;
const BATCH_SIZE = 15;
const MODEL = "google/gemini-2.5-flash";

export interface MatchResult {
  assemblies: unknown[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function matchMaterialsToDatabase(
  extraction: { assemblies: unknown[] },
  materialDb: Record<string, unknown>[],
  apiKey: string,
  routeStartMs: number = Date.now(),
): Promise<MatchResult> {
  const elapsed = () => ((Date.now() - routeStartMs) / 1000).toFixed(2);

  const trimmedDb = trimDatabaseForMatch(materialDb);

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

    const userMessage = `EXTRACTED ASSEMBLIES — Batch ${batchNum}/${totalBatches}:\n${JSON.stringify({ assemblies: batchAssemblies })}\n\nMATERIAL & LABOR DATABASE:\n${JSON.stringify(trimmedDb)}`;

    console.log(`[match] Batch ${batchNum}/${totalBatches} — START at ${new Date().toISOString()} (elapsed ${elapsed()}s) — sending request to OpenRouter (${batchAssemblies.length} assemblies, ${userMessage.length.toLocaleString()} chars)`);

    const requestBody = {
      model: MODEL,
      max_tokens: 32768,
      messages: [
        { role: "system", content: PROMPT },
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

      const cleaned = lastRaw
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();

      try {
        parsed = JSON.parse(cleaned) as { assemblies?: unknown[] };
        break;
      } catch {
        try {
          parsed = JSON.parse(repairJSON(cleaned)) as { assemblies?: unknown[] };
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

  return {
    assemblies: allMatched,
    usage: {
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_tokens: totalPromptTokens + totalCompletionTokens,
    },
  };
}
