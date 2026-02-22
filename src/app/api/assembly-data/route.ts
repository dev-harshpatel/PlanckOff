import { NextRequest, NextResponse } from "next/server";
import {
  deleteProjectAssemblyData,
  getAssemblyExtractionById,
  getLatestAssemblyExtraction,
  getLatestMaterialMatch,
} from "@/lib/db/assemblyData";
import {
  getLatestFinalOutput,
  getLatestTakeoffOutput,
  getTakeoffOutputById,
} from "@/lib/db/pipelineOutputs";
import { getProjectById } from "@/lib/db/project";

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

    // Prefer final_output when present (has height_ft, total_length per assembly for UI).
    // Fall back to material_matches when no final output (e.g. before finalize step).
    let materialData: { assemblies?: unknown[] };
    let materialFilename: string;

    if (finalResult.data) {
      const rawFinal = finalResult.data.data;
      materialData =
        typeof rawFinal === "string" ? JSON.parse(rawFinal) : rawFinal;
      materialFilename = finalResult.data.filename;

      // Enrich assemblies with level from raw takeoff records if missing
      const assemblies = (materialData.assemblies || []) as Record<string, unknown>[];
      const needsLevel = assemblies.some(
        (a) => !a.level && typeof a.height_ft === "number",
      );
      if (needsLevel) {
        // Prefer the linked takeoff output, fall back to latest for project
        const takeoffResult = finalResult.data.takeoff_output_id
          ? await getTakeoffOutputById(finalResult.data.takeoff_output_id)
          : await getLatestTakeoffOutput(projectId);

        if (takeoffResult.data) {
          const rawTakeoff = takeoffResult.data.data;
          const takeoffRows = Array.isArray(rawTakeoff) ? rawTakeoff : [];

          // Build map: "wall_type|height" → Set of unique level strings
          const levelMap = new Map<string, Set<string>>();
          for (const row of takeoffRows as Record<string, unknown>[]) {
            if (!row.wall_type || row.level == null) continue;
            const levelStr = String(row.level).trim();
            if (!levelStr) continue;
            const height = parseFloat(String(row.height ?? 0));
            const key = `${String(row.wall_type).trim()}|${height}`;
            if (!levelMap.has(key)) levelMap.set(key, new Set());
            levelMap.get(key)!.add(levelStr);
          }

          materialData.assemblies = assemblies.map((a) => {
            if (a.level) return a;
            const key = `${a.assembly_id}|${a.height_ft}`;
            const levels = levelMap.get(key);
            return levels && levels.size > 0
              ? { ...a, level: Array.from(levels).join(", ") }
              : a;
          });
        }
      }
      // Enrich assemblies with project_location / project_province from the project record
      if (projectId) {
        const { data: project } = await getProjectById(projectId);
        if (project && (project.location || project.province)) {
          const enrichedAssemblies = (materialData.assemblies || []) as Record<string, unknown>[];
          materialData.assemblies = enrichedAssemblies.map((a) => ({
            ...a,
            project_location: project.location ?? a.project_location ?? null,
            project_province: project.province ?? a.project_province ?? null,
          }));
        }
      }
    } else if (materialResult.data) {
      const rawMaterial = materialResult.data.data;
      materialData =
        typeof rawMaterial === "string" ? JSON.parse(rawMaterial) : rawMaterial;
      materialFilename = materialResult.data.filename;
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
