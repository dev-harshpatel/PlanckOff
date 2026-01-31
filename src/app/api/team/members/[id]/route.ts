/**
 * API routes for individual team member operations
 * DELETE /api/team/members/[id] - Delete a team member
 * PUT /api/team/members/[id] - Update a team member
 *
 * Only accessible by Administrators and Team Leads
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getTeamMemberById,
  deleteTeamMember,
  updateTeamMember,
  getRoleByName,
} from "@/lib/db/team";
import { withRoleAuth } from "@/lib/auth";
import { RoleName } from "@/types/team";
import { ROLE_LEVELS } from "@/constants/roles";

/**
 * DELETE /api/team/members/[id]
 * Delete a team member
 */
export const DELETE = withRoleAuth(
  ["Administrator", "Team Lead"],
  async (request, { user, teamMember: currentUser }, params) => {
    try {
      const { id } = params;

      if (!currentUser) {
        return NextResponse.json(
          { success: false, error: "User not found" },
          { status: 404 },
        );
      }

      // Get the member to delete
      const { data: memberToDelete, error: memberError } =
        await getTeamMemberById(id);

      if (memberError || !memberToDelete) {
        return NextResponse.json(
          { success: false, error: "Team member not found" },
          { status: 404 },
        );
      }

      // Prevent self-deletion
      if (memberToDelete.id === currentUser.id) {
        return NextResponse.json(
          { success: false, error: "You cannot delete your own account" },
          { status: 403 },
        );
      }

      // Check permission: users can only delete members with lower authority
      const currentUserLevel = ROLE_LEVELS[user.role];
      const memberLevel = ROLE_LEVELS[memberToDelete.role.name as RoleName];

      if (currentUserLevel >= memberLevel) {
        return NextResponse.json(
          {
            success: false,
            error: "You do not have permission to delete this member",
          },
          { status: 403 },
        );
      }

      // Delete the member
      const { error: deleteError } = await deleteTeamMember(id);

      if (deleteError) {
        console.error("Failed to delete team member:", deleteError);
        return NextResponse.json(
          { success: false, error: "Failed to delete team member" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        message: "Team member deleted successfully",
      });
    } catch (error) {
      console.error("Delete team member error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);

/**
 * PUT /api/team/members/[id]
 * Update a team member
 */
export const PUT = withRoleAuth(
  ["Administrator", "Team Lead"],
  async (request, { user, teamMember: currentUser }, params) => {
    try {
      const { id } = params;

      if (!currentUser) {
        return NextResponse.json(
          { success: false, error: "User not found" },
          { status: 404 },
        );
      }

      // Get the member to update
      const { data: memberToUpdate, error: memberError } =
        await getTeamMemberById(id);

      if (memberError || !memberToUpdate) {
        return NextResponse.json(
          { success: false, error: "Team member not found" },
          { status: 404 },
        );
      }

      // Parse request body
      const body = await request.json();
      const { name, email, role, status } = body;

      // Check permission: users can only update members with lower authority
      const currentUserLevel = ROLE_LEVELS[user.role];
      const memberLevel = ROLE_LEVELS[memberToUpdate.role.name as RoleName];

      // Allow users to update their own profile (name only)
      const isSelf = memberToUpdate.id === currentUser.id;

      if (!isSelf && currentUserLevel >= memberLevel) {
        return NextResponse.json(
          {
            success: false,
            error: "You do not have permission to update this member",
          },
          { status: 403 },
        );
      }

      // Build update object
      const updates: {
        name?: string;
        email?: string;
        role_id?: string;
        status?: string;
      } = {};

      if (name && typeof name === "string") {
        updates.name = name;
      }

      // Only allow email/role/status changes by higher authority users
      if (!isSelf) {
        if (email && typeof email === "string") {
          updates.email = email.toLowerCase();
        }

        if (role && typeof role === "string") {
          const { data: roleData } = await getRoleByName(role as RoleName);
          if (roleData) {
            // Check if current user can assign this role
            const newRoleLevel = ROLE_LEVELS[role as RoleName];
            if (newRoleLevel <= currentUserLevel) {
              return NextResponse.json(
                {
                  success: false,
                  error:
                    "You cannot assign a role equal to or higher than your own",
                },
                { status: 403 },
              );
            }
            updates.role_id = roleData.id;
          }
        }

        if (status && ["Active", "Inactive"].includes(status)) {
          updates.status = status;
        }
      }

      // Perform update
      const { data: updatedMember, error: updateError } =
        await updateTeamMember(id, updates);

      if (updateError) {
        console.error("Failed to update team member:", updateError);

        if (updateError.code === "23505") {
          return NextResponse.json(
            { success: false, error: "A user with this email already exists" },
            { status: 409 },
          );
        }

        return NextResponse.json(
          { success: false, error: "Failed to update team member" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        message: "Team member updated successfully",
        member: updatedMember,
      });
    } catch (error) {
      console.error("Update team member error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
