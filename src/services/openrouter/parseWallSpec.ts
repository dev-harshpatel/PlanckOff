/**
 * Wall Spec PDF Parser
 * Uses OpenRouter AI to extract structured wall data from PDFs
 */

import { callOpenRouter, extractJSON } from "./client";
import type { ParsedWallSpec, WallType } from "@/types/wallSpec";

const SYSTEM_PROMPT = `You are a construction document analyst specializing in wall specifications.
Your task is to extract structured data from wall specification PDFs.

IMPORTANT: Return ONLY valid JSON. Do not include any explanatory text before or after the JSON.

Extract for each wall type:
- Wall Type ID (e.g., P1, W4, WT-1, etc.)
- Materials used (identify keywords: GYPSUM WALLBOARD, METAL STUDS, INSULATION, POLY VAPOUR BARRIER, GYPSUM SHEATHING, CROSS BRACING)
- OC spacing (on-center spacing for studs, default to 16 inches if not specified, convert mm to inches if needed)
- Layer count (count how many layers of gypsum/drywall, default to 1, "Two Layers" = 2)
- Fire rating if mentioned (e.g., "1 Hour", "2 Hour")
- STC rating if mentioned (e.g., "STC 50")

Return JSON in this exact format:
{
  "wallTypes": [
    {
      "wallTypeId": "P1",
      "description": "Full wall type description",
      "materials": [
        {
          "keyword": "GYPSUM WALLBOARD",
          "description": "5/8\" Type X Gypsum Wallboard",
          "thickness": "5/8\\"",
          "specifications": "Type X, fire-rated"
        }
      ],
      "ocSpacing": 16,
      "layerCount": 1,
      "fireRating": "1 Hour",
      "stcRating": "STC 45",
      "rawText": "Original text from PDF"
    }
  ]
}`;

const USER_PROMPT_TEXT =
  "Analyze the attached wall specification PDF and extract all wall types with their materials and specifications. Return ONLY valid JSON in the format specified in the system prompt.";

/**
 * Parse wall spec by sending PDF directly to OpenRouter (native PDF support).
 * Uses OpenRouter multimodal API: https://openrouter.ai/docs/guides/overview/multimodal/pdfs
 * No local PDF parsing required; OpenRouter parses the file (pdf-text engine is free).
 */
export const parseWallSpecWithPDF = async (
  pdfBase64: string,
  fileName: string,
): Promise<ParsedWallSpec> => {
  const startTime = Date.now();

  // Data URL format per OpenRouter docs: data:application/pdf;base64,{base64}
  const fileData = pdfBase64.startsWith("data:")
    ? pdfBase64
    : `data:application/pdf;base64,${pdfBase64}`;

  const response = await callOpenRouter({
    model: "anthropic/claude-sonnet-4",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT_TEXT },
          {
            type: "file",
            file: {
              filename: fileName,
              file_data: fileData,
            },
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 16000, // Allow full wall spec JSON (many wall types); 4k was truncating
    response_format: { type: "json_object" },
    plugins: [
      {
        id: "file-parser",
        pdf: { engine: "pdf-text" }, // Free; use "mistral-ocr" for scanned PDFs
      },
    ],
  });

  const rawContent = response.choices[0]?.message?.content;
  if (rawContent == null) {
    throw new Error("No content in AI response");
  }

  // OpenRouter may return content as string or array of parts (e.g. with file annotations)
  const content =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent
            .map((part: { type?: string; text?: string }) =>
              part?.type === "text" && typeof part.text === "string"
                ? part.text
                : "",
            )
            .join("\n")
        : String(rawContent);

  if (!content.trim()) {
    console.error(
      "parseWallSpecWithPDF: empty content. Raw message:",
      JSON.stringify(response.choices[0]?.message).slice(0, 500),
    );
    throw new Error("No text content in AI response");
  }

  console.log(
    "parseWallSpecWithPDF: content length:",
    content.length,
    "preview:",
    content.slice(0, 400),
  );

  const parsed = extractJSON<{ wallTypes?: WallType[] } | WallType[]>(content);
  const rawWallTypes: WallType[] = Array.isArray(parsed)
    ? (parsed as WallType[])
    : ((parsed as { wallTypes?: WallType[] }).wallTypes ?? []);
  const wallTypes = validateAndNormalizeWallTypes(rawWallTypes);

  return {
    wallTypes,
    totalWallTypes: wallTypes.length,
    processingTime: Date.now() - startTime,
    aiModel: response.model,
  };
};

/**
 * Parse wall spec from extracted PDF text (fallback when not using native PDF).
 */
export const parseWallSpecPDF = async (
  pdfText: string,
): Promise<ParsedWallSpec> => {
  const startTime = Date.now();

  try {
    const response = await callOpenRouter({
      model: "anthropic/claude-3.5-sonnet",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this wall specification document and extract all wall types with their materials and specifications:\n\n${pdfText}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const rawContent = response.choices[0]?.message?.content;
    if (rawContent == null) {
      throw new Error("No content in AI response");
    }
    const content =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) =>
                part?.type === "text" && typeof part.text === "string"
                  ? part.text
                  : "",
              )
              .join("\n")
          : String(rawContent);

    const parsed = extractJSON<{ wallTypes: WallType[] }>(content);
    const wallTypes = validateAndNormalizeWallTypes(parsed.wallTypes);

    return {
      wallTypes,
      totalWallTypes: wallTypes.length,
      processingTime: Date.now() - startTime,
      aiModel: response.model,
    };
  } catch (error) {
    console.error("Failed to parse wall spec PDF:", error);
    throw new Error(
      `PDF parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Validate and normalize wall type data from AI
 */
const validateAndNormalizeWallTypes = (wallTypes: any[]): WallType[] => {
  if (!Array.isArray(wallTypes)) {
    throw new Error("Invalid wall types data: expected array");
  }

  return wallTypes.map((wt, index) => {
    // Ensure required fields exist
    if (!wt.wallTypeId) {
      throw new Error(`Wall type at index ${index} missing wallTypeId`);
    }

    // Normalize OC spacing (default 16")
    let ocSpacing = parseFloat(wt.ocSpacing) || 16;

    // Convert from mm to inches if value is very large (likely mm)
    if (ocSpacing > 100) {
      ocSpacing = Math.round((ocSpacing / 25.4) * 100) / 100; // mm to inches, round to 2 decimals
    }

    // Normalize layer count (default 1)
    const layerCount = parseInt(wt.layerCount) || 1;

    // Ensure materials is an array
    const materials = Array.isArray(wt.materials) ? wt.materials : [];

    return {
      wallTypeId: wt.wallTypeId.toString().trim(),
      description: wt.description || `Wall Type ${wt.wallTypeId}`,
      materials,
      ocSpacing,
      layerCount,
      fireRating: wt.fireRating || undefined,
      stcRating: wt.stcRating || undefined,
      rawText: wt.rawText || undefined,
    };
  });
};
