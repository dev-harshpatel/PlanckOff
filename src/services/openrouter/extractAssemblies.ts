const PROMPT = `Extract wall, roof, and floor assembly data from the page image. Return ONLY valid JSON. No commentary, no markdown.

ASSEMBLY ID: Short alphanumeric tag from page (e.g. W14, RF2B, WT1a). No long names. Untagged: UN-TAGGED-WALL-1, UN-TAGGED-ROOF-1, UN-TAGGED-FLOOR-1. Never null.

EXTRACT: Gypsum board (each layer separate), gypsum sheathing, steel framing (studs/tracks/metal), batt/mineral wool insulation, plywood/OSB, blocking/bracing, steel deck, vapor barriers, sealants, trim/accessories.

EXCLUDE: Air barriers, cladding (brick/stone/metal/EIFS/siding/fibre cement), roofing membranes, rigid insulation, concrete/CMU/masonry, paint, window/curtain wall, aluminum panels/mullions, back pans, vertical support systems. Include sound batts; exclude acoustic caulk.

SCOPE (critical): Materials must come ONLY from the content tied to THAT assembly (same row/section/block as its tag). Never copy materials from another assembly. If an assembly's content has no in-scope materials (e.g. only cladding/window/concrete), output it with ALL material arrays empty. One assembly's content = isolated; do not bleed across.

Each material: "raw_text" = exact verbatim from PDF. Unstated properties = null.

LAYERS (critical): Multiple gypsum layers = separate entries (never merge). If PDF says "2 LAYERS 16 mm GYPSUM WALLBOARD TYPE X", output TWO separate entries — each with layers=2 (the total layer count from the PDF as an integer). The "layers" field must always reflect the layer count stated in the PDF (1, 2, 3, etc.). If the PDF does not mention a layer count, set layers=1. Never set layers=null for gypsum board or gypsum sheathing.

OUTPUT: JSON only. Structure: assemblies[].assembly_id, fire_rating, stc_rating, materials.{ gypsum_board[], gypsum_sheathing[], steel_framing[], insulation[], plywood[], blocking_and_bracing[], steel_deck[], vapor_barriers[], sealants[], trim_and_accessories[] }. Each item: raw_text, thickness/size/gauge/spacing/type/layers/description/r_value/depth as applicable or null. No assemblies on page → {"assemblies":[]}. Include every visible assembly; empty materials = empty arrays.`;

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
    max_tokens: 32768,
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
      throw new Error(`Failed to parse AI response: ${repairErr}`);
    }
  }

  console.log(`[extract] Extracted ${parsed.assemblies?.length ?? 0} assemblies`);

  return {
    assemblies: parsed.assemblies ?? [],
    truncated: finishReason === "length",
    usage: {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
    },
  };
}
