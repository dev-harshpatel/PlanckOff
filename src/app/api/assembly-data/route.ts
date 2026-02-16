import { NextRequest, NextResponse } from "next/server";
import {
  deleteProjectAssemblyData,
  getAssemblyExtractionById,
  getLatestAssemblyExtraction,
  getLatestMaterialMatch,
} from "@/lib/db/assemblyData";
import { getLatestFinalOutput } from "@/lib/db/pipelineOutputs";

/**
 * GET /api/assembly-data?projectId=xxx
 * Returns the latest assembly extraction and material match data from database.
 * When material match exists but extraction was saved without project_id,
 * fetches extraction via extraction_id from the material match.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;

  try {
    const [assemblyResult, materialResult, finalResult] = await Promise.all([
      getLatestAssemblyExtraction(projectId),
      getLatestMaterialMatch(projectId),
      getLatestFinalOutput(projectId),
    ]);

    // If we have material match but no extraction for project, fetch extraction by extraction_id
    let assemblyRecord = assemblyResult.data;
    if (!assemblyRecord && materialResult.data?.extraction_id) {
      const byId = await getAssemblyExtractionById(materialResult.data.extraction_id);
      assemblyRecord = byId.data;
    }

    // Prefer material_matches; fall back to final_output when material_matches is empty (process-pipeline)
    let materialData: { assemblies?: unknown[] };
    let materialFilename: string;

    if (materialResult.data) {
      const rawMaterial = materialResult.data.data;
      materialData =
        typeof rawMaterial === "string" ? JSON.parse(rawMaterial) : rawMaterial;
      materialFilename = materialResult.data.filename;
    } else if (finalResult.data) {
      const rawFinal = finalResult.data.data;
      materialData =
        typeof rawFinal === "string" ? JSON.parse(rawFinal) : rawFinal;
      materialFilename = finalResult.data.filename;
    } else {
      materialData = { assemblies: [] };
      materialFilename = "";
    }

    // Need assembly extraction for structure; if we have final_output but no extraction, use final as assembly source
    let assemblyData: { assemblies?: unknown[] };
    if (assemblyRecord) {
      const rawAssembly = assemblyRecord.data;
      assemblyData =
        typeof rawAssembly === "string" ? JSON.parse(rawAssembly) : rawAssembly;
    } else if (materialData.assemblies && materialData.assemblies.length > 0) {
      assemblyData = { assemblies: materialData.assemblies };
    } else {
      return NextResponse.json({
        success: true,
        message: "No assembly data found",
        hasData: false,
        hasExtraction: false,
      });
    }

    const hasCostingData =
      materialData.assemblies && materialData.assemblies.length > 0;
    if (!hasCostingData) {
      return NextResponse.json({
        success: true,
        message: "No material costing data found",
        hasData: false,
        hasExtraction: !!assemblyRecord,
      });
    }

    return NextResponse.json({
      success: true,
      hasData: true,
      hasExtraction: true,
      assemblyData,
      materialData,
      assemblyFilename: assemblyRecord?.filename ?? "",
      materialFilename,
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
