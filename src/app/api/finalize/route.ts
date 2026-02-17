/**
 * API Route: Finalize assemblies
 * POST /api/finalize
 *
 * When takeoff data is available: code-only merge (no AI).
 * When takeoff is missing/empty: AI finalize (OpenRouter) for backwards compatibility.
 * Saves to database and local.
 */

import { getLatestMaterialMatch } from "@/lib/db/assemblyData";
import {
  getLatestTakeoffOutput,
  getTakeoffOutputById,
  saveFinalOutput,
} from "@/lib/db/pipelineOutputs";
import {
  type MaterialMatchInput,
  mergeTakeoffWithMaterialMatch,
} from "@/services/finalize/mergeTakeoffWithMaterialMatch";
import type { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";
import { finalizeAssembliesWithTakeoff } from "@/services/openrouter/finalizeAssemblies";
import { NextRequest, NextResponse } from "next/server";

// Hobby plan max: 300s. Pro allows up to 900s.
export const maxDuration = 300;

const isTakeoffRow = (row: unknown): row is TakeoffRawRecord =>
  typeof row === "object" &&
  row !== null &&
  "wall_type" in row &&
  (row as TakeoffRawRecord).wall_type != null;

export async function POST(req: NextRequest) {
  console.log("\n" + "-".repeat(70));
  console.log("[finalize] POST request received — Sequential Pipeline (Strategy 1)");
  console.log("-".repeat(70));

  try {
    let body: {
      assemblyExtractionId?: string;
      materialMatch?: { assemblies?: unknown[] };
      projectId?: string;
      takeoff?: unknown[];
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

    const { materialMatch, projectId, assemblyExtractionId, takeoff, takeoffOutputId } = body;

    let materialMatchData = materialMatch;
    let takeoffData: unknown[] | undefined;
    let resolvedTakeoffOutputId: string | undefined = takeoffOutputId;

    // 1) Explicit takeoff array in body (client sends parsed takeoff)
    if (Array.isArray(takeoff) && takeoff.length > 0) {
      takeoffData = takeoff;
    }
    // 2) Fetch by takeoffOutputId (if not found, fall back to latest by project)
    else if (takeoffOutputId) {
      const { data: takeoffRecord, error: takeoffError } =
        await getTakeoffOutputById(takeoffOutputId);
      if (!takeoffError && takeoffRecord) {
        const takeoffRaw = takeoffRecord.data;
        takeoffData = Array.isArray(takeoffRaw)
          ? takeoffRaw
          : (takeoffRaw as { data?: unknown[] })?.data;
      }
      // ID not found (e.g. takeoff was deleted on overwrite): try latest for project
      if (!takeoffData && projectId) {
        const { data: latestTakeoff } = await getLatestTakeoffOutput(projectId);
        if (latestTakeoff?.data) {
          const raw = latestTakeoff.data;
          takeoffData = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data;
          resolvedTakeoffOutputId = latestTakeoff.id;
        }
      }
      if (!takeoffData) {
        return NextResponse.json(
          {
            error: `Failed to fetch takeoff data: ${takeoffError ? String(takeoffError) : "Not found"}. Upload Excel again and run the pipeline.`,
          },
          { status: 404 },
        );
      }
    }
    // 3) No takeoffOutputId: try latest takeoff for project (so code merge is used when possible)
    else if (projectId) {
      const { data: latestTakeoff } = await getLatestTakeoffOutput(projectId);
      if (latestTakeoff?.data) {
        const raw = latestTakeoff.data;
        takeoffData = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data;
        resolvedTakeoffOutputId = latestTakeoff.id;
      }
    }

    if (!materialMatchData?.assemblies && projectId) {
      const { data: matchRecord } = await getLatestMaterialMatch(projectId);
      if (matchRecord?.data) {
        const matchRaw = matchRecord.data;
        materialMatchData =
          typeof matchRaw === "string" ? JSON.parse(matchRaw) : matchRaw;
      }
    }

    if (!materialMatchData?.assemblies) {
      console.error("[finalize] No materialMatch.assemblies in body or DB");
      return NextResponse.json(
        {
          error:
            "Material match data is required (provide in body or ensure projectId has match data)",
        },
        { status: 400 },
      );
    }

    const totalStart = Date.now();
    const takeoffRows =
      Array.isArray(takeoffData) && takeoffData.length > 0
        ? takeoffData.filter(isTakeoffRow)
        : [];

    const useCodeMerge = takeoffRows.length > 0;

    let result: { assemblies: unknown[] };

    if (useCodeMerge) {
      console.log(
        `[finalize] Code merge: ${materialMatchData.assemblies.length} match assemblies, ${takeoffRows.length} takeoff rows`,
      );
      result = mergeTakeoffWithMaterialMatch(
        { assemblies: materialMatchData.assemblies } as MaterialMatchInput,
        takeoffRows,
      );
    } else {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        console.error("[finalize] OPENROUTER_API_KEY is not configured (required when no takeoff data)");
        return NextResponse.json(
          { error: "OPENROUTER_API_KEY is not configured" },
          { status: 500 },
        );
      }
      console.log(
        `[finalize] AI finalize (fallback): ${materialMatchData.assemblies.length} assemblies`,
      );
      const aiResult = await finalizeAssembliesWithTakeoff(
        { assemblies: materialMatchData.assemblies },
        apiKey,
        takeoffData,
      );
      result = { assemblies: aiResult.assemblies ?? [] };
    }

    const timestamp = Date.now();
    const filename = `final_output-${timestamp}.json`;
    const { data: dbSaved } = await saveFinalOutput(
      result,
      filename,
      projectId,
      assemblyExtractionId,
      resolvedTakeoffOutputId,
    );
    // const localPath = await writeJsonToLocal("final_output", result);
    console.log(`[finalize] DB: ${dbSaved?.id ?? "ok"}`);

    const totalMs = Date.now() - totalStart;
    console.log("-".repeat(70));
    console.log(
      `[finalize] ✅ Success — total: ${(totalMs / 1000).toFixed(2)}s`,
    );
    console.log(`[finalize] Produced ${result.assemblies?.length ?? 0} final assemblies`);
    console.log("-".repeat(70) + "\n");

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
