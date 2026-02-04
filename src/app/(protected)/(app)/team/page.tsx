"use client";

import { TeamManagement } from "@/components/features/team/TeamManagement";
import { RouteGuard } from "@/components/auth";

export default function TeamPage() {
  return (
    <RouteGuard allowedRoles={["Administrator", "Team Lead"]}>
      <TeamManagement />
    </RouteGuard>
  );
}
