/**
 * Finalize assemblies: combine material match output with takeoff data
 * using the unified prompt to produce QuickBid-style final JSON
 */

import { readFile } from "fs/promises";
import path from "path";

const repairJSON = (input: string): string => {
  try {
    JSON.parse(input);
    return input;
  } catch {
    // continue to repair
  }

  let fixed = input
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  // Strategy 1: Truncate to last complete assembly (handles truncation + unterminated strings)
  // Match end of assembly: "status":"OK"} or "status":"REVIEW REQUIRED"} (with or without trailing comma/])
  const statusEndPattern = /"status"\s*:\s*"(?:OK|REVIEW REQUIRED)"\s*}/g;
  let lastCompleteEnd = -1;
  let match;
  while ((match = statusEndPattern.exec(fixed)) !== null) {
    lastCompleteEnd = match.index + match[0].length;
  }
  if (lastCompleteEnd > 0) {
    let truncated = fixed.substring(0, lastCompleteEnd);
    truncated = truncated.replace(/,\s*$/, "");
    truncated += "\n  ]\n}";
    try {
      JSON.parse(truncated);
      return truncated;
    } catch {
      // fall through
    }
  }

  // Strategy 2: Alternative pattern - } ] } (end of labor array, then assembly)
  const assemblyEndPattern = /\}\s*\]\s*\}\s*(?=,|\])/g;
  lastCompleteEnd = -1;
  while ((match = assemblyEndPattern.exec(fixed)) !== null) {
    lastCompleteEnd = match.index + match[0].length;
  }
  if (lastCompleteEnd > 0) {
    let truncated = fixed.substring(0, lastCompleteEnd);
    truncated = truncated.replace(/,\s*$/, "");
    truncated += "\n  ]\n}";
    try {
      JSON.parse(truncated);
      return truncated;
    } catch {
      // fall through
    }
  }

  // Strategy 3: Close unterminated string at end, fix trailing comma
  let inString = false;
  let escape = false;
  for (const ch of fixed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') inString = !inString;
  }
  if (inString) fixed += '"';
  fixed = fixed.replace(/,\s*$/, "");

  // Strategy 4: Balance brackets
  const closeMap: Record<string, string> = { "{": "}", "[": "]" };
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (const ch of fixed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
  }
  while (stack.length > 0) {
    const open = stack.pop()!;
    fixed += closeMap[open];
  }

  return fixed;
};

export interface FinalizeInput {
  assemblies: unknown[];
}

export interface ProjectContext {
  country?: string | null;
  province?: string | null;
  location?: string | null;
}

export interface FinalizeResult {
  assemblies?: unknown[];
  [key: string]: unknown;
}

// Reduced batch size for faster per-batch completion (Strategy 2: Optimization)
const BATCH_SIZE = 10;
const MAX_RETRIES = 2;

const callFinalizeBatch = async (
  materialMatch: FinalizeInput,
  takeoffBatch: unknown[],
  materialDb: unknown,
  promptRaw: string,
  apiKey: string,
  projectContext?: ProjectContext,
): Promise<unknown[]> => {
  const projectContextBlock = projectContext
    ? `PROJECT CONTEXT (use country + province to select correct construction code gauge requirements):
${JSON.stringify({ country: projectContext.country ?? null, province: projectContext.province ?? null, location: projectContext.location ?? null }, null, 2)}

`
    : "";

  const userMessage = `${projectContextBlock}INPUT 1 – Assembly Specification JSON (material match). Match assembly_id to takeoff wall_type:
${JSON.stringify(materialMatch, null, 2)}

INPUT 2 – Takeoff JSON (batch). Output ONE assembly for EACH row:
${JSON.stringify(takeoffBatch, null, 2)}

INPUT 3 – Material & Labor Database:
${JSON.stringify(materialDb, null, 2)}

Output exactly ${takeoffBatch.length} assemblies in {"assemblies": [...]}. One per takeoff row. Match wall_type to assembly_id. Return valid JSON only.`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        // model: "openai/gpt-4o-mini",
        max_tokens: 32768,
        messages: [
          { role: "system", content: promptRaw },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${err}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let parsed: { assemblies?: unknown[] };
  try {
    parsed = JSON.parse(cleaned) as { assemblies?: unknown[] };
  } catch (firstErr) {
    try {
      parsed = JSON.parse(repairJSON(cleaned)) as { assemblies?: unknown[] };
    } catch (repairErr) {
      console.error(
        "[finalize] JSON parse failed. Response length:",
        cleaned.length,
        "Last 200 chars:",
        cleaned.slice(-200),
      );
      throw new Error(
        `Failed to parse AI response: ${firstErr instanceof Error ? firstErr.message : firstErr}`,
      );
    }
  }

  return Array.isArray(parsed.assemblies) ? parsed.assemblies : [];
};

export const finalizeAssembliesWithTakeoff = async (
  materialMatch: FinalizeInput,
  apiKey: string,
  takeoffData?: unknown[],
  projectContext?: ProjectContext,
): Promise<FinalizeResult> => {
  const dataDir = path.join(process.cwd(), "data");
  const promptPath = path.join(process.cwd(), "prompt", "prompt.txt");

  // Strategy 1: Use provided takeoff data or fall back to file (for backwards compatibility)
  let takeoffRows: unknown[] = [];
  if (takeoffData && Array.isArray(takeoffData)) {
    takeoffRows = takeoffData;
  } else {
    // Fallback: read from file (for legacy calls)
    const takeoffRaw = await readFile(
      path.join(dataDir, "take_off_data.json"),
      "utf-8",
    );
    takeoffRows = JSON.parse(takeoffRaw) as unknown[];
  }

  const [materialDbRaw, promptRaw] = await Promise.all([
    readFile(path.join(dataDir, "material-database.json"), "utf-8"),
    readFile(promptPath, "utf-8"),
  ]);

  const materialDb = JSON.parse(materialDbRaw) as unknown;
  const rows = Array.isArray(takeoffRows) ? takeoffRows : [];

  const allAssemblies: unknown[] = [];
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  console.log(
    `[finalize] Processing ${rows.length} takeoff rows in ${totalBatches} batch(es)`,
  );

  for (let i = 0; i < totalBatches; i++) {
    const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    let batchAssemblies: unknown[] = [];
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        batchAssemblies = await callFinalizeBatch(
          materialMatch,
          batch,
          materialDb,
          promptRaw,
          apiKey,
          projectContext,
        );
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[finalize] Batch ${i + 1}/${totalBatches} attempt ${attempt}/${MAX_RETRIES} failed:`,
          msg,
        );
        if (attempt >= MAX_RETRIES) throw err;
      }
    }
    allAssemblies.push(...batchAssemblies);
    console.log(
      `[finalize] Batch ${i + 1}/${totalBatches} — ${batchAssemblies.length} assemblies`,
    );
  }

  console.log(`[finalize] Total produced: ${allAssemblies.length} assemblies`);

  return { assemblies: allAssemblies };
};
