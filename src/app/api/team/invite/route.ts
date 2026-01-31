/**
 * POST /api/team/invite
 * Send invitation email to a new team member
 * Only accessible by Administrators and Team Leads
 */

import { NextResponse } from "next/server";
import {
  createInvitation,
  getRoleByName,
  getTeamMemberByEmail,
  getPendingInvitationsByEmail,
} from "@/lib/db/team";
import { withRoleAuth } from "@/lib/auth";
import {
  sendInvitationEmail,
  generateInvitationUrl,
} from "@/lib/email/invitation";
import { canInviteRole } from "@/constants/roles";
import { InviteRequest, RoleName } from "@/types/team";

export const POST = withRoleAuth(
  ["Administrator", "Team Lead"],
  async (request, { user, teamMember }) => {
    try {
      if (!teamMember) {
        return NextResponse.json(
          { success: false, error: "User not found" },
          { status: 404 },
        );
      }

      // Parse request body
      const body: InviteRequest = await request.json();
      const { email, name, role } = body;

      // Validate required fields
      if (!email || !name || !role) {
        return NextResponse.json(
          { success: false, error: "Email, name, and role are required" },
          { status: 400 },
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { success: false, error: "Invalid email format" },
          { status: 400 },
        );
      }

      // Check if user can invite this role
      if (!canInviteRole(user.role, role)) {
        return NextResponse.json(
          {
            success: false,
            error: `You don't have permission to invite ${role}s`,
          },
          { status: 403 },
        );
      }

      // Check if email already exists as a team member
      const { data: existingMember } = await getTeamMemberByEmail(email);
      if (existingMember) {
        return NextResponse.json(
          { success: false, error: "A user with this email already exists" },
          { status: 409 },
        );
      }

      // Check for existing pending invitations
      const { data: existingInvitations } =
        await getPendingInvitationsByEmail(email);
      if (existingInvitations && existingInvitations.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: "An invitation has already been sent to this email",
          },
          { status: 409 },
        );
      }

      // Get the role ID
      const { data: roleData, error: roleError } = await getRoleByName(role);
      if (roleError || !roleData) {
        return NextResponse.json(
          { success: false, error: "Invalid role" },
          { status: 400 },
        );
      }

      // Create invitation record
      const { data: invitation, error: inviteError } = await createInvitation({
        email,
        name,
        role_id: roleData.id,
        invited_by: teamMember.id,
      });

      if (inviteError || !invitation) {
        console.error("Failed to create invitation:", inviteError);
        return NextResponse.json(
          { success: false, error: "Failed to create invitation" },
          { status: 500 },
        );
      }

      // Send invitation email
      const { success: emailSent, error: emailError } =
        await sendInvitationEmail({
          to: email,
          name,
          role,
          inviteToken: invitation.token,
          invitedByName: teamMember.name,
        });

      if (!emailSent) {
        console.error("Failed to send invitation email:", emailError);
        // Don't fail the request - invitation is created, email can be resent
      }

      // Generate the invitation URL for response (useful for development)
      const invitationUrl = generateInvitationUrl(invitation.token);

      return NextResponse.json({
        success: true,
        message: "Invitation sent successfully",
        invitationUrl:
          process.env.NODE_ENV === "development" ? invitationUrl : undefined,
      });
    } catch (error) {
      console.error("Invite API error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
