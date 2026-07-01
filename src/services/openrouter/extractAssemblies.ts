import { repairJSONForAssemblyExtraction, stripMarkdownAndTrim } from "@/lib/utils/jsonRepair";
import type { ExtractionResult } from "@/types/pipeline";

export type { ExtractionResult };

// Transient errors worth retrying (TLS aborts, connection resets, etc.)
const isRetryableError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("terminated") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    (err instanceof Error && err.name === "AbortError")
  );
};

const TIMEOUT_MS   = 240_000; // 240s per attempt — stays under the 300s route maxDuration
const MAX_ATTEMPTS = 2;       // 1 auto-retry for transient connection drops

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

  let lastError: Error = new Error("No attempts made");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      console.warn(`[extract] Attempt ${attempt}: timeout after ${TIMEOUT_MS / 1000}s — aborting`);
      controller.abort();
    }, TIMEOUT_MS);

    try {
      if (attempt > 1) {
        console.log(`[extract] Retry attempt ${attempt}/${MAX_ATTEMPTS}...`);
      }
      console.log("[extract] Sending request to OpenRouter (Gemini 2.5 Pro)...");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const err = await response.text();
        console.error("[extract] OpenRouter API error:", response.status, err.slice(0, 500));
        throw new Error(`OpenRouter API error (${response.status}): ${err}`);
      }

      const data = await response.json();
      const choice      = data.choices?.[0];
      const raw         = choice?.message?.content ?? "";
      const finishReason = choice?.finish_reason ?? "unknown";
      const usage       = data.usage ?? {};

      console.log(`[extract] Response: ${raw.length} chars, finish_reason: ${finishReason}`);
      if (usage.prompt_tokens) {
        console.log(
          `[extract] Tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`,
        );
      }

      // Surface clear errors before attempting JSON parse
      if (!raw || raw.trim().length < 10) {
        const reason =
          finishReason === "content_filter" ? "blocked by content filter" :
          finishReason === "length"         ? "truncated — hit token limit (max_tokens=65536)" :
          !raw                              ? "AI returned empty content (possible rate limit or safety refusal)" :
                                              `AI returned too little content (${raw.length} chars), finish_reason=${finishReason}`;
        console.error(`[extract] Empty/insufficient AI response: ${reason}`);
        if (data.error) console.error("[extract] API error field:", data.error);
        throw new Error(`AI returned no usable content: ${reason}`);
      }

      if (finishReason === "length") {
        console.warn(`[extract] ⚠️  Response truncated at ${raw.length} chars — will attempt repair`);
      }

      const cleaned = stripMarkdownAndTrim(raw);

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.warn("[extract] JSON parse failed, attempting repair...");
        try {
          const repaired = repairJSONForAssemblyExtraction(cleaned);
          if (!repaired || repaired.length < 5) {
            throw new Error("repair returned empty — response too truncated to recover");
          }
          parsed = JSON.parse(repaired);
          console.log(`[extract] Repaired JSON — ${parsed.assemblies?.length ?? 0} assemblies`);
        } catch (repairErr) {
          console.error("[extract] JSON repair failed:", repairErr);
          console.error(`[extract] First 500 chars: ${cleaned.slice(0, 500)}`);
          throw new Error(
            `Failed to parse AI response (finish_reason=${finishReason}): ${repairErr instanceof Error ? repairErr.message : repairErr}`,
          );
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

      for (const a of assemblies) {
        const id = a.assembly_id ?? "?";
        const m = a.materials ?? {};
        const hasGyp    = (m.gypsum_board?.length ?? 0) > 0;
        const hasStuds  = (m.steel_framing?.length ?? 0) > 0;
        const hasVapor  = (m.vapor_barriers?.length ?? 0) > 0;
        const isFireRated = a.fire_rating && a.fire_rating !== "NA" && a.fire_rating !== "N/A";
        if (hasStuds && !hasGyp)   console.warn(`[extract] WARNING: ${id} has steel_framing but NO gypsum_board`);
        if (hasVapor && !hasGyp)   console.warn(`[extract] WARNING: ${id} has vapor_barriers but NO gypsum_board`);
        if (isFireRated && !hasGyp) console.warn(`[extract] WARNING: ${id} is fire-rated but NO gypsum_board`);
      }

      return {
        assemblies,
        truncated: finishReason === "length",
        usage: {
          prompt_tokens:      usage.prompt_tokens      ?? 0,
          completion_tokens:  usage.completion_tokens  ?? 0,
          total_tokens:       usage.total_tokens       ?? 0,
        },
      };

    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (isRetryableError(lastError) && attempt < MAX_ATTEMPTS) {
        const delay = attempt * 3000;
        console.warn(
          `[extract] Attempt ${attempt} failed with transient error: "${lastError.message}" — retrying in ${delay / 1000}s`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Non-retryable or final attempt — rethrow
      throw lastError;
    }
  }

  throw lastError;
}
