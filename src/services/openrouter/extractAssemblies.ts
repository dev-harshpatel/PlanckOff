import { repairJSONForAssemblyExtraction, stripMarkdownAndTrim } from "@/lib/utils/jsonRepair";
import type { ExtractionResult } from "@/types/pipeline";

const EXTRACT_PROMPT = `Extract wall, roof, floor, and CEILING assembly data from ALL pages of the document. Return ONLY valid JSON. No commentary, no markdown.

MULTI-PAGE PDFs (critical): Process EVERY page. Ceiling assemblies (C1, C2, C3, C4, C5, etc.) are often on later pages — do not skip them. Extract assemblies from page 1, page 2, and all subsequent pages. Combine all assemblies into one output.

ASSEMBLY ID: Short alphanumeric tag from page (e.g. W14, WE3, P1, C1, C2, C3, RF2B, WT1a). Ceiling assemblies often use C-prefix (C1, C2, C3, C4, C5). No long names. Untagged: UN-TAGGED-WALL-1, UN-TAGGED-ROOF-1, UN-TAGGED-FLOOR-1, UN-TAGGED-CEILING-1. Never null.

EXTRACT: Gypsum board (each layer separate), gypsum sheathing, steel framing (studs/tracks/metal/steel joists/steel angle/wire ties), batt/mineral wool insulation, plywood/OSB, blocking/bracing, steel deck, vapor barriers, sealants, trim/accessories. For ceiling assemblies: gypsum wallboard, shaft liner, steel joists, steel studs, steel angle, wire ties, mineral fibre insulation — extract all as applicable.

EXCLUDE: Air barriers, cladding (brick/stone/metal/EIFS/siding/fibre cement), roofing membranes, rigid insulation, concrete/CMU/masonry, paint, window/curtain wall, aluminum panels/mullions, back pans, vertical support systems. Include sound batts; exclude acoustic caulk.

SCOPE (critical): Materials must come ONLY from the content tied to THAT assembly (same row/section/block as its tag). Never copy materials from another assembly. If an assembly's content has no in-scope materials (e.g. only cladding/window/concrete), output it with ALL material arrays empty. One assembly's content = isolated; do not bleed across.

Each material: "raw_text" = exact verbatim from PDF. Unstated properties = null.

LAYERS (critical): Multiple gypsum layers = separate entries (never merge). If PDF says "2 LAYERS 16 mm GYPSUM WALLBOARD TYPE X", output TWO separate entries — each with layers=2 (the total layer count from the PDF as an integer). The "layers" field must always reflect the layer count stated in the PDF (1, 2, 3, etc.). If the PDF does not mention a layer count, set layers=1. Never set layers=null for gypsum board or gypsum sheathing.

OUTPUT: JSON only. Structure: assemblies[].assembly_id, fire_rating, stc_rating, materials.{ gypsum_board[], gypsum_sheathing[], steel_framing[], insulation[], plywood[], blocking_and_bracing[], steel_deck[], vapor_barriers[], sealants[], trim_and_accessories[] }. Each item: raw_text, thickness/size/gauge/spacing/type/layers/description/r_value/depth as applicable or null. No assemblies on page → {"assemblies":[]}. Include every visible assembly from ALL pages; empty materials = empty arrays.`;

export type { ExtractionResult };

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
          { type: "text", text: EXTRACT_PROMPT },
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

  const cleaned = stripMarkdownAndTrim(raw);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("[extract] JSON parse failed, attempting repair...");
    try {
      parsed = JSON.parse(repairJSONForAssemblyExtraction(cleaned));
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
