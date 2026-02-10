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
    let body: { pdfBase64?: string; projectId?: string };
    try {
      body = await req.json();
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Invalid JSON body";
      return NextResponse.json(
        { error: `Invalid request body: ${msg}` },
        { status: 400 },
      );
    }

    const { pdfBase64, projectId } = body;
    if (!pdfBase64) {
      return NextResponse.json(
        { error: "No pdfBase64 provided" },
        { status: 400 },
      );
    }

    const result = await extractAssembliesFromPDF(pdfBase64, apiKey);
    const timestamp = Date.now();
    const filename = `assembly-data-${timestamp}.json`;

    const { data: savedData, error: saveError } = await saveAssemblyExtraction(
      { assemblies: result.assemblies },
      filename,
      projectId,
    );

    if (saveError) {
      throw new Error(`Failed to save to database: ${JSON.stringify(saveError)}`);
    }

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
