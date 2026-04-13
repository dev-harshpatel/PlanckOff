import { NextRequest, NextResponse } from "next/server";
import { getMaterialDatabase } from "@/lib/cache/materialDbCache";
import { saveMaterialMatch } from "@/lib/db/assemblyData";
import { AI_PROMPT_KEYS, getResolvedAIPrompt } from "@/lib/db/aiPrompts";
import {
  updatePipelineRunStep,
  failPipelineRun,
} from "@/lib/db/pipelineRuns";
import { matchMaterialsToDatabase } from "@/services/openrouter/matchMaterials";
import { buildMaterialDbIndex } from "@/lib/utils/buildMaterialDbIndex";
import { matchAssemblies } from "@/lib/matching/matchOrchestrator";
import { withAuth } from "@/lib/auth/api-helpers";
import { writeJsonToLocal, writeRunDebugFile } from "@/lib/utils/localJsonStorage";
import { appendRunLog, markRunComplete } from "@/lib/utils/pipelineLogger";

// Vercel: with Fluid Compute, Hobby max 300s, Pro max 800s. Without Fluid Compute, Pro max 300s.
export const maxDuration = 300;

export const POST = withAuth(async (req: NextRequest) => {
  console.log("\n" + "-".repeat(70));
  console.log("[match] POST request received — Sequential Pipeline Step 2/3");
  console.log("-".repeat(70));

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[match] OPENROUTER_API_KEY is not configured");
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const totalStart = Date.now();
  const logElapsed = (label: string) =>
    console.log(`[match] ${label} (elapsed ${((Date.now() - totalStart) / 1000).toFixed(2)}s)`);

  try {
    console.log(`[match] START at ${new Date().toISOString()} (Vercel maxDuration: ${maxDuration}s)`);

    let body: {
      extraction?: { assemblies?: unknown[] };
      extractionId?: string;
      projectId?: string;
      runId?: string;
    };
    try {
      body = await req.json();
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Invalid JSON body";
      console.error("[match] Failed to parse request body:", msg);
      return NextResponse.json(
        { error: `Invalid request body: ${msg}` },
        { status: 400 },
      );
    }
    logElapsed("Request body parsed");

    const { extraction, extractionId, projectId, runId } = body;
    if (!extraction?.assemblies) {
      console.error("[match] No extraction.assemblies in body");
      return NextResponse.json(
        { error: "No extraction data provided" },
        { status: 400 },
      );
    }

    // Mark step 2 as in-progress in the run record
    if (runId) {
      await updatePipelineRunStep(runId, 2);
    }

    let dbLoadMs = 0;

    let database: Awaited<ReturnType<typeof getMaterialDatabase>>;
    try {
      const dbLoadStart = Date.now();
      appendRunLog(runId ?? "no-run", "[match] Loading material database...");
      database = await getMaterialDatabase();
      dbLoadMs = Date.now() - dbLoadStart;
      appendRunLog(runId ?? "no-run", `[match] ✓ ${database.length} materials loaded (${(dbLoadMs / 1000).toFixed(2)}s)`);
      logElapsed("Material DB load complete");
    } catch (readErr) {
      const msg = readErr instanceof Error ? readErr.message : "Unknown error";
      console.error("[match] Failed to load material database:", msg);
      if (runId) await failPipelineRun(runId, 2, `Material database not available: ${msg}`);
      return NextResponse.json(
        { error: `Material database not available: ${msg}` },
        { status: 500 },
      );
    }

    // mode=code   → deterministic TypeScript scoring engine (default)
    // mode=legacy → original LLM batched matching (emergency fallback via ?mode=legacy)
    const url  = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "code";

    console.log(`[match] mode=${mode}, ${extraction.assemblies.length} assemblies, extractionId: ${extractionId ?? "none"}`);
    const matchStart = Date.now();

    let matchedAssemblies: unknown[];

    if (mode === "code") {
      // ── CODE MODE — zero LLM calls ──────────────────────────────────────────
      logElapsed("Building DB index (code mode)");
      appendRunLog(runId ?? "no-run", "[match] Building material index...");
      const dbIndex = buildMaterialDbIndex(database);
      console.log(
        `[match:code] Index built — framing: ${dbIndex.byCategory.steel_framing.length}, ` +
        `gwb: ${dbIndex.byCategory.gypsum_board.length}, insulation: ${dbIndex.byCategory.insulation.length}`,
      );

      appendRunLog(runId ?? "no-run", `[match] Scoring ${extraction.assemblies.length} assemblies against database (no AI)...`);
      const { assemblies, scoredDebug } = matchAssemblies(
        extraction.assemblies,
        dbIndex,
        { debugMode: process.env.NODE_ENV === "development" },
      );
      matchedAssemblies = assemblies;

      await writeRunDebugFile(runId ?? "no-run", "10_match_scored.json",    scoredDebug ?? []);
      await writeRunDebugFile(runId ?? "no-run", "11_match_result.json",    matchedAssemblies);

      logElapsed("Code matching complete");
    } else {
      // ── LEGACY MODE — LLM batched matching (unchanged) ─────────────────────
      logElapsed("About to call matchMaterialsToDatabase (OpenRouter batches)");
      appendRunLog(runId ?? "no-run", `[match] Calling AI to match ${extraction.assemblies.length} assemblies to database...`);
      const promptText = await getResolvedAIPrompt(AI_PROMPT_KEYS.MATERIAL_MATCH);
      const result = await matchMaterialsToDatabase(
        { assemblies: extraction.assemblies },
        database,
        apiKey,
        promptText,
        totalStart,
      );
      matchedAssemblies = result.assemblies;
      logElapsed("matchMaterialsToDatabase returned");
    }

    const matchMs = Date.now() - matchStart;
    appendRunLog(runId ?? "no-run", `[match] ✓ Matched ${matchedAssemblies.length} assemblies (${(matchMs / 1000).toFixed(2)}s)`);
    console.log(`[match] Matched ${matchedAssemblies.length} assemblies — ${(matchMs / 1000).toFixed(2)}s`);

    const timestamp       = Date.now();
    const filename        = `material-match-${timestamp}.json`;
    const extractionIdStr = extractionId ?? "";

    logElapsed("About to save material match to DB");
    const { data: savedData, error: saveError } = await saveMaterialMatch(
      { assemblies: matchedAssemblies },
      filename,
      extractionIdStr,
      projectId,
    );
    if (saveError) {
      const msg = `Failed to save to database: ${JSON.stringify(saveError)}`;
      console.error("[match] DB save error:", saveError);
      if (runId) await failPipelineRun(runId, 2, msg);
      throw new Error(msg);
    }

    // Record matchId in run so step 3 can be retried
    if (runId && savedData?.id) {
      await updatePipelineRunStep(runId, 2, { matchId: savedData.id });
    }

    if (process.env.NODE_ENV === "development") {
      void writeJsonToLocal("material_match", { assemblies: matchedAssemblies }).then((p) => {
        if (p) console.log(`[match] Local file written: ${p}`);
      });
    }
    console.log(`[match] DB: ${savedData?.id} | Local: ${process.env.NODE_ENV === "development" ? "enabled" : "disabled"}`);

    const totalMs = Date.now() - totalStart;
    console.log("-".repeat(70));
    console.log(`[match] ✅ Success (${mode}). DB load: ${(dbLoadMs / 1000).toFixed(2)}s, matching: ${(matchMs / 1000).toFixed(2)}s, total: ${(totalMs / 1000).toFixed(2)}s`);
    console.log(`[match] Matched ${matchedAssemblies.length} assemblies`);
    console.log("-".repeat(70) + "\n");

    return NextResponse.json({
      success: true,
      result: { assemblies: matchedAssemblies },
      matchId: savedData?.id,
      filename,
      matchedCount: matchedAssemblies.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(`[match] Error at elapsed ${((Date.now() - totalStart) / 1000).toFixed(2)}s:`, message);
    if (stack) console.error("[match] Stack:", stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
