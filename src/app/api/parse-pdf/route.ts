/**
 * API Route: Parse Wall Spec PDF
 * POST /api/parse-pdf
 *
 * Sends the PDF directly to OpenRouter; OpenRouter parses it (no local PDF library).
 * See: https://openrouter.ai/docs/guides/overview/multimodal/pdfs
 */

import { NextRequest, NextResponse } from "next/server";
import { parseWallSpecWithPDF } from "@/services/openrouter/parseWallSpec";
import type { ParsePDFRequest, ParsePDFResponse } from "@/types/wallSpec";
import { withAuth } from "@/lib/auth/api-helpers";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds for AI processing

export const POST = withAuth(async (request: NextRequest) => {
  let body: ParsePDFRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" } as ParsePDFResponse,
      { status: 400 },
    );
  }

  try {
    console.log("\n=== PDF PARSING REQUEST ===");
    console.log("File name:", body.fileName);
    console.log("PDF base64 length:", body.pdfBase64?.length ?? 0, "characters");

    if (!body.pdfBase64) {
      return NextResponse.json(
        { success: false, error: "Missing PDF data" } as ParsePDFResponse,
        { status: 400 },
      );
    }

    console.log("Sending PDF to OpenRouter (native PDF parsing)...");

    const result = await parseWallSpecWithPDF(
      body.pdfBase64,
      body.fileName || "wall-spec.pdf",
    );

    console.log("\n=== AI RESPONSE ===");
    console.log("Wall types found:", result.totalWallTypes);
    console.log("Processing time:", result.processingTime, "ms");
    console.log("AI model:", result.aiModel);
    result.wallTypes.forEach((wt, idx) => {
      console.log(
        `  ${idx + 1}. ${wt.wallTypeId} - ${wt.description} (OC: ${wt.ocSpacing}", layers: ${wt.layerCount})`,
      );
    });

    return NextResponse.json({
      success: true,
      data: result,
    } as ParsePDFResponse);
  } catch (error) {
    console.error("\n=== PDF PARSING ERROR ===");
    console.error(error);
    const errMessage =
      error instanceof Error ? error.message : "Failed to parse PDF";
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return NextResponse.json(
      { success: false, error: errMessage } as ParsePDFResponse,
      { status: 500 },
    );
  }
});
