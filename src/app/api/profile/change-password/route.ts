import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-helpers';
import { validatePassword } from '@/constants/roles';
import { AUTH_CONFIG } from '@/constants/auth';
import { findAdminByEmail, updateAdminPassword } from '@/lib/db/auth';
import { getTeamMemberByEmailForAuth, updateTeamMemberPassword } from '@/lib/db/team';
import type { ChangePasswordRequest } from '@/types/profile';

export const POST = withAuth(async (request: NextRequest, { user, teamMember }) => {
  try {
    const body = (await request.json()) as ChangePasswordRequest;
    const currentPassword = body.currentPassword?.trim();
    const newPassword = body.newPassword?.trim();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required' },
        { status: 400 },
      );
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: passwordValidation.errors.join('. ') },
        { status: 400 },
      );
    }

    if (teamMember) {
      const { data: member } = await getTeamMemberByEmailForAuth(user.email);
      if (!member?.password_hash) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 },
        );
      }

      const currentMatches = await bcrypt.compare(currentPassword, member.password_hash);
      if (!currentMatches) {
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect' },
          { status: 400 },
        );
      }

      const passwordHash = await bcrypt.hash(newPassword, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
      const { error } = await updateTeamMemberPassword({
        id: teamMember.id,
        passwordHash,
      });

      if (error) {
        console.error('Failed to update team member password:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to update password' },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, message: 'Password updated successfully' });
    }

    const { data: admin } = await findAdminByEmail(user.email);
    if (!admin?.password_hash) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      );
    }

    const currentMatches = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!currentMatches) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
    const { error } = await updateAdminPassword({
      id: user.id,
      passwordHash,
    });

    if (error) {
      console.error('Failed to update admin password:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update password' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
});
