import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { matchMaterialsToDatabase } from "@/services/openrouter/matchMaterials";
import { saveMaterialMatch } from "@/lib/db/assemblyData";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  console.log("[match] POST request received");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[match] OPENROUTER_API_KEY is not configured");
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
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

    const { extraction, extractionId, projectId } = body;
    if (!extraction?.assemblies) {
      console.error("[match] No extraction.assemblies in body");
      return NextResponse.json(
        { error: "No extraction data provided" },
        { status: 400 },
      );
    }

    const dbPath = path.join(process.cwd(), "data", "material-database.json");
    let database: Record<string, unknown>[];
    try {
      const dbRaw = await readFile(dbPath, "utf-8");
      database = JSON.parse(dbRaw) as Record<string, unknown>[];
      console.log(`[match] Loaded material database: ${database.length} entries from ${dbPath}`);
    } catch (readErr) {
      const msg = readErr instanceof Error ? readErr.message : "Unknown error";
      console.error("[match] Failed to read material database:", msg, "path:", dbPath);
      return NextResponse.json(
        { error: `Material database not available: ${msg}` },
        { status: 500 },
      );
    }

    console.log(`[match] Starting material matching for ${extraction.assemblies.length} assemblies, extractionId: ${extractionId ?? "none"}`);
    const result = await matchMaterialsToDatabase(
      { assemblies: extraction.assemblies },
      database,
      apiKey,
    );
    console.log(`[match] Matched ${result.assemblies.length} assemblies`);

    const timestamp = Date.now();
    const filename = `material-match-${timestamp}.json`;

    const extractionIdStr = extractionId ?? "";
    console.log(`[match] Saving to database (${filename})...`);
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

    console.log(`[match] Success: saved match id ${savedData.id}`);
    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
      matchId: savedData.id,
      filename,
      matchedCount: result.assemblies.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[match] Error:", message);
    if (stack) console.error("[match] Stack:", stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
