/**
 * Projects API Routes
 * GET /api/projects - Get all projects
 * POST /api/projects - Create a new project
 */

import { NextResponse } from 'next/server';
import { getAllProjects, createProject } from '@/lib/db/project';
import { withAuth } from '@/lib/auth';
import { ProjectSummary } from '@/types';

export interface ProjectsResponse {
  success: boolean;
  projects?: ProjectSummary[];
  error?: string;
}

export interface ProjectResponse {
  success: boolean;
  project?: ProjectSummary;
  error?: string;
}

/**
 * GET /api/projects
 * Get all projects - accessible by all authenticated users
 */
export const GET = withAuth(async (request, { user }) => {
  try {
    const { data: projects, error } = await getAllProjects();

    if (error) {
      console.error('Failed to fetch projects:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch projects' },
        { status: 500 }
      );
    }

    const response: ProjectsResponse = {
      success: true,
      projects: projects || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get projects error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/projects
 * Create a new project - accessible by all authenticated users
 */
export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();
    const { name, company, status, dueDate, projectNumber, assignedTo, location } = body;

    // Validation
    if (!name || !company) {
      return NextResponse.json(
        { success: false, error: 'Name and company are required' },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ['Working Project Progress', 'Under Review', 'Submitted', 'Hold', 'Archive'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    const { data: project, error } = await createProject({
      name,
      company,
      status: status || 'Working Project Progress',
      dueDate,
      projectNumber,
      assignedTo,
      location,
      createdBy: user.id,
    });

    if (error) {
      console.error('Failed to create project:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create project' },
        { status: 500 }
      );
    }

    const response: ProjectResponse = {
      success: true,
      project: project || undefined,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
});
