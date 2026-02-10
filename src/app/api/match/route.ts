import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { matchMaterialsToDatabase } from "@/services/openrouter/matchMaterials";
import { saveMaterialMatch } from "@/lib/db/assemblyData";

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
    let body: { extraction?: { assemblies?: unknown[] }; extractionId?: string; projectId?: string };
    try {
      body = await req.json();
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Invalid JSON body";
      return NextResponse.json(
        { error: `Invalid request body: ${msg}` },
        { status: 400 },
      );
    }

    const { extraction, extractionId, projectId } = body;
    if (!extraction?.assemblies) {
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
    } catch (readErr) {
      const msg = readErr instanceof Error ? readErr.message : "Unknown error";
      return NextResponse.json(
        { error: `Material database not available: ${msg}` },
        { status: 500 },
      );
    }

    const result = await matchMaterialsToDatabase(
      { assemblies: extraction.assemblies },
      database,
      apiKey,
    );

    const timestamp = Date.now();
    const filename = `material-match-${timestamp}.json`;

    const extractionIdStr = extractionId ?? "";
    const { data: savedData, error: saveError } = await saveMaterialMatch(
      { assemblies: result.assemblies },
      filename,
      extractionIdStr,
      projectId,
    );

    if (saveError) {
      throw new Error(`Failed to save to database: ${JSON.stringify(saveError)}`);
    }

    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
      matchId: savedData.id,
      filename,
      matchedCount: result.assemblies.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
