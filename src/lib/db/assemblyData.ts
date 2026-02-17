import { supabaseAdmin } from "@/lib/supabase/server";

export interface AssemblyExtraction {
  id: string;
  project_id: string | null;
  filename: string;
  data: {
    assemblies: unknown[];
  };
  created_at: string;
  created_by: string;
}

export interface MaterialMatch {
  id: string;
  project_id: string | null;
  extraction_id: string;
  filename: string;
  data: {
    assemblies: unknown[];
  };
  created_at: string;
  created_by: string;
}

/**
 * Save assembly extraction data to database
 */
export const saveAssemblyExtraction = async (
  data: { assemblies: unknown[] },
  filename: string,
  projectId?: string,
  createdBy?: string,
) => {
  const { data: result, error } = await supabaseAdmin
    .from("assembly_extractions")
    .insert({
      project_id: projectId || null,
      filename,
      data,
      created_by: createdBy || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[assemblyData] saveAssemblyExtraction error:", error.code, error.message);
    throw error;
  }
  return { data: result, error: null };
};

/**
 * Save material match data to database
 */
export const saveMaterialMatch = async (
  data: { assemblies: unknown[] },
  filename: string,
  extractionId: string,
  projectId?: string,
  createdBy?: string,
) => {
  const { data: result, error } = await supabaseAdmin
    .from("material_matches")
    .insert({
      project_id: projectId || null,
      extraction_id: extractionId,
      filename,
      data,
      created_by: createdBy || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[assemblyData] saveMaterialMatch error:", error.code, error.message);
    throw error;
  }
  return { data: result, error: null };
};

/**
 * Get latest assembly extraction for a project.
 * When projectId is provided, returns only data for that project (no fallback).
 * When projectId is omitted, returns latest record regardless of project.
 */
export const getLatestAssemblyExtraction = async (projectId?: string) => {
  if (projectId) {
    const { data, error } = await supabaseAdmin
      .from("assembly_extractions")
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
    .from("assembly_extractions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code !== "PGRST116") throw error;
    return { data: null, error: null };
  }
  return { data, error: null };
};

/**
 * Get latest material match for a project.
 * When projectId is provided, returns only data for that project (no fallback).
 * When projectId is omitted, returns latest record regardless of project.
 */
export const getLatestMaterialMatch = async (projectId?: string) => {
  if (projectId) {
    const { data, error } = await supabaseAdmin
      .from("material_matches")
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
    .from("material_matches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code !== "PGRST116") throw error;
    return { data: null, error: null };
  }
  return { data, error: null };
};

/**
 * Delete assembly extraction, material match, and final output for a project.
 * Takeoff outputs are kept so the same Excel upload can be used when re-running
 * the pipeline (finalize needs takeoff by ID or by project).
 */
export const deleteProjectAssemblyData = async (projectId: string) => {
  const [extractionResult, matchResult, finalResult] = await Promise.all([
    supabaseAdmin
      .from("assembly_extractions")
      .delete()
      .eq("project_id", projectId),
    supabaseAdmin.from("material_matches").delete().eq("project_id", projectId),
    supabaseAdmin.from("final_outputs").delete().eq("project_id", projectId),
  ]);

  if (extractionResult.error) throw extractionResult.error;
  if (matchResult.error) throw matchResult.error;
  if (finalResult.error) throw finalResult.error;
};

/**
 * Get assembly extraction by ID.
 * Used when we have a material match but extraction was saved without project_id.
 */
export const getAssemblyExtractionById = async (extractionId: string) => {
  const { data, error } = await supabaseAdmin
    .from("assembly_extractions")
    .select("*")
    .eq("id", extractionId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") throw error;
    return { data: null, error: null };
  }
  return { data, error: null };
};

/**
 * Get all assembly extractions for a project
 */
export const getAssemblyExtractions = async (projectId?: string) => {
  let query = supabaseAdmin
    .from("assembly_extractions")
    .select("*")
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return { data, error: null };
};

/**
 * Get all material matches for a project
 */
export const getMaterialMatches = async (projectId?: string) => {
  let query = supabaseAdmin
    .from("material_matches")
    .select("*")
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return { data, error: null };
};
