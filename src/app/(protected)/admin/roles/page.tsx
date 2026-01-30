"use client";

import { RoleManagement } from "@/components/features/admin";
import { RouteGuard } from "@/components/auth";

export default function RolesPage() {
  return (
    <RouteGuard allowedRoles={["Administrator"]}>
      <RoleManagement />
    </RouteGuard>
  );
}
