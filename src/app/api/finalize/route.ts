/**
 * API Route: Finalize assemblies
 * POST /api/finalize
 *
 * Combines material match output with takeoff data using unified prompt
 * to produce QuickBid-style final JSON. Saves to database and local.
 */

import { NextRequest, NextResponse } from "next/server";
import { saveFinalOutput } from "@/lib/db/pipelineOutputs";
// import { writeJsonToLocal } from "@/lib/utils/localJsonStorage";
import { finalizeAssembliesWithTakeoff } from "@/services/openrouter/finalizeAssemblies";

// Hobby plan max: 300s. Pro allows up to 900s.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  console.log("[finalize] POST request received");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[finalize] OPENROUTER_API_KEY is not configured");
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    let body: {
      materialMatch?: { assemblies?: unknown[] };
      projectId?: string;
      assemblyExtractionId?: string;
      takeoffOutputId?: string;
    };
    try {
      body = await req.json();
    } catch (parseErr) {
      const msg =
        parseErr instanceof Error ? parseErr.message : "Invalid JSON body";
      console.error("[finalize] Failed to parse request body:", msg);
      return NextResponse.json(
        { error: `Invalid request body: ${msg}` },
        { status: 400 },
      );
    }

    const { materialMatch, projectId, assemblyExtractionId, takeoffOutputId } = body;
    if (!materialMatch?.assemblies) {
      console.error("[finalize] No materialMatch.assemblies in body");
      return NextResponse.json(
        { error: "Material match data is required" },
        { status: 400 },
      );
    }

    const totalStart = Date.now();
    const input = { assemblies: materialMatch.assemblies };

    console.log(
      `[finalize] Starting finalize for ${input.assemblies.length} assemblies`,
    );

    const result = await finalizeAssembliesWithTakeoff(input, apiKey);

    const timestamp = Date.now();
    const filename = `final_output-${timestamp}.json`;
    const { data: dbSaved } = await saveFinalOutput(
      result,
      filename,
      projectId,
      assemblyExtractionId,
      takeoffOutputId,
    );
    // const localPath = await writeJsonToLocal("final_output", result);
    console.log(`[finalize] DB: ${dbSaved?.id ?? "ok"}`);

    const totalMs = Date.now() - totalStart;
    console.log(
      `[finalize] Success — total: ${(totalMs / 1000).toFixed(2)}s`,
    );

    return NextResponse.json({
      success: true,
      result,
      finalOutputId: dbSaved?.id,
      // localPath,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[finalize] Error:", message);
    if (stack) console.error("[finalize] Stack:", stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
