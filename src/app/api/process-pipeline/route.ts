/**
 * POST /api/process-pipeline
 * Single-prompt flow: PDF + Excel → assembly + takeoff + final output.
 * Saves all outputs to database (and optionally to local for backup).
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { extractAssembliesFromPDF } from "@/services/openrouter/extractAssemblies";
import { finalizeWithUnifiedPrompt } from "@/services/openrouter/processWithUnifiedPrompt";
import { parseRawTakeoffSheet } from "@/services/takeoff/parseRawTakeoff";
import { saveAssemblyExtraction } from "@/lib/db/assemblyData";
import { getAllMaterials } from "@/lib/db/materials";
import {
  saveTakeoffOutput,
  saveFinalOutput,
} from "@/lib/db/pipelineOutputs";
import { enrichFinalOutputWithQuantities } from "@/lib/utils/enrichFinalOutputWithQuantities";
import { writeJsonToLocal } from "@/lib/utils/localJsonStorage";

// Hobby plan max: 300s. Pro allows up to 900s.
export const maxDuration = 300;

const TAG = "[process-pipeline]";
const elapsed = (start: number) => `${((performance.now() - start) / 1000).toFixed(2)}s`;

export async function POST(req: NextRequest) {
  const pipelineStart = performance.now();
  console.log(`\n${"=".repeat(70)}`);
  console.log(`${TAG} POST /api/process-pipeline — started at ${new Date().toISOString()}`);
  console.log(`${"=".repeat(70)}`);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error(`${TAG} OPENROUTER_API_KEY is not configured`);
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    // --- Parse request body ---
    let body: { pdfBase64?: string; excelBase64?: string; projectId?: string };
    try {
      body = await req.json();
    } catch (parseErr) {
      const msg =
        parseErr instanceof Error ? parseErr.message : "Invalid JSON body";
      console.error(`${TAG} Failed to parse request body: ${msg}`);
      return NextResponse.json(
        { error: `Invalid request body: ${msg}` },
        { status: 400 },
      );
    }

    const { pdfBase64, excelBase64, projectId } = body;
    if (!pdfBase64) {
      return NextResponse.json(
        { error: "pdfBase64 is required" },
        { status: 400 },
      );
    }
    if (!excelBase64) {
      return NextResponse.json(
        { error: "excelBase64 is required" },
        { status: 400 },
      );
    }

    console.log(`${TAG} Received PDF (${(pdfBase64.length * 0.75 / 1024).toFixed(0)} KB) + Excel (${(excelBase64.length * 0.75 / 1024).toFixed(0)} KB)`);

    const excelBuf = Buffer.from(excelBase64, "base64");
    const excelArrayBuffer = new ArrayBuffer(excelBuf.length);
    new Uint8Array(excelArrayBuffer).set(excelBuf);

    // ── Step 1: PDF → Assembly JSON ──────────────────────────────────
    console.log(`\n${TAG} ── Step 1/4: Extracting assemblies from PDF ──`);
    const step1Start = performance.now();
    const extractResult = await extractAssembliesFromPDF(pdfBase64, apiKey);
    const assemblyPayload = { assemblies: extractResult.assemblies };
    const assemblyTs = Date.now();
    const assemblyFilename = `assembly-${assemblyTs}.json`;
    const { data: assemblySaved } = await saveAssemblyExtraction(
      assemblyPayload,
      assemblyFilename,
      projectId,
    );
    const assemblyPath = await writeJsonToLocal("assembly", assemblyPayload);
    console.log(`${TAG} Step 1 done [${elapsed(step1Start)}] — ${extractResult.assemblies.length} assemblies`);
    console.log(`${TAG}   → DB: ${assemblySaved?.id ?? "ok"} | Local: (disabled)`);

    // ── Step 2: Excel → Takeoff JSON ─────────────────────────────────
    console.log(`\n${TAG} ── Step 2/4: Parsing Excel takeoff ──`);
    const step2Start = performance.now();
    const takeoffRecords = parseRawTakeoffSheet(excelArrayBuffer);
    const takeoffPayload = takeoffRecords;
    const takeoffTs = Date.now();
    const takeoffFilename = `takeoff-${takeoffTs}.json`;
    const { data: takeoffSaved } = await saveTakeoffOutput(
      takeoffPayload,
      takeoffFilename,
      projectId,
    );
    const takeoffPath = await writeJsonToLocal("takeoff", takeoffPayload);
    console.log(`${TAG} Step 2 done [${elapsed(step2Start)}] — ${takeoffRecords.length} takeoff rows`);
    console.log(`${TAG}   → DB: ${takeoffSaved?.id ?? "ok"} | Local: (disabled)`);

    // ── Step 3: Load Material Database ───────────────────────────────
    console.log(`\n${TAG} ── Step 3/4: Loading material database ──`);
    const step3Start = performance.now();
    const dataDir = path.join(process.cwd(), "data");
    const matDbPath = path.join(dataDir, "material-database.json");
    const materialDbRaw = await readFile(matDbPath, "utf-8");
    const materialDb = JSON.parse(materialDbRaw) as unknown;
    console.log(`${TAG} Step 3 done [${elapsed(step3Start)}] — loaded from ${matDbPath} (${(materialDbRaw.length / 1024).toFixed(0)} KB)`);

    // ── Step 4: Unified AI Prompt → Final JSON ───────────────────────
    console.log(`\n${TAG} ── Step 4/4: Running unified AI prompt ──`);
    const step4Start = performance.now();
    const finalResult = await finalizeWithUnifiedPrompt(
      {
        assemblyJson: assemblyPayload,
        takeoffJson: takeoffPayload,
        materialDb,
      },
      apiKey,
    );
    console.log(`${TAG} Step 4 done [${elapsed(step4Start)}] — ${finalResult.assemblies.length} final assemblies`);

    const finalPayload = { assemblies: finalResult.assemblies };

    // Enrich with computed quantities (single source of truth)
    const { data: materials } = await getAllMaterials();
    if (materials && materials.length > 0) {
      enrichFinalOutputWithQuantities(finalPayload, materials);
      console.log(`${TAG} Enriched assemblies with stored quantities`);
    }
    const finalTs = Date.now();
    const finalFilename = `final_output-${finalTs}.json`;
    const { data: finalSaved } = await saveFinalOutput(
      finalPayload,
      finalFilename,
      projectId,
      assemblySaved?.id,
      takeoffSaved?.id,
    );
    const finalPath = await writeJsonToLocal("final_output", finalPayload);
    console.log(
      `${TAG}   → DB: ${finalSaved?.id ?? "ok"} | Local: ${finalPath || "(failed)"}`,
    );

    // ── Summary ──────────────────────────────────────────────────────
    const totalTime = elapsed(pipelineStart);
    console.log(`\n${"=".repeat(70)}`);
    console.log(`${TAG} PIPELINE COMPLETE [${totalTime}]`);
    console.log(`${TAG}   Assemblies from PDF : ${extractResult.assemblies.length}`);
    console.log(`${TAG}   Takeoff rows        : ${takeoffRecords.length}`);
    console.log(`${TAG}   Final assemblies     : ${finalResult.assemblies.length}`);
    console.log(`${TAG}   Tokens used          : ${finalResult.usage.total_tokens}`);
    console.log(`${TAG}   Step 1 (PDF extract) : ${elapsed(step1Start)}`);
    console.log(`${TAG}   Step 2 (Excel parse) : ${elapsed(step2Start)}`);
    console.log(`${TAG}   Step 3 (Material DB) : ${elapsed(step3Start)}`);
    console.log(`${TAG}   Step 4 (AI prompt)   : ${elapsed(step4Start)}`);
    console.log(`${TAG}   Total                : ${totalTime}`);
    console.log(`${"=".repeat(70)}\n`);

    return NextResponse.json({
      success: true,
      assemblyCount: extractResult.assemblies.length,
      takeoffCount: takeoffRecords.length,
      finalCount: finalResult.assemblies.length,
      tokensUsed: finalResult.usage.total_tokens,
      assemblyResult: assemblyPayload,
      takeoffResult: takeoffPayload,
      finalResult: finalPayload,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(`\n${TAG} ERROR [${elapsed(pipelineStart)}]: ${message}`);
    if (stack) console.error(`${TAG} Stack: ${stack}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
