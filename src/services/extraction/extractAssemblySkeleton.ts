/**
 * Sub-step 1.0 — Extract assembly skeleton (IDs, types, ratings only).
 * One lightweight LLM call. Output anchors all subsequent category sub-steps.
 */
import { repairJSONForAssemblyExtraction, stripMarkdownAndTrim } from "@/lib/utils/jsonRepair";

export interface AssemblySkeleton {
  assembly_id: string;
  assembly_type: string;
  fire_rating: string | null;
  stc_rating: string | null;
}

export async function extractAssemblySkeleton(
  pdfBase64: string,
  apiKey: string,
  promptText: string,
): Promise<AssemblySkeleton[]> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 4096,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`[skeleton] OpenRouter error (${response.status}): ${err.slice(0, 300)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage ?? {};
  console.log(`[skeleton] ${usage.total_tokens ?? "?"} tokens — ${raw.length} chars`);

  const cleaned = stripMarkdownAndTrim(raw);
  let parsed: { assemblies?: AssemblySkeleton[] };
  try {
    parsed = JSON.parse(cleaned) as { assemblies?: AssemblySkeleton[] };
  } catch {
    parsed = JSON.parse(repairJSONForAssemblyExtraction(cleaned)) as { assemblies?: AssemblySkeleton[] };
  }

  const assemblies = (parsed.assemblies ?? []).filter(
    (a) => typeof a.assembly_id === "string" && a.assembly_id.trim() !== "",
  );

  console.log(`[skeleton] Found ${assemblies.length} assemblies: ${assemblies.map(a => a.assembly_id).join(", ")}`);
  return assemblies;
}
