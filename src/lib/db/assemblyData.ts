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

  if (error) throw error;
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

  if (error) throw error;
  return { data: result, error: null };
};

/**
 * Get latest assembly extraction for a project
 */
export const getLatestAssemblyExtraction = async (projectId?: string) => {
  let query = supabaseAdmin
    .from("assembly_extractions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query.single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return { data, error: null };
};

/**
 * Get latest material match for a project
 */
export const getLatestMaterialMatch = async (projectId?: string) => {
  let query = supabaseAdmin
    .from("material_matches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query.single();

  if (error && error.code !== "PGRST116") throw error;
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
