"use client";

import { RouteGuard } from "@/components/auth";
import { DatabaseManager } from "@/components/features/database/DatabaseManager";
import { useApp } from "@/context/AppContext";

export default function DatabasePage() {
  const { materials, setMaterials } = useApp();

  return (
    <RouteGuard path="/database">
      <DatabaseManager materials={materials} onUpdateMaterials={setMaterials} />
    </RouteGuard>
  );
}
