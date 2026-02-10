import { NextRequest, NextResponse } from "next/server";
import { extractAssembliesFromPDF } from "@/services/openrouter/extractAssemblies";
import { saveAssemblyExtraction } from "@/lib/db/assemblyData";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    const { pdfBase64, projectId } = await req.json();
    if (!pdfBase64) {
      return NextResponse.json(
        { error: "No pdfBase64 provided" },
        { status: 400 },
      );
    }

    console.log(`[extract] PDF base64 length: ${pdfBase64.length} chars`);
    const startTime = Date.now();

    const result = await extractAssembliesFromPDF(pdfBase64, apiKey);

    // Generate filename
    const timestamp = Date.now();
    const filename = `assembly-data-${timestamp}.json`;

    // Save to database
    const { data: savedData, error: saveError } = await saveAssemblyExtraction(
      { assemblies: result.assemblies },
      filename,
      projectId,
    );

    if (saveError) {
      throw new Error(`Failed to save to database: ${saveError}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[extract] Saved to DB (${filename}) — ${result.assemblies.length} assemblies in ${elapsed}s`,
    );

    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
      extractionId: savedData.id,
      filename,
      assemblyCount: result.assemblies.length,
      truncated: result.truncated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[extract] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
