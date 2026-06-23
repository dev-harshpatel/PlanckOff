'use client';

import { RouteGuard } from '@/components/auth';
import { DatabasePage } from '@/components/features/database/new/DatabasePage';

export default function DatabasePageRoute() {
  return (
    <RouteGuard path="/database">
      <DatabasePage />
    </RouteGuard>
  );
}
