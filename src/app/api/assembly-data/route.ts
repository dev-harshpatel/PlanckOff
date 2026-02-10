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
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;

    const [assemblyResult, materialResult] = await Promise.all([
      getLatestAssemblyExtraction(projectId),
      getLatestMaterialMatch(projectId),
    ]);

    if (!assemblyResult.data || !materialResult.data) {
      return NextResponse.json({
        success: false,
        message: "No assembly data found",
        hasData: false,
      });
    }

    return NextResponse.json({
      success: true,
      hasData: true,
      assemblyData: assemblyResult.data.data,
      materialData: materialResult.data.data,
      assemblyFilename: assemblyResult.data.filename,
      materialFilename: materialResult.data.filename,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[assembly-data] Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
