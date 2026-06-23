"use client";

import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/features/dashboard/Dashboard";
import { useNavigationLoading } from "@/context/NavigationLoadingContext";

export default function DashboardPage() {
  const router = useRouter();
  const { startNavigation } = useNavigationLoading();

  const handleOpenProject = (project?: { id: string }) => {
    if (project?.id) {
      startNavigation(`/project?id=${project.id}`);
      router.push(`/project?id=${project.id}`);
    } else {
      startNavigation("/project");
      router.push("/project");
    }
  };

  return <Dashboard onOpenProject={handleOpenProject} />;
}
