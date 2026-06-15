import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredInvitations } from '@/lib/db/team';
import { HTTP_STATUS } from '@/lib/api/response';

const isAuthorizedCronRequest = (request: NextRequest): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`;
  }

  if (process.env.VERCEL) {
    return request.headers.get('x-vercel-cron') === '1';
  }

  return true;
};

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized cron request' },
      { status: HTTP_STATUS.UNAUTHORIZED },
    );
  }

  try {
    const { count, error } = await cleanupExpiredInvitations();

    if (error) {
      console.error('Cleanup expired invitations failed:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to clean up expired invitations' },
        { status: HTTP_STATUS.INTERNAL_ERROR },
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: count,
    });
  } catch (error) {
    console.error('Cleanup invitations cron error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: HTTP_STATUS.INTERNAL_ERROR },
    );
  }
}
