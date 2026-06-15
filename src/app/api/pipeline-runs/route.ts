import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-helpers';
import { createPipelineRun, getPipelineRunById } from '@/lib/db/pipelineRuns';

/**
 * POST /api/pipeline-runs
 * Creates a new pipeline run before step 1 (extract) begins.
 * Returns runId which is then passed to /api/extract, /api/match, /api/finalize.
 */
export const POST = withAuth(async (req: NextRequest, { user, teamMember }) => {
  const body = await req.json().catch(() => null) ?? {};
  const { projectId } = body as { projectId?: string };

  if (!projectId || typeof projectId !== 'string') {
    return NextResponse.json(
      { success: false, error: 'projectId is required' },
      { status: 400 },
    );
  }

  // Prefer teamMember.id (new auth); fall back to user.id (legacy admin)
  const createdBy = teamMember?.id ?? user?.id ?? null;

  const { data, error } = await createPipelineRun(projectId, createdBy);
  if (error) {
    console.error('[pipeline-runs] Failed to create run:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, runId: data!.id });
});

/**
 * GET /api/pipeline-runs?runId=<id>
 * Fetches a specific run record. Used by the UI to restore retry state.
 */
export const GET = withAuth(async (req: NextRequest) => {
  const runId = new URL(req.url).searchParams.get('runId');

  if (!runId) {
    return NextResponse.json(
      { success: false, error: 'runId query param is required' },
      { status: 400 },
    );
  }

  const { data, error } = await getPipelineRunById(runId);
  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, run: data });
});
