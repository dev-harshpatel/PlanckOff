/**
 * POST /api/team/invite
 * Send invitation email to a new team member
 * Only accessible by Administrators and Team Leads
 */

import { NextResponse } from "next/server";
import {
  createInvitation,
  cleanupExpiredInvitations,
  deleteInvitationById,
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
      const normalizedEmail = body.email?.trim().toLowerCase();
      const normalizedName = body.name?.trim();
      const role = body.role;

      // Validate required fields
      if (!normalizedEmail || !normalizedName || !role) {
        return NextResponse.json(
          { success: false, error: "Email, name, and role are required" },
          { status: 400 },
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json(
          { success: false, error: "Invalid email format" },
          { status: 400 },
        );
      }

      await cleanupExpiredInvitations();

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
      const { data: existingMember } = await getTeamMemberByEmail(normalizedEmail);
      if (existingMember) {
        return NextResponse.json(
          { success: false, error: "A user with this email already exists" },
          { status: 409 },
        );
      }

      // Check for existing pending invitations
      const { data: existingInvitations } =
        await getPendingInvitationsByEmail(normalizedEmail);

      // Get the role ID
      const { data: roleData, error: roleError } = await getRoleByName(role);
      if (roleError || !roleData) {
        return NextResponse.json(
          { success: false, error: "Invalid role" },
          { status: 400 },
        );
      }

      let invitation = existingInvitations?.[0] ?? null;
      const isResend = !!invitation;

      if (isResend && invitation) {
        // Delete the old invitation to invalidate its token — old invite links stop working.
        await deleteInvitationById(invitation.id);
        invitation = null;
      }

      // Create a fresh invitation (generates a new token regardless of resend or first invite)
      const { data: createdInvitation, error: inviteError } = await createInvitation({
        email: normalizedEmail,
        name: normalizedName,
        role_id: roleData.id,
        invited_by: teamMember.id,
      });

      if (inviteError || !createdInvitation) {
        console.error("Failed to create invitation:", inviteError);
        return NextResponse.json(
          { success: false, error: "Failed to create invitation" },
          { status: 500 },
        );
      }

      invitation = createdInvitation;

      // Send invitation email
      const { success: emailSent, error: emailError } =
        await sendInvitationEmail({
          to: normalizedEmail,
          name: normalizedName,
          role,
          inviteToken: invitation.token,
          invitedByName: teamMember.name,
        });

      if (!emailSent) {
        console.error("Failed to send invitation email:", emailError);
        if (!existingInvitations?.length) {
          const { error: rollbackError } = await deleteInvitationById(invitation.id);
          if (rollbackError) {
            console.error("Failed to rollback invitation after email failure:", rollbackError);
          }
        }

        return NextResponse.json(
          {
            success: false,
            error: emailError || "Failed to send invitation email",
          },
          { status: 502 },
        );
      }

      // Generate the invitation URL for response (useful for development)
      const invitationUrl = generateInvitationUrl(invitation.token);

      return NextResponse.json({
        success: true,
        message: isResend ? "Invitation resent successfully" : "Invitation sent successfully",
        invitationUrl:
          process.env.NODE_ENV === "development" ? invitationUrl : undefined,
        resent: isResend,
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
