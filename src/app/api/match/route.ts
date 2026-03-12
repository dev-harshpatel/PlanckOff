import { NextRequest, NextResponse } from "next/server";
import { getMaterialDatabase } from "@/lib/cache/materialDbCache";
import { saveMaterialMatch } from "@/lib/db/assemblyData";
import { matchMaterialsToDatabase } from "@/services/openrouter/matchMaterials";
import { writeJsonToLocal } from "@/lib/utils/localJsonStorage";

// Vercel: with Fluid Compute, Hobby max 300s, Pro max 800s. Without Fluid Compute, Pro max 300s.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  console.log("\n" + "-".repeat(70));
  console.log("[match] POST request received — Sequential Pipeline Step 2/3");
  console.log("-".repeat(70));

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[match] OPENROUTER_API_KEY is not configured");
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const totalStart = Date.now();
  const logElapsed = (label: string) =>
    console.log(`[match] ${label} (elapsed ${((Date.now() - totalStart) / 1000).toFixed(2)}s)`);

  try {
    console.log(`[match] START at ${new Date().toISOString()} (Vercel maxDuration: ${maxDuration}s)`);

    let body: { extraction?: { assemblies?: unknown[] }; extractionId?: string; projectId?: string };
    try {
      body = await req.json();
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Invalid JSON body";
      console.error("[match] Failed to parse request body:", msg);
      return NextResponse.json(
        { error: `Invalid request body: ${msg}` },
        { status: 400 },
      );
    }
    logElapsed("Request body parsed");

    const { extraction, extractionId, projectId } = body;
    if (!extraction?.assemblies) {
      console.error("[match] No extraction.assemblies in body");
      return NextResponse.json(
        { error: "No extraction data provided" },
        { status: 400 },
      );
    }

    let dbLoadMs = 0;

    let database: Record<string, unknown>[];
    try {
      const dbLoadStart = Date.now();
      database = await getMaterialDatabase();
      dbLoadMs = Date.now() - dbLoadStart;
      console.log(`[match] Loaded material database: ${database.length} entries — ${(dbLoadMs / 1000).toFixed(2)}s`);
      logElapsed("Material DB load complete");
    } catch (readErr) {
      const msg = readErr instanceof Error ? readErr.message : "Unknown error";
      console.error("[match] Failed to load material database:", msg);
      return NextResponse.json(
        { error: `Material database not available: ${msg}` },
        { status: 500 },
      );
    }

    console.log(`[match] Starting material matching for ${extraction.assemblies.length} assemblies, extractionId: ${extractionId ?? "none"}`);
    logElapsed("About to call matchMaterialsToDatabase (OpenRouter batches)");
    const matchStart = Date.now();
    const result = await matchMaterialsToDatabase(
      { assemblies: extraction.assemblies },
      database,
      apiKey,
      totalStart,
    );
    const matchMs = Date.now() - matchStart;
    console.log(`[match] Matched ${result.assemblies.length} assemblies — ${(matchMs / 1000).toFixed(2)}s`);
    logElapsed("matchMaterialsToDatabase returned");

    const timestamp = Date.now();
    const filename = `material-match-${timestamp}.json`;
    const extractionIdStr = extractionId ?? "";

    logElapsed("About to save material match to DB");
    const { data: savedData, error: saveError } = await saveMaterialMatch(
      { assemblies: result.assemblies },
      filename,
      extractionIdStr,
      projectId,
    );
    if (saveError) {
      console.error("[match] DB save error:", saveError);
      throw new Error(`Failed to save to database: ${JSON.stringify(saveError)}`);
    }

    const localPath = await writeJsonToLocal("material_match", {
      assemblies: result.assemblies,
    });
    console.log(
      `[match] DB: ${savedData?.id} | Local: ${localPath || "(failed)"}`,
    );

    const totalMs = Date.now() - totalStart;
    console.log("-".repeat(70));
    console.log(`[match] ✅ Success. Phase times — material DB load: ${(dbLoadMs / 1000).toFixed(2)}s, matching: ${(matchMs / 1000).toFixed(2)}s, total: ${(totalMs / 1000).toFixed(2)}s`);
    console.log(`[match] Matched ${result.assemblies.length} assemblies`);
    console.log("-".repeat(70) + "\n");
    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
      matchId: savedData?.id,
      filename,
      matchedCount: result.assemblies.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(`[match] Error at elapsed ${((Date.now() - totalStart) / 1000).toFixed(2)}s:`, message);
    if (stack) console.error("[match] Stack:", stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
