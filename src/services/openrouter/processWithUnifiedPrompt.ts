/**
 * Batched pipeline: assembly JSON + takeoff JSON + material DB → final QuickBid-style JSON
 * Splits assemblies into batches to avoid output token limits. Token usage logged.
 * Batches run in parallel (CONCURRENCY) for faster completion.
 */

import { readFile } from "fs/promises";
import path from "path";

// Reduced batch size for faster per-batch completion (Strategy 2: Optimization)
const BATCH_SIZE = 8;
const CONCURRENCY = 2;
const MAX_RETRIES = 2;

export interface UnifiedPromptInput {
  assemblyJson: unknown;
  takeoffJson: unknown;
  materialDb: unknown;
}

export interface UnifiedPromptResult {
  assemblies: unknown[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const TAG = "[process]";

const elapsed = (start: number) => `${((performance.now() - start) / 1000).toFixed(2)}s`;

/** Trim material DB to fields needed for matching — reduces payload size per batch */
const trimMaterialDb = (db: unknown): unknown[] => {
  const arr = Array.isArray(db) ? db : [];
  return arr.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      code: r.code ?? "",
      section: r.section ?? "",
      type: r.type ?? "",
      description: r.description ?? "",
      category: r.category ?? "",
      matCost: r.matCost ?? "",
      per: r.per ?? "",
      manufacturer: r.manufacturer ?? "",
    };
  });
};

const closeUnclosedBrackets = (str: string): string => {
  const closeMap: Record<string, string> = { "{": "}", "[": "]" };
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of str) {
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
  let result = str.replace(/,\s*$/, "");
  while (stack.length > 0) {
    const open = stack.pop()!;
    result += closeMap[open];
  }
  return result;
};

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

  // Strategy 1: Truncated response — find last complete assembly and cut there
  // Pattern: }, followed by "assembly_id" (start of next assembly) — truncate before incomplete one
  const assemblyBoundaryPattern = /\}\s*,\s*"assembly_id"\s*:/g;
  let lastCompleteEnd = -1;
  let match;
  while ((match = assemblyBoundaryPattern.exec(fixed)) !== null) {
    lastCompleteEnd = match.index; // position of } before comma
  }
  if (lastCompleteEnd > 0) {
    let truncated = fixed.substring(0, lastCompleteEnd + 1);
    truncated = truncated.replace(/,\s*$/, "");
    truncated += "\n  ]\n}";
    try {
      JSON.parse(truncated);
      console.log(`${TAG} Repaired by truncating at last complete assembly`);
      return truncated;
    } catch {
      // fall through
    }
  }

  // Strategy 2: statusEndPattern (legacy)
  const statusEndPattern = /"status"\s*:\s*"(?:OK|REVIEW REQUIRED)"\s*}/g;
  lastCompleteEnd = -1;
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

  // Strategy 3: assemblyEndPattern
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

  // Strategy 4: Truncation inside object — complete common truncated keys
  const truncationFixes: Array<[RegExp, string]> = [
    [/"ceiling_$/, '"ceiling_area": null'],
    [/"area_parementer":\s*$/, '"area_parementer": null'],
    [/"total_length":\s*$/, '"total_length": 0'],
  ];
  for (const [pattern, replacement] of truncationFixes) {
    if (pattern.test(fixed)) {
      const fixedAttempt = fixed.replace(pattern, replacement);
      try {
        const closed = closeUnclosedBrackets(fixedAttempt);
        JSON.parse(closed);
        console.log(`${TAG} Repaired by completing truncated key`);
        return closed;
      } catch {
        // fall through
      }
    }
  }

  // Strategy 5: Backward scan — find last complete element boundary (}, or }])
  // Try truncating at successively earlier } positions until we get valid JSON
  {
    const candidatePositions: number[] = [];
    let searchFrom = fixed.length;
    for (let attempt = 0; attempt < 30 && searchFrom > fixed.length * 0.3; attempt++) {
      const pos1 = fixed.lastIndexOf('},', searchFrom - 1);
      const pos2 = fixed.lastIndexOf('}]', searchFrom - 1);
      const pos = Math.max(pos1, pos2);
      if (pos <= 0) break;
      candidatePositions.push(pos);
      searchFrom = pos;
    }

    for (const pos of candidatePositions) {
      let truncated = fixed.substring(0, pos + 1); // include the }
      truncated = truncated.replace(/,\s*$/, "");
      const closed = closeUnclosedBrackets(truncated);
      try {
        JSON.parse(closed);
        console.log(`${TAG} Repaired by backward-scan truncation at position ${pos}/${fixed.length}`);
        return closed;
      } catch {
        continue;
      }
    }
  }

  // Strategy 6: Strip trailing partial content, then close brackets
  // Handles truncation mid-key ("layers":) or mid-value ("layers": "partia)
  {
    let stripped = fixed;
    // Close any unterminated string
    let inStr = false;
    let esc = false;
    for (const ch of stripped) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
    }
    if (inStr) stripped += '"';

    // Remove trailing partial key-value patterns:
    // "key": "partial_value"  OR  "key":  OR  "key  OR  , trailing
    stripped = stripped
      .replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"?\s*$/, '')  // "key": "val" or "key": "partial
      .replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*\S*\s*$/, '')                  // "key": number/bool/null (partial)
      .replace(/,?\s*"(?:[^"\\]|\\.)*"?\s*:?\s*$/, '')                      // "key": or "key or "parti
      .replace(/,\s*$/, '');

    const closed = closeUnclosedBrackets(stripped);
    try {
      JSON.parse(closed);
      console.log(`${TAG} Repaired by stripping partial tail + closing brackets`);
      return closed;
    } catch {
      // fall through
    }
  }

  // Strategy 7: Last resort — just close unterminated string and brackets
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

/**
 * Normalize the AI response into an array of assemblies.
 * Handles multiple formats:
 *   1. { "assemblies": [...] }               — expected format
 *   2. { "0": {...}, "1": {...}, ... }        — numeric-keyed dict (Gemini quirk)
 *   3. { "someOtherKey": [...] }              — different array key
 *   4. [ {...}, {...} ]                       — bare array
 */
const extractAssemblies = (parsed: unknown): unknown[] => {
  // Case 4: bare array
  if (Array.isArray(parsed)) {
    console.log(`${TAG} Response is a bare array with ${parsed.length} items`);
    return parsed;
  }

  if (typeof parsed !== "object" || parsed === null) {
    console.error(`${TAG} Response is not an object or array, type: ${typeof parsed}`);
    return [];
  }

  const obj = parsed as Record<string, unknown>;
  const topKeys = Object.keys(obj);
  console.log(`${TAG} Parsed response — ${topKeys.length} top-level keys`);

  // Case 1: has "assemblies" array
  if (Array.isArray(obj.assemblies)) {
    console.log(`${TAG} Found "assemblies" key with ${obj.assemblies.length} items`);
    return obj.assemblies;
  }

  // Case 2: numeric-keyed dict like {"0": {...}, "1": {...}, ...}
  const allNumeric = topKeys.length > 0 && topKeys.every((k) => /^\d+$/.test(k));
  if (allNumeric) {
    const sorted = topKeys
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => obj[String(n)]);
    console.log(`${TAG} Numeric-keyed dict detected — converted ${sorted.length} entries to array`);
    return sorted;
  }

  // Case 3: find first array value
  for (const key of topKeys) {
    if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) {
      console.log(`${TAG} No "assemblies" key, using "${key}" (${(obj[key] as unknown[]).length} items)`);
      return obj[key] as unknown[];
    }
  }

  console.error(`${TAG} Could not extract assemblies. Keys: ${JSON.stringify(topKeys.slice(0, 10))}`);
  return [];
};

/**
 * Call OpenRouter for a single batch and parse the response.
 */
const callBatch = async (
  assemblyJson: unknown,
  takeoffJson: unknown,
  materialDb: unknown,
  promptRaw: string,
  apiKey: string,
  batchLabel: string,
): Promise<{ assemblies: unknown[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> => {
  const userMessage = `INPUT 1 – Assembly Specification JSON (from PDF):
${JSON.stringify(assemblyJson)}

INPUT 2 – Takeoff JSON (from Excel):
${JSON.stringify(takeoffJson)}

INPUT 3 – Material & Labor Database JSON:
${JSON.stringify(materialDb)}

CRITICAL: For EACH row in INPUT 2, find the matching assembly in INPUT 1 where assembly_id = wall_type. Transform to QuickBid format. Output ALL assemblies for ALL unique (assembly_id, height) combinations. Return compact valid JSON only: {"assemblies": [...]}.`;

  const fullPromptChars = promptRaw.length + userMessage.length;
  const inputTokenEstimate = Math.ceil(fullPromptChars / 4);
  console.log(
    `${TAG} ${batchLabel} Message built — ~${inputTokenEstimate} tokens (${fullPromptChars} chars)`,
  );

  console.log(`${TAG} ${batchLabel} Calling OpenRouter (google/gemini-2.5-pro)...`);
  const apiStart = performance.now();

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        max_tokens: 200000,
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
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const apiTime = elapsed(apiStart);
  const usage = data.usage ?? {};
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? 0;
  const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";
  console.log(
    `${TAG} ${batchLabel} OpenRouter responded [${apiTime}] — ${promptTokens} input + ${completionTokens} output = ${totalTokens} total tokens (finish_reason: ${finishReason})`,
  );
  if (finishReason === "length") {
    console.warn(`${TAG} ${batchLabel} ⚠ Response was truncated (finish_reason=length). Will attempt JSON repair.`);
  }

  // --- Parse response ---
  const raw = data.choices?.[0]?.message?.content ?? "";
  console.log(`${TAG} ${batchLabel} Raw response length: ${raw.length} chars`);

  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (firstErr) {
    console.log(`${TAG} ${batchLabel} First JSON.parse failed, attempting repair...`);
    try {
      parsed = JSON.parse(repairJSON(cleaned));
      console.log(`${TAG} ${batchLabel} JSON parsed after repair`);
    } catch {
      console.error(`${TAG} ${batchLabel} JSON parse failed. Response length: ${cleaned.length}`);
      console.error(`${TAG} ${batchLabel} First 500 chars: ${cleaned.slice(0, 500)}`);
      console.error(`${TAG} ${batchLabel} Last 500 chars: ${cleaned.slice(-500)}`);
      throw new Error(
        `${batchLabel} Failed to parse AI response: ${firstErr instanceof Error ? firstErr.message : firstErr}`,
      );
    }
  }

  const assemblies = extractAssemblies(parsed);
  console.log(`${TAG} ${batchLabel} — ${assemblies.length} assemblies parsed`);

  return {
    assemblies,
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
  };
};

/**
 * Run unified prompt in batches: splits assemblies into groups of BATCH_SIZE,
 * sends separate API calls, merges results. Prevents output token truncation.
 */
export const finalizeWithUnifiedPrompt = async (
  input: UnifiedPromptInput,
  apiKey: string,
): Promise<UnifiedPromptResult> => {
  const fnStart = performance.now();

  // --- Load prompt ---
  const promptPath = path.join(process.cwd(), "prompt", "prompt.txt");
  console.log(`${TAG} Loading prompt from: ${promptPath}`);
  const promptRaw = await readFile(promptPath, "utf-8");
  console.log(`${TAG} Prompt loaded (${promptRaw.length} chars)`);

  // --- Extract unique assembly IDs ---
  const assemblyData = input.assemblyJson as { assemblies?: Array<{ assembly_id?: string }> };
  const allAssemblies = assemblyData?.assemblies ?? [];
  const assemblyIds = allAssemblies
    .map((a) => a.assembly_id)
    .filter((id): id is string => typeof id === "string");

  const takeoffRows = Array.isArray(input.takeoffJson) ? input.takeoffJson : [];

  const materialDbTrimmed = trimMaterialDb(input.materialDb);
  const dbOrigSize = JSON.stringify(input.materialDb).length;
  const dbTrimSize = JSON.stringify(materialDbTrimmed).length;
  console.log(
    `${TAG} Material DB trimmed: ${(dbOrigSize / 1024).toFixed(0)} KB → ${(dbTrimSize / 1024).toFixed(0)} KB`,
  );

  console.log(
    `${TAG} Found ${assemblyIds.length} assemblies, ${takeoffRows.length} takeoff rows — batch size: ${BATCH_SIZE}, concurrency: ${CONCURRENCY}`,
  );

  // --- Batch assemblies (run CONCURRENCY batches in parallel) ---
  const totalBatches = Math.ceil(assemblyIds.length / BATCH_SIZE);
  const allResults: unknown[] = [];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const processOneBatch = async (batchIndex: number) => {
    const batchIds = assemblyIds.slice(
      batchIndex * BATCH_SIZE,
      (batchIndex + 1) * BATCH_SIZE,
    );
    const batchIdSet = new Set(batchIds);
    const batchLabel = `[Batch ${batchIndex + 1}/${totalBatches}]`;

    const batchAssemblyJson = {
      assemblies: allAssemblies.filter(
        (a) => a.assembly_id && batchIdSet.has(a.assembly_id),
      ),
    };

    const batchTakeoff = takeoffRows.filter(
      (row: Record<string, unknown>) =>
        typeof row.wall_type === "string" && batchIdSet.has(row.wall_type),
    );

    console.log(
      `\n${TAG} ${batchLabel} Processing assemblies: ${batchIds.join(", ")} (${batchAssemblyJson.assemblies.length} assemblies, ${batchTakeoff.length} takeoff rows)`,
    );

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const batchResult = await callBatch(
          batchAssemblyJson,
          batchTakeoff,
          materialDbTrimmed,
          promptRaw,
          apiKey,
          batchLabel,
        );
        return batchResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `${TAG} ${batchLabel} Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`,
        );
        if (attempt >= MAX_RETRIES) throw err;
      }
    }
    return null;
  };

  for (let offset = 0; offset < totalBatches; offset += CONCURRENCY) {
    const chunkSize = Math.min(CONCURRENCY, totalBatches - offset);
    const chunkPromises = Array.from({ length: chunkSize }, (_, j) =>
      processOneBatch(offset + j),
    );
    const chunkResults = await Promise.all(chunkPromises);

    for (const batchResult of chunkResults) {
      if (batchResult) {
        allResults.push(...batchResult.assemblies);
        totalUsage.prompt_tokens += batchResult.usage.prompt_tokens;
        totalUsage.completion_tokens += batchResult.usage.completion_tokens;
        totalUsage.total_tokens += batchResult.usage.total_tokens;
      }
    }
  }

  console.log(`\n${TAG} All batches complete — ${allResults.length} total assemblies [${elapsed(fnStart)}]`);
  console.log(`${TAG} Total tokens: ${totalUsage.prompt_tokens} input + ${totalUsage.completion_tokens} output = ${totalUsage.total_tokens}`);

  return {
    assemblies: allResults,
    usage: totalUsage,
  };
};
