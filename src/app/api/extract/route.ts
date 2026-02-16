import { NextRequest, NextResponse } from "next/server";
import { saveAssemblyExtraction } from "@/lib/db/assemblyData";
import { extractAssembliesFromPDF } from "@/services/openrouter/extractAssemblies";
// import { writeJsonToLocal } from "@/lib/utils/localJsonStorage";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  console.log("[extract] POST request received");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[extract] OPENROUTER_API_KEY is not configured");
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    let body: { pdfBase64?: string; projectId?: string };
    try {
      body = await req.json();
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Invalid JSON body";
      console.error("[extract] Failed to parse request body:", msg);
      return NextResponse.json(
        { error: `Invalid request body: ${msg}` },
        { status: 400 },
      );
    }

    const { pdfBase64, projectId } = body;
    if (!pdfBase64) {
      console.error("[extract] No pdfBase64 provided");
      return NextResponse.json(
        { error: "No pdfBase64 provided" },
        { status: 400 },
      );
    }

    const totalStart = Date.now();

    console.log(`[extract] Starting PDF extraction, projectId: ${projectId ?? "none"}`);
    const extractStart = Date.now();
    const result = await extractAssembliesFromPDF(pdfBase64, apiKey);
    const extractMs = Date.now() - extractStart;
    console.log(`[extract] Extracted ${result.assemblies.length} assemblies from PDF — ${(extractMs / 1000).toFixed(2)}s`);

    const timestamp = Date.now();
    const filename = `assembly-data-${timestamp}.json`;

    const { data: savedData, error: saveError } = await saveAssemblyExtraction(
      { assemblies: result.assemblies },
      filename,
      projectId,
    );
    if (saveError) {
      console.error("[extract] DB save error:", saveError);
      throw new Error(`Failed to save to database: ${JSON.stringify(saveError)}`);
    }

    // const localPath = await writeJsonToLocal("assembly", {
    //   assemblies: result.assemblies,
    // });
    console.log(`[extract] DB: ${savedData?.id}`);

    const totalMs = Date.now() - totalStart;
    console.log(`[extract] Success. Phase times — extraction: ${(extractMs / 1000).toFixed(2)}s, total: ${(totalMs / 1000).toFixed(2)}s`);
    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
      extractionId: savedData?.id,
      filename,
      assemblyCount: result.assemblies.length,
      truncated: result.truncated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[extract] Error:", message);
    if (stack) console.error("[extract] Stack:", stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
