"use client";

import { DatabaseManager } from "@/components/features/database/DatabaseManager";
import { useApp } from "@/context/AppContext";

export default function DatabasePage() {
  const { materials, setMaterials } = useApp();

  return (
    <DatabaseManager materials={materials} onUpdateMaterials={setMaterials} />
  );
}
