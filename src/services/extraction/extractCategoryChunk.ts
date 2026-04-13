/**
 * Sub-steps 1.1–1.6 — Extract one category group from the PDF.
 * Each call receives: PDF + skeleton (assembly list) + focused category prompt.
 * Returns partial assembly objects containing only the extracted category fields.
 */
import { repairJSONForAssemblyExtraction, stripMarkdownAndTrim } from "@/lib/utils/jsonRepair";
import type { AssemblySkeleton } from "./extractAssemblySkeleton";

export interface CategoryChunkResult {
  assembly_id: string;
  [category: string]: unknown; // e.g. steel_framing: [...], insulation: [...]
}

export async function extractCategoryChunk(
  pdfBase64: string,
  apiKey: string,
  promptText: string,
  skeleton: AssemblySkeleton[],
  chunkLabel: string, // e.g. "gypsum", "steel_framing" — for logging only
): Promise<CategoryChunkResult[]> {
  // Append skeleton to the prompt so the model knows which assembly IDs to fill
  const skeletonContext = `\nASSEMBLY LIST (IDs only — populate these):\n${JSON.stringify(
    skeleton.map(s => ({ assembly_id: s.assembly_id, assembly_type: s.assembly_type })),
  )}`;

  const fullPromptText = promptText + skeletonContext;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 16384,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: fullPromptText },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`[chunk:${chunkLabel}] OpenRouter error (${response.status}): ${err.slice(0, 300)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage ?? {};
  console.log(`[chunk:${chunkLabel}] ${usage.total_tokens ?? "?"} tokens — ${raw.length} chars`);

  const cleaned = stripMarkdownAndTrim(raw);
  let parsed: { assemblies?: CategoryChunkResult[] };
  try {
    parsed = JSON.parse(cleaned) as { assemblies?: CategoryChunkResult[] };
  } catch {
    parsed = JSON.parse(repairJSONForAssemblyExtraction(cleaned)) as { assemblies?: CategoryChunkResult[] };
  }

  const validIds = new Set(skeleton.map(s => s.assembly_id));
  const results = (parsed.assemblies ?? []).filter(
    (a) => typeof a.assembly_id === "string" && validIds.has(a.assembly_id),
  );

  console.log(`[chunk:${chunkLabel}] Populated ${results.length}/${skeleton.length} assemblies`);
  return results;
}
