"use client";

import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/features/dashboard/Dashboard";

export default function DashboardPage() {
  const router = useRouter();

  const handleOpenProject = (project?: { id: string }) => {
    if (project?.id) {
      router.push(`/project?id=${project.id}`);
    } else {
      router.push("/project");
    }
  };

  return <Dashboard onOpenProject={handleOpenProject} />;
}
