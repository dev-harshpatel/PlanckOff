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
    const { extraction, extractionId, projectId } = await req.json();
    if (!extraction?.assemblies) {
      return NextResponse.json(
        { error: "No extraction data provided" },
        { status: 400 },
      );
    }

    console.log(
      `[match] Received ${extraction.assemblies.length} assemblies to match`,
    );
    const startTime = Date.now();

    // Load material database
    const dbPath = path.join(process.cwd(), "data", "material-database.json");
    const dbRaw = await readFile(dbPath, "utf-8");
    const database = JSON.parse(dbRaw) as Record<string, unknown>[];
    console.log(`[match] Loaded material database: ${database.length} entries`);

    const result = await matchMaterialsToDatabase(
      extraction,
      database,
      apiKey,
    );

    // Generate filename
    const timestamp = Date.now();
    const filename = `material-match-${timestamp}.json`;

    // Save to database
    const { data: savedData, error: saveError } = await saveMaterialMatch(
      { assemblies: result.assemblies },
      filename,
      extractionId,
      projectId,
    );

    if (saveError) {
      throw new Error(`Failed to save to database: ${saveError}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[match] Saved to DB (${filename}) — ${result.assemblies.length} matched in ${elapsed}s`,
    );

    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
      matchId: savedData.id,
      filename,
      matchedCount: result.assemblies.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[match] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
