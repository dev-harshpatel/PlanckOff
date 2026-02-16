const PROMPT = `You are a construction document reader extracting assembly material data from PDF drawings. Be THOROUGH — read every line of text for every assembly. Return ONLY valid JSON.

ASSEMBLY ID: Short alphanumeric tag (e.g. W14, WE3, P1, RF2B). Untagged: UN-TAGGED-WALL-1, etc. Never null.

EXTRACT these material categories:
- gypsum_board: GYPSUM WALLBOARD, GYPSUM BOARD, DRYWALL, TYPE X, TYPE 'X', fire-rated gypsum (interior finish)
- gypsum_sheathing: GLASS MAT-FACED GYPSUM SHEATHING (exterior sheathing)
- steel_framing: STEEL STUDS, METAL STUDS, C-H STUDS, FURRING CHANNEL, TRACKS
- insulation: BATT INSULATION, ROCK WOOL BATT, SEMI-RIGID MINERAL WOOL, sound batts (extract ALL insulation types — a wall can have BOTH batt insulation AND semi-rigid mineral wool as separate entries)
- plywood: PLYWOOD, OSB
- blocking_and_bracing: BLOCKING, BRACING, CROSS BRACING
- steel_deck: STEEL DECK
- vapor_barriers: POLY VAPOUR BARRIER, POLYETHYLENE
- sealants: SEALANT, CAULK (exclude acoustic caulk)
- trim_and_accessories: TRIM, CORNER BEAD, J-TRIM

EXCLUDE: Air barriers, cladding (brick/stone/metal/EIFS/siding/fibre cement), roofing membranes, rigid insulation, concrete/CMU/masonry, paint, window/curtain wall, aluminum panels/mullions, back pans, vertical support systems, thermally broken clip systems.

CRITICAL RULES:
1. READ EVERY LINE: Assembly descriptions list materials line by line. Read from FIRST line to LAST line. Do not stop early. Exterior walls (WE*) typically have materials on BOTH sides — exterior sheathing AND interior gypsum board.
2. GYPSUM BOARD — NEVER MISS: If an assembly has steel studs, furring, or vapor barrier, it almost certainly has gypsum board as interior finish. Scan the FULL text top-to-bottom. The gypsum board line is often the LAST material listed.
3. MULTIPLE INSULATION TYPES: A single assembly can have multiple insulation products (e.g. rock wool batt inside stud cavity + semi-rigid mineral wool on exterior). Extract each as a SEPARATE insulation entry.
4. SCOPE: Only extract materials from THAT assembly's own content. Never copy from another assembly.
5. LAYERS: "2 LAYERS 16 mm GYPSUM WALLBOARD TYPE X" → TWO separate entries each with layers=2. No layer count stated → layers=1. Never layers=null for gypsum.
6. Each material: "raw_text" = exact verbatim text from PDF. Unstated properties = null.

SELF-CHECK before outputting each assembly:
- Did I read ALL lines of text for this assembly, including the last line?
- If steel_framing or vapor_barriers is non-empty, did I find gypsum_board? (It's almost always there — re-read the assembly)
- If this is an exterior wall (WE*), did I capture both exterior sheathing AND interior gypsum board?
- Did I capture ALL insulation types mentioned (there may be more than one)?
- If fire_rating is not null/NA, are there gypsum boards? (Fire-rated walls always have gypsum)

OUTPUT: {"assemblies":[{"assembly_id":"string","fire_rating":"string|null","stc_rating":"string|null","materials":{"gypsum_board":[],"gypsum_sheathing":[],"steel_framing":[],"insulation":[],"plywood":[],"blocking_and_bracing":[],"steel_deck":[],"vapor_barriers":[],"sealants":[],"trim_and_accessories":[]}}]}
Each item: raw_text, thickness, size, gauge, spacing, type, layers, description, r_value, depth as applicable or null.`;

function repairJSON(input: string): string {
  try {
    JSON.parse(input);
    return input;
  } catch {
    // continue to repair
  }

  const assemblyEndPattern = /\}\s*\}\s*(?=,|\])/g;
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

export interface ExtractionResult {
  assemblies: unknown[];
  truncated: boolean;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function extractAssembliesFromPDF(
  pdfBase64: string,
  apiKey: string,
): Promise<ExtractionResult> {
  const requestBody = {
    model: "google/gemini-2.5-pro",
    max_tokens: 65536,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:application/pdf;base64,${pdfBase64}`,
            },
          },
        ],
      },
    ],
  };

  console.log("[extract] Sending request to OpenRouter (Gemini 2.5 Pro)...");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[extract] OpenRouter API error:", response.status, err.slice(0, 500));
    throw new Error(`OpenRouter API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const finishReason = data.choices?.[0]?.finish_reason;
  const usage = data.usage ?? {};

  console.log(`[extract] Response: ${raw.length} chars, finish_reason: ${finishReason}`);
  if (usage.prompt_tokens) {
    console.log(`[extract] Tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`);
  }

  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("[extract] JSON parse failed, attempting repair...");
    try {
      parsed = JSON.parse(repairJSON(cleaned));
      console.log(`[extract] Repaired JSON — ${parsed.assemblies?.length ?? 0} assemblies`);
    } catch (repairErr) {
      console.error("[extract] JSON repair failed:", repairErr);
      throw new Error(`Failed to parse AI response: ${repairErr}`);
    }
  }

  const assemblies = (parsed.assemblies ?? []) as Array<{
    assembly_id?: string;
    fire_rating?: string | null;
    materials?: {
      gypsum_board?: unknown[];
      steel_framing?: unknown[];
      vapor_barriers?: unknown[];
      insulation?: unknown[];
    };
  }>;

  console.log(`[extract] Extracted ${assemblies.length} assemblies`);

  // --- Post-extraction validation warnings ---
  for (const a of assemblies) {
    const id = a.assembly_id ?? "?";
    const m = a.materials ?? {};
    const hasGyp = (m.gypsum_board?.length ?? 0) > 0;
    const hasStuds = (m.steel_framing?.length ?? 0) > 0;
    const hasVapor = (m.vapor_barriers?.length ?? 0) > 0;
    const isFireRated = a.fire_rating && a.fire_rating !== "NA" && a.fire_rating !== "N/A";

    if (hasStuds && !hasGyp) {
      console.warn(`[extract] WARNING: ${id} has steel_framing but NO gypsum_board — likely missing interior finish`);
    }
    if (hasVapor && !hasGyp) {
      console.warn(`[extract] WARNING: ${id} has vapor_barriers but NO gypsum_board — likely missing interior finish`);
    }
    if (isFireRated && !hasGyp) {
      console.warn(`[extract] WARNING: ${id} is fire-rated (${a.fire_rating}) but NO gypsum_board — fire-rated walls always have gypsum`);
    }
  }

  return {
    assemblies,
    truncated: finishReason === "length",
    usage: {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
    },
  };
}
