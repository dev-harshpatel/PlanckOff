"use client";

import { RoleManagement } from "@/components/features/admin";
import { RouteGuard } from "@/components/auth";

export default function RolesPage() {
  return (
    <RouteGuard path="/admin/roles">
      <RoleManagement />
    </RouteGuard>
  );
}
