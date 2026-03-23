import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import {
  getTakeoffOutputById,
  updateTakeoffOutput,
} from "@/lib/db/pipelineOutputs";

export const PATCH = withAuth(
  async (request: NextRequest, _context, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Takeoff output ID is required" },
        { status: 400 },
      );
    }

    let body: { rows?: unknown[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (!body.rows || !Array.isArray(body.rows)) {
      return NextResponse.json(
        { success: false, error: "rows array is required" },
        { status: 400 },
      );
    }

    const { data: existing, error: fetchError } = await getTakeoffOutputById(id);
    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Takeoff output not found" },
        { status: 404 },
      );
    }

    const { data: updated, error: updateError } = await updateTakeoffOutput(id, body.rows);
    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      takeoffOutputId: updated?.id ?? id,
      rowCount: body.rows.length,
      filename: existing.filename ?? null,
    });
  },
);
