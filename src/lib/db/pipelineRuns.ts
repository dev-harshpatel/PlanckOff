import { supabaseAdmin } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStatus = 'running' | 'complete' | 'failed';

export interface PipelineRun {
  id: string;
  projectId: string;
  createdBy: string | null;
  status: PipelineStatus;
  /** 0=pre-flight, 1=extract, 2=match, 3=finalize */
  currentStep: number;
  errorStep: number | null;
  errorMessage: string | null;
  takeoffOutputId: string | null;
  extractionId: string | null;
  matchId: string | null;
  finalOutputId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Transformer ──────────────────────────────────────────────────────────────

const toRun = (row: Record<string, unknown>): PipelineRun => ({
  id:               row.id as string,
  projectId:        row.project_id as string,
  createdBy:        (row.created_by as string | null) ?? null,
  status:           row.status as PipelineStatus,
  currentStep:      row.current_step as number,
  errorStep:        (row.error_step as number | null) ?? null,
  errorMessage:     (row.error_message as string | null) ?? null,
  takeoffOutputId:  (row.takeoff_output_id as string | null) ?? null,
  extractionId:     (row.extraction_id as string | null) ?? null,
  matchId:          (row.match_id as string | null) ?? null,
  finalOutputId:    (row.final_output_id as string | null) ?? null,
  createdAt:        row.created_at as string,
  updatedAt:        row.updated_at as string,
});

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Creates a new pipeline run record. Call this before step 1 (extract).
 * Returns the runId to pass to all subsequent step routes.
 */
export async function createPipelineRun(
  projectId: string,
  createdBy: string | null,
): Promise<{ data: PipelineRun | null; error: { message: string } | null }> {
  const { data, error } = await supabaseAdmin
    .from('pipeline_runs')
    .insert({
      project_id: projectId,
      created_by: createdBy,
      status: 'running',
      current_step: 0,
    })
    .select()
    .single();

  if (error) return { data: null, error: { message: error.message } };
  return { data: toRun(data as Record<string, unknown>), error: null };
}

/**
 * Updates the current step and optionally records step output IDs.
 * Call at the START of each step so progress is visible even if the step times out.
 */
export async function updatePipelineRunStep(
  runId: string,
  step: number,
  metadata?: {
    takeoffOutputId?: string;
    extractionId?: string;
    matchId?: string;
    finalOutputId?: string;
  },
): Promise<void> {
  const updates: Record<string, unknown> = {
    current_step: step,
    updated_at: new Date().toISOString(),
  };
  if (metadata?.takeoffOutputId) updates.takeoff_output_id = metadata.takeoffOutputId;
  if (metadata?.extractionId)    updates.extraction_id    = metadata.extractionId;
  if (metadata?.matchId)         updates.match_id         = metadata.matchId;
  if (metadata?.finalOutputId)   updates.final_output_id  = metadata.finalOutputId;

  await supabaseAdmin.from('pipeline_runs').update(updates).eq('id', runId);
}

/**
 * Marks a pipeline run as successfully complete with the final output ID.
 */
export async function completePipelineRun(
  runId: string,
  finalOutputId: string,
): Promise<void> {
  await supabaseAdmin.from('pipeline_runs').update({
    status: 'complete',
    current_step: 3,
    final_output_id: finalOutputId,
    updated_at: new Date().toISOString(),
  }).eq('id', runId);
}

/**
 * Marks a pipeline run as failed at a specific step with an error message.
 * The run can be retried from the failed step using the same runId.
 */
export async function failPipelineRun(
  runId: string,
  step: number,
  message: string,
): Promise<void> {
  await supabaseAdmin.from('pipeline_runs').update({
    status: 'failed',
    error_step: step,
    error_message: message,
    updated_at: new Date().toISOString(),
  }).eq('id', runId);
}

/**
 * Fetches a single pipeline run by ID. Used by the retry UI to restore run state.
 */
export async function getPipelineRunById(
  runId: string,
): Promise<{ data: PipelineRun | null; error: { message: string } | null }> {
  const { data, error } = await supabaseAdmin
    .from('pipeline_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error) return { data: null, error: { message: error.message } };
  return { data: toRun(data as Record<string, unknown>), error: null };
}
