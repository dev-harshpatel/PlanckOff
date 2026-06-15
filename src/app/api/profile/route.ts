import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-helpers';
import { updateTeamMember, getTeamMemberById } from '@/lib/db/team';
import { updateAdminProfile, getAdminById } from '@/lib/db/auth';
import type { ProfileResponse, UpdateProfileRequest } from '@/types/profile';

const normalizeInitials = (name: string, initials?: string) => {
  const trimmedInitials = initials?.trim();
  if (trimmedInitials) {
    return trimmedInitials.slice(0, 4).toUpperCase();
  }

  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
};

export const GET = withAuth(async (_request, { user }) => {
  const response: ProfileResponse = {
    success: true,
    user,
  };

  return NextResponse.json(response);
});

export const PATCH = withAuth(async (request: NextRequest, { user, teamMember }) => {
  try {
    const body = (await request.json()) as UpdateProfileRequest;
    const normalizedName = body.name?.trim();

    if (!normalizedName) {
      return NextResponse.json<ProfileResponse>(
        { success: false, error: 'Name is required' },
        { status: 400 },
      );
    }

    const initials = normalizeInitials(normalizedName, body.initials);

    if (teamMember) {
      const { data, error } = await updateTeamMember(teamMember.id, {
        name: normalizedName,
        initials,
      });

      if (error || !data) {
        console.error('Failed to update team member profile:', error);
        return NextResponse.json<ProfileResponse>(
          { success: false, error: 'Failed to update profile' },
          { status: 500 },
        );
      }

      const { data: refreshedMember } = await getTeamMemberById(teamMember.id);

      return NextResponse.json<ProfileResponse>({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: refreshedMember?.name || normalizedName,
          role: user.role,
          initials: refreshedMember?.initials || initials,
        },
      });
    }

    const { data, error } = await updateAdminProfile({
      id: user.id,
      name: normalizedName,
      initials,
    });

    if (error || !data) {
      console.error('Failed to update admin profile:', error);
      return NextResponse.json<ProfileResponse>(
        { success: false, error: 'Failed to update profile' },
        { status: 500 },
      );
    }

    const { data: refreshedAdmin } = await getAdminById(user.id);

    return NextResponse.json<ProfileResponse>({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: refreshedAdmin?.name || normalizedName,
        role: user.role,
        initials: refreshedAdmin?.initials || initials,
      },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json<ProfileResponse>(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
});
