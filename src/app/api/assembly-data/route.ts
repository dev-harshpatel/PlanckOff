import { NextRequest, NextResponse } from "next/server";
import {
  getLatestAssemblyExtraction,
  getLatestMaterialMatch,
} from "@/lib/db/assemblyData";

/**
 * GET /api/assembly-data?projectId=xxx
 * Returns the latest assembly extraction and material match data from database
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;

  try {
    const [assemblyResult, materialResult] = await Promise.all([
      getLatestAssemblyExtraction(projectId),
      getLatestMaterialMatch(projectId),
    ]);

    if (!assemblyResult.data || !materialResult.data) {
      return NextResponse.json({
        success: true,
        message: "No assembly data found",
        hasData: false,
      });
    }

    // Normalize JSONB: Supabase may return it as object or string
    const rawAssembly = assemblyResult.data.data;
    const rawMaterial = materialResult.data.data;
    const assemblyData =
      typeof rawAssembly === "string" ? JSON.parse(rawAssembly) : rawAssembly;
    const materialData =
      typeof rawMaterial === "string" ? JSON.parse(rawMaterial) : rawMaterial;

    return NextResponse.json({
      success: true,
      hasData: true,
      assemblyData,
      materialData,
      assemblyFilename: assemblyResult.data.filename,
      materialFilename: materialResult.data.filename,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
