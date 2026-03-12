/**
 * PATCH /api/final-output/[id]
 * Update final output data (e.g. when user edits unit costs or quantities).
 * Requires auth. Also updates the local JSON file for dev environments.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import {
  getFinalOutputById,
  updateFinalOutput,
} from "@/lib/db/pipelineOutputs";
import { writeFile } from "fs/promises";
import path from "path";

export const PATCH = withAuth(
  async (request: NextRequest, _context, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Final output ID is required" },
        { status: 400 },
      );
    }

    let body: { assemblies?: unknown[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (!body.assemblies || !Array.isArray(body.assemblies)) {
      return NextResponse.json(
        { success: false, error: "assemblies array is required" },
        { status: 400 },
      );
    }

    const { data: existing, error: fetchError } = await getFinalOutputById(id);
    if (fetchError || !existing) {
      console.error("[FinalOutput PATCH] Record not found for id:", id, fetchError);
      return NextResponse.json(
        { success: false, error: "Final output not found" },
        { status: 404 },
      );
    }

    console.log("[FinalOutput PATCH] Updating id:", id, "filename:", existing.filename, "assemblies:", (body.assemblies as unknown[]).length);

    const { data: updated, error: updateError } = await updateFinalOutput(id, {
      assemblies: body.assemblies,
    });

    if (updateError) {
      console.error("[FinalOutput PATCH] DB update failed:", updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 },
      );
    }

    console.log("[FinalOutput PATCH] DB updated successfully for id:", id, "updated row id:", updated?.id);

    // Also update the local JSON file (non-fatal — dev only)
    let localFileStatus = "skipped: no filename on record";
    if (existing.filename) {
      try {
        const localPath = path.join(
          process.cwd(),
          "data",
          "output",
          "final_output",
          existing.filename,
        );
        await writeFile(
          localPath,
          JSON.stringify({ assemblies: body.assemblies }, null, 2),
          "utf-8",
        );
        localFileStatus = `updated: ${localPath}`;
        console.log("[FinalOutput PATCH] Local file updated:", localPath);
      } catch (fsErr) {
        localFileStatus = `failed: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`;
        console.warn("[FinalOutput PATCH] Local file update failed (non-fatal):", fsErr);
      }
    } else {
      console.warn("[FinalOutput PATCH] No filename on record — skipping local file update");
    }

    return NextResponse.json({
      success: true,
      debug: { dbId: id, filename: existing.filename ?? null, localFileStatus },
      result: { assemblies: body.assemblies },
    });
  },
);
