import { NextRequest, NextResponse } from "next/server";
import {
  deleteProjectAssemblyData,
  getAssemblyExtractionById,
  getLatestAssemblyExtraction,
  getLatestMaterialMatch,
} from "@/lib/db/assemblyData";

/**
 * GET /api/assembly-data?projectId=xxx
 * Returns the latest assembly extraction and material match data from database.
 * When material match exists but extraction was saved without project_id,
 * fetches extraction via extraction_id from the material match.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;

  try {
    const [assemblyResult, materialResult] = await Promise.all([
      getLatestAssemblyExtraction(projectId),
      getLatestMaterialMatch(projectId),
    ]);

    // If we have material match but no extraction for project, fetch extraction by extraction_id
    let assemblyRecord = assemblyResult.data;
    if (!assemblyRecord && materialResult.data?.extraction_id) {
      const byId = await getAssemblyExtractionById(materialResult.data.extraction_id);
      assemblyRecord = byId.data;
    }

    if (!assemblyRecord || !materialResult.data) {
      return NextResponse.json({
        success: true,
        message: "No assembly data found",
        hasData: false,
        hasExtraction: !!assemblyRecord,
      });
    }

    // Normalize JSONB: Supabase may return it as object or string
    const rawAssembly = assemblyRecord.data;
    const rawMaterial = materialResult.data.data;
    const assemblyData =
      typeof rawAssembly === "string" ? JSON.parse(rawAssembly) : rawAssembly;
    const materialData =
      typeof rawMaterial === "string" ? JSON.parse(rawMaterial) : rawMaterial;

    return NextResponse.json({
      success: true,
      hasData: true,
      hasExtraction: true,
      assemblyData,
      materialData,
      assemblyFilename: assemblyRecord.filename,
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

/**
 * DELETE /api/assembly-data?projectId=xxx
 * Deletes all assembly extraction and material match data for the project
 */
export async function DELETE(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { success: false, error: "projectId is required" },
      { status: 400 },
    );
  }

  try {
    await deleteProjectAssemblyData(projectId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
