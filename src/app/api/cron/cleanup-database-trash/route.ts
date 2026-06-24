import { NextRequest, NextResponse } from 'next/server';
import { purgeExpiredMaterialTrash } from '@/lib/db/materialDatabase';
import { purgeExpiredLabourTrash } from '@/lib/db/labourDatabase';
import { purgeExpiredAssemblyBunchTrash } from '@/lib/db/assemblyBunchDatabase';
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
    const [materials, labour, assemblyBunches] = await Promise.all([
      purgeExpiredMaterialTrash(),
      purgeExpiredLabourTrash(),
      purgeExpiredAssemblyBunchTrash(),
    ]);

    if (materials.error || labour.error || assemblyBunches.error) {
      console.error('Cleanup database trash failed:', materials.error, labour.error, assemblyBunches.error);
      return NextResponse.json(
        { success: false, error: 'Failed to clean up one or more database trash bins' },
        { status: HTTP_STATUS.INTERNAL_ERROR },
      );
    }

    return NextResponse.json({
      success: true,
      purged: {
        materials: materials.data?.purged ?? 0,
        labour: labour.data?.purged ?? 0,
        assemblyBunches: assemblyBunches.data?.purged ?? 0,
      },
    });
  } catch (error) {
    console.error('Cleanup database trash cron error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: HTTP_STATUS.INTERNAL_ERROR },
    );
  }
}
