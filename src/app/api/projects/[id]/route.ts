/**
 * Project API Routes (Individual)
 * GET /api/projects/[id] - Get a specific project
 * PUT /api/projects/[id] - Update a project
 * DELETE /api/projects/[id] - Delete a project
 */

import { NextResponse } from 'next/server';
import { getProjectById, updateProject, deleteProject } from '@/lib/db/project';
import { withAuth } from '@/lib/auth';
import { ProjectResponse } from '../route';

/**
 * GET /api/projects/[id]
 * Get a specific project - accessible by all authenticated users
 */
export const GET = withAuth(async (request, { user }, params) => {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const { data: project, error } = await getProjectById(id);

    if (error) {
      console.error('Failed to fetch project:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch project' },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const response: ProjectResponse = {
      success: true,
      project,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get project error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/projects/[id]
 * Update a project - accessible by all authenticated users
 */
export const PUT = withAuth(async (request, { user }, params) => {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, company, status, dueDate, projectNumber, assignedTo, location, province } = body;

    // Validate status if provided
    const validStatuses = ['Working Project Progress', 'Under Review', 'Submitted', 'Hold', 'Archive'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Check if project exists
    const { data: existingProject } = await getProjectById(id);
    if (!existingProject) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const { data: project, error } = await updateProject(id, {
      name,
      company,
      status,
      dueDate,
      projectNumber,
      assignedTo,
      location,
      province,
    });

    if (error) {
      console.error('Failed to update project:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update project' },
        { status: 500 }
      );
    }

    const response: ProjectResponse = {
      success: true,
      project: project || undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/projects/[id]
 * Delete a project - accessible by all authenticated users
 */
export const DELETE = withAuth(async (request, { user }, params) => {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Check if project exists
    const { data: existingProject } = await getProjectById(id);
    if (!existingProject) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const { error } = await deleteProject(id);

    if (error) {
      console.error('Failed to delete project:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete project' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
});
