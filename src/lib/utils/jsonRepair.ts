/**
 * Shared JSON repair utilities for AI pipeline responses.
 * Handles truncated, malformed, or markdown-wrapped JSON from OpenRouter.
 */

/** Close any unclosed brackets in a string. */
export const closeUnclosedBrackets = (str: string): string => {
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

/** Strip markdown code blocks and trim. */
export const stripMarkdownAndTrim = (input: string): string =>
  input
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

/** Repair JSON for assembly extraction output (extract step). */
export const repairJSONForAssemblyExtraction = (input: string): string => {
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

  return closeUnclosedBrackets(fixed);
};

/** Repair JSON for material match output (match step). */
export const repairJSONForMaterialMatch = (input: string): string => {
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

  return closeUnclosedBrackets(fixed);
};

/** Repair JSON for unified prompt output (finalize with full QuickBid structure). */
export const repairJSONForUnifiedOutput = (
  input: string,
  logTag: string = "[process]",
): string => {
  try {
    JSON.parse(input);
    return input;
  } catch {
    // continue to repair
  }

  let fixed = stripMarkdownAndTrim(input);

  // Strategy 1: Truncated response — find last complete assembly
  const assemblyBoundaryPattern = /\}\s*,\s*"assembly_id"\s*:/g;
  let lastCompleteEnd = -1;
  let match;
  while ((match = assemblyBoundaryPattern.exec(fixed)) !== null) {
    lastCompleteEnd = match.index;
  }
  if (lastCompleteEnd > 0) {
    let truncated = fixed.substring(0, lastCompleteEnd + 1);
    truncated = truncated.replace(/,\s*$/, "");
    truncated += "\n  ]\n}";
    try {
      JSON.parse(truncated);
      console.log(`${logTag} Repaired by truncating at last complete assembly`);
      return truncated;
    } catch {
      // fall through
    }
  }

  // Strategy 2: statusEndPattern
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
        console.log(`${logTag} Repaired by completing truncated key`);
        return closed;
      } catch {
        // fall through
      }
    }
  }

  // Strategy 5: Backward scan — find last complete element boundary
  const candidatePositions: number[] = [];
  let searchFrom = fixed.length;
  for (let attempt = 0; attempt < 30 && searchFrom > fixed.length * 0.3; attempt++) {
    const pos1 = fixed.lastIndexOf("},", searchFrom - 1);
    const pos2 = fixed.lastIndexOf("}]", searchFrom - 1);
    const pos = Math.max(pos1, pos2);
    if (pos <= 0) break;
    candidatePositions.push(pos);
    searchFrom = pos;
  }

  for (const pos of candidatePositions) {
    let truncated = fixed.substring(0, pos + 1);
    truncated = truncated.replace(/,\s*$/, "");
    const closed = closeUnclosedBrackets(truncated);
    try {
      JSON.parse(closed);
      console.log(`${logTag} Repaired by backward-scan truncation at position ${pos}/${fixed.length}`);
      return closed;
    } catch {
      continue;
    }
  }

  // Strategy 6: Strip trailing partial content, then close brackets
  let stripped = fixed;
  let inStr = false;
  let esc = false;
  for (const ch of stripped) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
  }
  if (inStr) stripped += '"';

  stripped = stripped
    .replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"?\s*$/, "")
    .replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*\S*\s*$/, "")
    .replace(/,?\s*"(?:[^"\\]|\\.)*"?\s*:?\s*$/, "")
    .replace(/,\s*$/, "");

  const closed = closeUnclosedBrackets(stripped);
  try {
    JSON.parse(closed);
    console.log(`${logTag} Repaired by stripping partial tail + closing brackets`);
    return closed;
  } catch {
    // fall through
  }

  // Strategy 7: Last resort — close unterminated string and brackets
  let inString = false;
  let escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') inString = !inString;
  }
  if (inString) fixed += '"';
  fixed = fixed.replace(/,\s*$/, "");

  return closeUnclosedBrackets(fixed);
};
