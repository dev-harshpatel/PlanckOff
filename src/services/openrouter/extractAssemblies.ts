import { repairJSONForAssemblyExtraction, stripMarkdownAndTrim } from "@/lib/utils/jsonRepair";
import type { ExtractionResult } from "@/types/pipeline";

export type { ExtractionResult };

export async function extractAssembliesFromPDF(
  pdfBase64: string,
  apiKey: string,
  promptText: string,
): Promise<ExtractionResult> {
  const requestBody = {
    model: "google/gemini-2.5-pro",
    max_tokens: 65536,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
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
