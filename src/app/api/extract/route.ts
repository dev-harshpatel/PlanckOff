import { NextRequest, NextResponse } from "next/server";
import { saveAssemblyExtraction } from "@/lib/db/assemblyData";
import { AI_PROMPT_KEYS, getResolvedAIPrompt } from "@/lib/db/aiPrompts";
import {
  updatePipelineRunStep,
  failPipelineRun,
} from "@/lib/db/pipelineRuns";
import { extractAssembliesFromPDF } from "@/services/openrouter/extractAssemblies";
import { extractAssemblySkeleton } from "@/services/extraction/extractAssemblySkeleton";
import { extractCategoryChunk, type CategoryChunkResult } from "@/services/extraction/extractCategoryChunk";
import { mergeExtractionChunks } from "@/services/extraction/mergeExtractionChunks";
import { withAuth } from "@/lib/auth/api-helpers";
import { writeJsonToLocal, writeRunDebugFile } from "@/lib/utils/localJsonStorage";
import { appendRunLog, markRunComplete } from "@/lib/utils/pipelineLogger";

// Vercel: with Fluid Compute, Hobby max 300s, Pro max 800s.
export const maxDuration = 300;

// Category chunk definitions — ordered for sequential execution
const CHUNK_STEPS = [
  { id: "gypsum",           promptKey: AI_PROMPT_KEYS.EXTRACT_GYPSUM,           label: "gypsum board + sheathing",  debugFile: "02_extraction_gypsum.json" },
  { id: "steel_framing",    promptKey: AI_PROMPT_KEYS.EXTRACT_STEEL_FRAMING,    label: "steel framing",             debugFile: "03_extraction_framing.json" },
  { id: "insulation",       promptKey: AI_PROMPT_KEYS.EXTRACT_INSULATION,       label: "insulation",                debugFile: "04_extraction_insulation.json" },
  { id: "moisture_control", promptKey: AI_PROMPT_KEYS.EXTRACT_MOISTURE_CONTROL, label: "vapor barriers + sealants", debugFile: "05_extraction_moisture.json" },
  { id: "wood_substrates",  promptKey: AI_PROMPT_KEYS.EXTRACT_WOOD_SUBSTRATES,  label: "plywood + blocking",        debugFile: "06_extraction_wood.json" },
  { id: "specialty",        promptKey: AI_PROMPT_KEYS.EXTRACT_SPECIALTY,        label: "steel deck + trim",         debugFile: "07_extraction_specialty.json" },
] as const;

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

  // mode=chunked → new 7-sub-step behaviour (default)
  // mode=legacy  → original single-call behaviour (emergency fallback via ?mode=legacy)
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "chunked";

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
    console.log(`[extract] mode=${mode}, projectId: ${projectId ?? "none"}, runId: ${runId ?? "none"}`);

    // ─────────────────────────────────────────────────────────────────────
    // LEGACY MODE — single Pro LLM call (unchanged original behaviour)
    // ─────────────────────────────────────────────────────────────────────
    if (mode === "legacy") {
      const extractStart = Date.now();
      appendRunLog(runId ?? "no-run", "[extract] Calling AI model (single-pass extraction)...");
      const promptText = await getResolvedAIPrompt(AI_PROMPT_KEYS.PDF_EXTRACTION);
      const result = await extractAssembliesFromPDF(pdfBase64, apiKey, promptText);
      const extractMs = Date.now() - extractStart;
      appendRunLog(runId ?? "no-run", `[extract] Done — ${result.assemblies.length} assemblies extracted (${(extractMs / 1000).toFixed(2)}s)`);

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

      if (runId && savedData?.id) {
        await updatePipelineRunStep(runId, 1, { extractionId: savedData.id });
      }

      if (process.env.NODE_ENV === "development") {
        void writeJsonToLocal("assembly", { assemblies: result.assemblies }, filename).then((p) => {
          if (p) console.log(`[extract] Local file written: ${p}`);
        });
      }

      markRunComplete(runId ?? "no-run");
      const totalMs = Date.now() - totalStart;
      console.log("-".repeat(70));
      console.log(`[extract] ✅ Success (legacy). extraction: ${(extractMs / 1000).toFixed(2)}s, total: ${(totalMs / 1000).toFixed(2)}s`);
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
    }

    // ─────────────────────────────────────────────────────────────────────
    // CHUNKED MODE — 7 focused Flash calls (1 skeleton + 6 category chunks)
    // ─────────────────────────────────────────────────────────────────────

    // Sub-step 1.0 — Skeleton: assembly IDs, types, ratings only
    console.log("[extract:chunked] Sub-step 1.0 — skeleton");
    appendRunLog(runId ?? "no-run", "[extract] Step 1/7 — Identifying assembly list from PDF...");
    const skeletonPrompt = await getResolvedAIPrompt(AI_PROMPT_KEYS.EXTRACT_SKELETON);
    const skeleton = await extractAssemblySkeleton(pdfBase64, apiKey, skeletonPrompt);
    await writeRunDebugFile(runId ?? "no-run", "01_skeleton.json", skeleton);
    appendRunLog(runId ?? "no-run", `[extract] ✓ Found ${skeleton.length} assemblies`);

    if (skeleton.length === 0) {
      const msg = "Skeleton extraction returned no assemblies — PDF may be unsupported or empty";
      if (runId) await failPipelineRun(runId, 1, msg);
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    // Sub-steps 1.1–1.6 — One call per category group (sequential to avoid rate limits)
    const chunkResults: Record<string, CategoryChunkResult[]> = {};

    for (let i = 0; i < CHUNK_STEPS.length; i++) {
      const chunk = CHUNK_STEPS[i];
      console.log(`[extract:chunked] Sub-step 1.${i + 1} — ${chunk.label} (${i + 1}/${CHUNK_STEPS.length})`);
      appendRunLog(runId ?? "no-run", `[extract] Step ${i + 2}/7 — Extracting ${chunk.label}...`);
      try {
        const chunkPrompt = await getResolvedAIPrompt(chunk.promptKey);
        const chunkResult = await extractCategoryChunk(pdfBase64, apiKey, chunkPrompt, skeleton, chunk.id);
        chunkResults[chunk.id] = chunkResult;
        await writeRunDebugFile(runId ?? "no-run", chunk.debugFile, chunkResult);
        const itemCount = chunkResult.reduce((s, a) => {
          const cats = Object.values(a).filter(Array.isArray);
          return s + cats.reduce((cs, arr) => cs + (arr as unknown[]).length, 0);
        }, 0);
        appendRunLog(runId ?? "no-run", `[extract] ✓ ${chunk.label} — ${itemCount} items`);
      } catch (chunkErr) {
        // Non-fatal: log warning, leave category empty, continue to next chunk
        appendRunLog(runId ?? "no-run", `[extract] ⚠ ${chunk.label} failed — skipping`, "warn");
        console.warn(`[extract:chunked] Sub-step ${chunk.id} failed — skipping:`, chunkErr);
        chunkResults[chunk.id] = [];
        await writeRunDebugFile(runId ?? "no-run", chunk.debugFile, { error: String(chunkErr), assemblies: [] });
      }
    }

    // Merge skeleton + all chunks into final extraction shape
    appendRunLog(runId ?? "no-run", "[extract] Merging all category chunks...");
    const assemblies = mergeExtractionChunks(skeleton, chunkResults);
    await writeRunDebugFile(runId ?? "no-run", "08_extraction_merged.json", { assemblies });

    appendRunLog(runId ?? "no-run", `[extract] ✓ Extraction complete — ${assemblies.length} assemblies`);
    console.log(`[extract:chunked] Merged ${assemblies.length} assemblies from ${CHUNK_STEPS.length} chunks`);

    const timestamp = Date.now();
    const filename = `assembly-data-${timestamp}.json`;

    const { data: savedData, error: saveError } = await saveAssemblyExtraction(
      { assemblies },
      filename,
      projectId,
    );
    if (saveError) {
      const msg = `Failed to save to database: ${JSON.stringify(saveError)}`;
      console.error("[extract] DB save error:", saveError);
      if (runId) await failPipelineRun(runId, 1, msg);
      throw new Error(msg);
    }

    if (runId && savedData?.id) {
      await updatePipelineRunStep(runId, 1, { extractionId: savedData.id });
    }

    if (process.env.NODE_ENV === "development") {
      void writeJsonToLocal("assembly", { assemblies }, filename).then((p) => {
        if (p) console.log(`[extract] Local file written: ${p}`);
      });
    }

    markRunComplete(runId ?? "no-run");
    const totalMs = Date.now() - totalStart;
    console.log("-".repeat(70));
    console.log(`[extract] ✅ Success (chunked). total: ${(totalMs / 1000).toFixed(2)}s`);
    console.log(`[extract] Extracted ${assemblies.length} assemblies across ${CHUNK_STEPS.length} category chunks`);
    console.log("-".repeat(70) + "\n");

    return NextResponse.json({
      success: true,
      result: { assemblies },
      extractionId: savedData?.id,
      filename,
      assemblyCount: assemblies.length,
      truncated: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[extract] Error:", message);
    if (stack) console.error("[extract] Stack:", stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
