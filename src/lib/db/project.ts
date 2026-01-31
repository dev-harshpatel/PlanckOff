/**
 * Project Repository
 * All project-related database operations
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import { ProjectSummary } from '@/types';

const TABLES = {
  PROJECTS: 'projects',
};

/**
 * Get all projects
 */
export async function getAllProjects(): Promise<{
  data: ProjectSummary[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.PROJECTS)
    .select('*')
    .order('created_at', { ascending: false });

  // Transform to match ProjectSummary type
  const transformedData = data?.map(project => ({
    id: project.id,
    name: project.name,
    company: project.company,
    status: project.status,
    dueDate: project.due_date,
    projectNumber: project.project_number,
    assignedTo: project.assigned_to,
    location: project.location,
  })) as ProjectSummary[];

  return { data: transformedData || null, error };
}

/**
 * Get project by ID
 */
export async function getProjectById(id: string): Promise<{
  data: ProjectSummary | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.PROJECTS)
    .select('*')
    .eq('id', id)
    .single();

  const transformedData = data
    ? {
        id: data.id,
        name: data.name,
        company: data.company,
        status: data.status,
        dueDate: data.due_date,
        projectNumber: data.project_number,
        assignedTo: data.assigned_to,
        location: data.location,
      }
    : null;

  return { data: transformedData as ProjectSummary | null, error };
}

/**
 * Create a new project
 */
export async function createProject(params: {
  name: string;
  company: string;
  status: ProjectSummary['status'];
  dueDate?: string;
  projectNumber?: string;
  assignedTo?: string;
  location?: string;
  createdBy: string;
}): Promise<{
  data: ProjectSummary | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.PROJECTS)
    .insert({
      name: params.name,
      company: params.company,
      status: params.status,
      due_date: params.dueDate,
      project_number: params.projectNumber || `P-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      assigned_to: params.assignedTo,
      location: params.location,
      created_by: params.createdBy,
    })
    .select('*')
    .single();

  const transformedData = data
    ? {
        id: data.id,
        name: data.name,
        company: data.company,
        status: data.status,
        dueDate: data.due_date,
        projectNumber: data.project_number,
        assignedTo: data.assigned_to,
        location: data.location,
      }
    : null;

  return { data: transformedData as ProjectSummary | null, error };
}

/**
 * Update project
 */
export async function updateProject(
  id: string,
  updates: Partial<{
    name: string;
    company: string;
    status: ProjectSummary['status'];
    dueDate: string;
    projectNumber: string;
    assignedTo: string;
    location: string;
  }>
): Promise<{
  data: ProjectSummary | null;
  error: { message: string; code: string } | null;
}> {
  // Convert camelCase to snake_case for database
  const dbUpdates: Record<string, any> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.company !== undefined) dbUpdates.company = updates.company;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.projectNumber !== undefined) dbUpdates.project_number = updates.projectNumber;
  if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
  if (updates.location !== undefined) dbUpdates.location = updates.location;

  const { data, error } = await supabaseAdmin
    .from(TABLES.PROJECTS)
    .update(dbUpdates)
    .eq('id', id)
    .select('*')
    .single();

  const transformedData = data
    ? {
        id: data.id,
        name: data.name,
        company: data.company,
        status: data.status,
        dueDate: data.due_date,
        projectNumber: data.project_number,
        assignedTo: data.assigned_to,
        location: data.location,
      }
    : null;

  return { data: transformedData as ProjectSummary | null, error };
}

/**
 * Delete project
 */
export async function deleteProject(id: string): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(TABLES.PROJECTS)
    .delete()
    .eq('id', id);

  return { error };
}

/**
 * Get projects by status
 */
export async function getProjectsByStatus(status: ProjectSummary['status']): Promise<{
  data: ProjectSummary[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.PROJECTS)
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });

  const transformedData = data?.map(project => ({
    id: project.id,
    name: project.name,
    company: project.company,
    status: project.status,
    dueDate: project.due_date,
    projectNumber: project.project_number,
    assignedTo: project.assigned_to,
    location: project.location,
  })) as ProjectSummary[];

  return { data: transformedData || null, error };
}

/**
 * Get projects assigned to a team member
 */
export async function getProjectsByAssignee(assignedTo: string): Promise<{
  data: ProjectSummary[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.PROJECTS)
    .select('*')
    .eq('assigned_to', assignedTo)
    .order('created_at', { ascending: false });

  const transformedData = data?.map(project => ({
    id: project.id,
    name: project.name,
    company: project.company,
    status: project.status,
    dueDate: project.due_date,
    projectNumber: project.project_number,
    assignedTo: project.assigned_to,
    location: project.location,
  })) as ProjectSummary[];

  return { data: transformedData || null, error };
}
