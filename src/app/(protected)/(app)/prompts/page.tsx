"use client";

import { RouteGuard } from "@/components/auth";
import { PromptManagementCard } from "@/components/features/dashboard/PromptManagementCard";

export default function PromptsPage() {
  return (
    <RouteGuard path="/prompts">
      <div className="w-full mx-auto p-6">
        <PromptManagementCard />
      </div>
    </RouteGuard>
  );
}
