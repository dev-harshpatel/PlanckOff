import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readdir } from "fs/promises";
import path from "path";
import { extractAssembliesFromPDF } from "@/services/openrouter/extractAssemblies";

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
    const { pdfBase64 } = await req.json();
    if (!pdfBase64) {
      return NextResponse.json({ error: "No pdfBase64 provided" }, { status: 400 });
    }

    console.log(`[extract] PDF base64 length: ${pdfBase64.length} chars`);
    const startTime = Date.now();

    const result = await extractAssembliesFromPDF(pdfBase64, apiKey);

    // Save to public/assembly-data/assembly-data-N.json
    const outputDir = path.join(process.cwd(), "public", "assembly-data");
    await mkdir(outputDir, { recursive: true });
    const filename = await getNextFilename(outputDir, "assembly-data", ".json");
    const filePath = path.join(outputDir, filename);
    await writeFile(filePath, JSON.stringify({ assemblies: result.assemblies }, null, 2));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[extract] Saved ${filePath} — ${result.assemblies.length} assemblies in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
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
