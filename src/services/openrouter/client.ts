/**
 * OpenRouter API Client
 * Wrapper for OpenRouter API calls.
 * Supports text and PDF file inputs per https://openrouter.ai/docs/guides/overview/multimodal/pdfs
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn("OPENROUTER_API_KEY not found in environment variables");
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
}

/** Multimodal content: text and/or file (e.g. PDF) */
export type OpenRouterContentPart =
  | { type: "text"; text: string }
  | {
      type: "file";
      file: { filename: string; file_data: string };
    };

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  response_format?: { type: "json_object" };
  /** Optional: PDF parsing engine - "pdf-text" (free) or "mistral-ocr" for scanned docs */
  plugins?: Array<{
    id: string;
    pdf?: { engine: string };
  }>;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      /** Can be string or array of parts (e.g. when using file input) */
      content: string | Array<{ type?: string; text?: string }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Call OpenRouter API with retry logic
 */
export const callOpenRouter = async (
  request: OpenRouterRequest,
): Promise<OpenRouterResponse> => {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key not configured");
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-Title": "Drywall Spec Estimator",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data: OpenRouterResponse = await response.json();
  return data;
};

/**
 * Extract JSON from AI response.
 * Handles: raw JSON, markdown code blocks (```json ... ```), or text with embedded JSON.
 * Prefers brace extraction (first { to last }) so backticks inside JSON strings don't break parsing.
 */
export const extractJSON = <T>(content: string): T => {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Empty AI response");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // ignore
  }

  // Prefer: extract object between first { and last } (reliable when content is wrapped in ```json ... ``` or has backticks inside)
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // Response may be truncated (e.g. hit max_tokens). Try repairing by closing open structures.
      const slice = trimmed.slice(firstBrace, lastBrace + 1);
      const openBraces = (slice.match(/{/g) ?? []).length;
      const closeBraces = (slice.match(/}/g) ?? []).length;
      const openBrackets = (slice.match(/\[/g) ?? []).length;
      const closeBrackets = (slice.match(/]/g) ?? []).length;
      const needCloseBrackets = openBrackets - closeBrackets;
      const needCloseBraces = openBraces - closeBraces;
      let repaired = slice;
      if (needCloseBrackets > 0) repaired += "]".repeat(needCloseBrackets);
      if (needCloseBraces > 0) repaired += "}".repeat(needCloseBraces);
      try {
        return JSON.parse(repaired) as T;
      } catch {
        // fall through
      }
    }
  }

  // Try markdown code block ```json ... ``` or ``` ... ```
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Try extracting array between first [ and last ]
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1)) as T;
    } catch {
      // fall through
    }
  }

  console.error("extractJSON failed. Content preview:", trimmed.slice(0, 500));
  throw new Error("Failed to extract JSON from AI response");
};
