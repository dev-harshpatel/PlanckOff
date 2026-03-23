/**
 * PATCH /api/final-output/[id]
 * Update final output data (e.g. when user edits unit costs or quantities).
 * Requires auth. (Optional local JSON backup is commented out — see writeJsonToLocal.)
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import {
  getFinalOutputById,
  updateFinalOutput,
} from "@/lib/db/pipelineOutputs";

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

    // Local data/output folder writes disabled (writeJsonToLocal).
    // if (process.env.NODE_ENV === "development" && existing.filename) {
    //   void writeJsonToLocal(
    //     "final_output",
    //     { assemblies: body.assemblies },
    //     existing.filename,
    //   );
    // }

    return NextResponse.json({
      success: true,
      debug: { dbId: id, filename: existing.filename ?? null },
      result: { assemblies: body.assemblies },
    });
  },
);
