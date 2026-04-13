import { NextRequest, NextResponse } from "next/server";
import { saveAssemblyExtraction } from "@/lib/db/assemblyData";
import { AI_PROMPT_KEYS, getResolvedAIPrompt } from "@/lib/db/aiPrompts";
import {
  updatePipelineRunStep,
  failPipelineRun,
} from "@/lib/db/pipelineRuns";
import { extractAssembliesFromPDF } from "@/services/openrouter/extractAssemblies";
import { withAuth } from "@/lib/auth/api-helpers";
import { writeJsonToLocal } from "@/lib/utils/localJsonStorage";

// Vercel: with Fluid Compute, Hobby max 300s, Pro max 800s.
export const maxDuration = 300;

export const POST = withAuth(async (req: NextRequest) => {
  console.log("\n" + "-".repeat(70));
  console.log("[extract] POST request received — Sequential Pipeline Step 1/3");
  console.log("-".repeat(70));

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[extract] OPENROUTER_API_KEY is not configured");
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    let body: { pdfBase64?: string; projectId?: string; runId?: string };
    try {
      body = await req.json();
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Invalid JSON body";
      console.error("[extract] Failed to parse request body:", msg);
      return NextResponse.json(
        { error: `Invalid request body: ${msg}` },
        { status: 400 },
      );
    }

    const { pdfBase64, projectId, runId } = body;
    if (!pdfBase64) {
      console.error("[extract] No pdfBase64 provided");
      return NextResponse.json(
        { error: "No pdfBase64 provided" },
        { status: 400 },
      );
    }

    // Mark step 1 as in-progress in the run record
    if (runId) {
      await updatePipelineRunStep(runId, 1);
    }

    const totalStart = Date.now();

    console.log(`[extract] Starting PDF extraction, projectId: ${projectId ?? "none"}, runId: ${runId ?? "none"}`);
    const extractStart = Date.now();
    const promptText = await getResolvedAIPrompt(AI_PROMPT_KEYS.PDF_EXTRACTION);
    const result = await extractAssembliesFromPDF(pdfBase64, apiKey, promptText);
    const extractMs = Date.now() - extractStart;
    console.log(`[extract] Extracted ${result.assemblies.length} assemblies from PDF — ${(extractMs / 1000).toFixed(2)}s`);

    const timestamp = Date.now();
    const filename = `assembly-data-${timestamp}.json`;

    const { data: savedData, error: saveError } = await saveAssemblyExtraction(
      { assemblies: result.assemblies },
      filename,
      projectId,
    );
    if (saveError) {
      const msg = `Failed to save to database: ${JSON.stringify(saveError)}`;
      console.error("[extract] DB save error:", saveError);
      if (runId) await failPipelineRun(runId, 1, msg);
      throw new Error(msg);
    }

    // Record extractionId in run so step 2 can be retried without re-extracting
    if (runId && savedData?.id) {
      await updatePipelineRunStep(runId, 1, { extractionId: savedData.id });
    }

    if (process.env.NODE_ENV === "development") {
      void writeJsonToLocal("assembly", { assemblies: result.assemblies }, filename).then((p) => {
        if (p) console.log(`[extract] Local file written: ${p}`);
      });
    }
    console.log(`[extract] DB: ${savedData?.id} | Local: ${process.env.NODE_ENV === "development" ? "enabled" : "disabled"}`);

    const totalMs = Date.now() - totalStart;
    console.log("-".repeat(70));
    console.log(`[extract] ✅ Success. extraction: ${(extractMs / 1000).toFixed(2)}s, total: ${(totalMs / 1000).toFixed(2)}s`);
    console.log(`[extract] Extracted ${result.assemblies.length} assemblies`);
    console.log("-".repeat(70) + "\n");

    return NextResponse.json({
      success: true,
      result: { assemblies: result.assemblies },
      extractionId: savedData?.id,
      filename,
      assemblyCount: result.assemblies.length,
      truncated: result.truncated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[extract] Error:", message);
    if (stack) console.error("[extract] Stack:", stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
