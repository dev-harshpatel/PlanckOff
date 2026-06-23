import { NextRequest, NextResponse } from 'next/server';
import { saveMaterialMatch } from '@/lib/db/assemblyData';
import { updatePipelineRunStep, failPipelineRun } from '@/lib/db/pipelineRuns';
import { getMatcherMaterials, getMatcherLabour, getMatcherAssemblyBunches } from '@/lib/cache/matcherDbCache';
import { matchAllAssemblies } from '@/services/matching';
import type { MatchAllResult } from '@/services/matching';
import { withAuth } from '@/lib/auth/api-helpers';
import { writeDebugJson } from '@/lib/utils/localJsonStorage';
import type { AssemblyData } from '@/types/assembly';

// Rule-based matching is CPU-only — no external API calls. 60s is generous.
export const maxDuration = 60;

export const POST = withAuth(async (req: NextRequest) => {
  console.log('\n' + '-'.repeat(70));
  console.log('[match] POST — Rule-Based Pipeline Step 2/3');
  console.log('-'.repeat(70));

  const totalStart = Date.now();
  const elapsed = () => `${((Date.now() - totalStart) / 1000).toFixed(2)}s`;

  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    let body: {
      extraction?: { assemblies?: unknown[] };
      extractionId?: string;
      projectId?: string;
      runId?: string;
    };

    try {
      body = await req.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON body';
      console.error('[match] Body parse error:', msg);
      return NextResponse.json({ error: `Invalid request body: ${msg}` }, { status: 400 });
    }

    const { extraction, extractionId, projectId, runId } = body;

    if (!extraction?.assemblies?.length) {
      return NextResponse.json({ error: 'No extraction.assemblies in body' }, { status: 400 });
    }

    if (runId) await updatePipelineRunStep(runId, 2);

    console.log(`[match] ${extraction.assemblies.length} assemblies received (elapsed ${elapsed()})`);

    // ── Load databases (memory/Redis/Supabase — cached) ──────────────────────
    let materialRows:  Awaited<ReturnType<typeof getMatcherMaterials>>;
    let labourRows:    Awaited<ReturnType<typeof getMatcherLabour>>;
    let bunchBranches: Awaited<ReturnType<typeof getMatcherAssemblyBunches>>;

    try {
      const dbStart = Date.now();
      [materialRows, labourRows, bunchBranches] = await Promise.all([
        getMatcherMaterials(),
        getMatcherLabour(),
        getMatcherAssemblyBunches(),
      ]);
      console.log(
        `[match] DB loaded — ${materialRows.length} materials, ${labourRows.length} labour rows,` +
        ` ${bunchBranches.length} branches` +
        ` (${((Date.now() - dbStart) / 1000).toFixed(2)}s, elapsed ${elapsed()})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'DB load failed';
      console.error('[match] DB load error:', msg);
      if (runId) await failPipelineRun(runId, 2, msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // ── Pre-filter: drop items with no usable text (mirrors old AI pre-clean) ─
    const cleanedAssemblies = (extraction.assemblies as AssemblyData[]).map(assembly => {
      if (!assembly.materials) return assembly;
      const cleaned = { ...assembly, materials: { ...assembly.materials } };
      for (const group of Object.keys(cleaned.materials) as Array<keyof typeof cleaned.materials>) {
        const items = cleaned.materials[group];
        if (Array.isArray(items)) {
          cleaned.materials[group] = items.filter(
            item => item.raw_text != null && String(item.raw_text).trim() !== '',
          ) as typeof items;
        }
      }
      return cleaned;
    });

    // ── Run rule-based matcher ────────────────────────────────────────────────
    const matchStart = Date.now();
    const { assemblies: matched, stats, debugItems }: MatchAllResult = matchAllAssemblies(
      { assemblies: cleanedAssemblies },
      materialRows,
      labourRows,
      bunchBranches,
    );
    const matchMs = Date.now() - matchStart;

    console.log(
      `[match] Matching complete in ${(matchMs / 1000).toFixed(2)}s (elapsed ${elapsed()})` +
      ` — ${stats.itemsMatched}/${stats.itemsTotal} items matched` +
      ` (${stats.itemsLowConfidence} low-confidence, ${stats.itemsUnmatched} unmatched)`,
    );

    // ── Save to DB ────────────────────────────────────────────────────────────
    const filename       = `material-match-${Date.now()}.json`;
    const extractionIdStr = extractionId ?? '';

    const { data: savedData, error: saveError } = await saveMaterialMatch(
      { assemblies: matched },
      filename,
      extractionIdStr,
      projectId,
    );

    if (saveError) {
      const msg = `DB save failed: ${JSON.stringify(saveError)}`;
      console.error('[match] DB save error:', saveError);
      if (runId) await failPipelineRun(runId, 2, msg);
      throw new Error(msg);
    }

    if (runId && savedData?.id) {
      await updatePipelineRunStep(runId, 2, { matchId: savedData.id });
    }

    // ── Dev local files ───────────────────────────────────────────────────────
    if (process.env.NODE_ENV === 'development') {
      const ts = Date.now();
      const pid = projectId ?? 'unknown';
      // Full match result
      void writeDebugJson('match', pid, `match_result-${ts}.json`, { assemblies: matched }).then(p => {
        if (p) console.log(`[match] Debug file: ${p}`);
      });
      // Per-item scoring breakdown — normalized input, top candidates, rule scores
      void writeDebugJson('match', pid, `match_scored-${ts}.json`, debugItems).then(p => {
        if (p) console.log(`[match] Debug scored: ${p}`);
      });
    }

    const totalMs = Date.now() - totalStart;
    console.log('-'.repeat(70));
    console.log(`[match] ✅ Done in ${(totalMs / 1000).toFixed(2)}s — matchId: ${savedData?.id}`);
    console.log('-'.repeat(70) + '\n');

    return NextResponse.json({
      success:      true,
      result:       { assemblies: matched },
      matchId:      savedData?.id,
      filename,
      matchedCount: matched.length,
      stats,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[match] Unhandled error at ${elapsed()}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
