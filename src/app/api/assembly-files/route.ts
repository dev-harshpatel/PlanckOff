import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";
import { withAuth } from "@/lib/auth/api-helpers";

/**
 * GET /api/assembly-files
 * Returns the latest assembly-data and material-match JSON filenames
 */
export const GET = withAuth(async () => {
  try {
    const assemblyDir = path.join(process.cwd(), "public", "assembly-data");
    const materialDir = path.join(process.cwd(), "public", "material-data");

    // Get latest assembly-data file
    let latestAssemblyFile = null;
    try {
      const assemblyFiles = await readdir(assemblyDir);
      const assemblyPattern = /^assembly-data-(\d+)\.json$/;
      let maxAssemblyNum = 0;
      let maxAssemblyFile = null;

      for (const file of assemblyFiles) {
        const match = file.match(assemblyPattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxAssemblyNum) {
            maxAssemblyNum = num;
            maxAssemblyFile = file;
          }
        }
      }
      latestAssemblyFile = maxAssemblyFile;
    } catch {
      // Directory may not exist
    }

    // Get latest material-match file
    let latestMaterialFile = null;
    try {
      const materialFiles = await readdir(materialDir);
      const materialPattern = /^material-match-(\d+)\.json$/;
      let maxMaterialNum = 0;
      let maxMaterialFile = null;

      for (const file of materialFiles) {
        const match = file.match(materialPattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxMaterialNum) {
            maxMaterialNum = num;
            maxMaterialFile = file;
          }
        }
      }
      latestMaterialFile = maxMaterialFile;
    } catch {
      // Directory may not exist
    }

    return NextResponse.json({
      success: true,
      assemblyFile: latestAssemblyFile,
      materialFile: latestMaterialFile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
});
