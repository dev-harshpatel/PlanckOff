import { supabaseAdmin } from "@/lib/supabase/server";

export interface TakeoffOutput {
  id: string;
  project_id: string | null;
  filename: string;
  data: unknown;
  created_at: string;
  created_by: string | null;
}

export interface FinalOutput {
  id: string;
  project_id: string | null;
  assembly_extraction_id: string | null;
  takeoff_output_id: string | null;
  filename: string;
  data: unknown;
  created_at: string;
  created_by: string | null;
}

/**
 * Save takeoff output (parsed Excel data) to database
 */
export const saveTakeoffOutput = async (
  data: unknown,
  filename: string,
  projectId?: string,
  createdBy?: string,
) => {
  const { data: result, error } = await supabaseAdmin
    .from("takeoff_outputs")
    .insert({
      project_id: projectId || null,
      filename,
      data,
      created_by: createdBy || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[pipelineOutputs] saveTakeoffOutput error:", error.code, error.message);
    throw error;
  }
  return { data: result, error: null };
};

/**
 * Save final output (QuickBid-style JSON) to database
 */
export const saveFinalOutput = async (
  data: unknown,
  filename: string,
  projectId?: string,
  assemblyExtractionId?: string,
  takeoffOutputId?: string,
  createdBy?: string,
) => {
  const { data: result, error } = await supabaseAdmin
    .from("final_outputs")
    .insert({
      project_id: projectId || null,
      assembly_extraction_id: assemblyExtractionId || null,
      takeoff_output_id: takeoffOutputId || null,
      filename,
      data,
      created_by: createdBy || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[pipelineOutputs] saveFinalOutput error:", error.code, error.message);
    throw error;
  }
  return { data: result, error: null };
};

/**
 * Get latest takeoff output for a project
 */
export const getLatestTakeoffOutput = async (projectId?: string) => {
  if (projectId) {
    const { data, error } = await supabaseAdmin
      .from("takeoff_outputs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!error && data) return { data, error: null };
    if (error && error.code !== "PGRST116") throw error;
    return { data: null, error: null };
  }

  const { data, error } = await supabaseAdmin
    .from("takeoff_outputs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return { data, error: null };
};

/**
 * Get latest final output for a project
 */
export const getLatestFinalOutput = async (projectId?: string) => {
  if (projectId) {
    const { data, error } = await supabaseAdmin
      .from("final_outputs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!error && data) return { data, error: null };
    if (error && error.code !== "PGRST116") throw error;
    return { data: null, error: null };
  }

  const { data, error } = await supabaseAdmin
    .from("final_outputs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return { data, error: null };
};
