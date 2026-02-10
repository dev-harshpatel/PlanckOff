import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import path from "path";
import { matchMaterialsToDatabase } from "@/services/openrouter/matchMaterials";

export const maxDuration = 180;

async function getNextFilename(dir: string, prefix: string, ext: string): Promise<string> {
  try {
    const files = await readdir(dir);
    const pattern = new RegExp(`^${prefix}-(\\d+)${ext.replace(".", "\\.")}$`);
    let maxN = 0;
    for (const f of files) {
      const m = f.match(pattern);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    return `${prefix}-${maxN + 1}${ext}`;
  } catch {
    return `${prefix}-1${ext}`;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured" }, { status: 500 });
  }

  try {
    const { extraction } = await req.json();
    if (!extraction?.assemblies) {
      return NextResponse.json({ error: "No extraction data provided" }, { status: 400 });
    }

    console.log(`[match] Received ${extraction.assemblies.length} assemblies to match`);
    const startTime = Date.now();

    // Load material database
    const dbPath = path.join(process.cwd(), "data", "material-database.json");
    const dbRaw = await readFile(dbPath, "utf-8");
    const database = JSON.parse(dbRaw) as Record<string, unknown>[];
    console.log(`[match] Loaded material database: ${database.length} entries`);

    const result = await matchMaterialsToDatabase(extraction, database, apiKey);

    // Save to public/material-data/material-match-N.json
    const outputDir = path.join(process.cwd(), "public", "material-data");
    await mkdir(outputDir, { recursive: true });
    const filename = await getNextFilename(outputDir, "material-match", ".json");
    const filePath = path.join(outputDir, filename);
    await writeFile(filePath, JSON.stringify({ assemblies: result.assemblies }, null, 2));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[match] Saved ${filePath} — ${result.assemblies.length} matched in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
      filename,
      matchedCount: result.assemblies.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[match] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
