"use client";

import { RouteGuard } from "@/components/auth";
import { DefaultAssembliesManager } from "@/components/features/assemblies/DefaultAssembliesManager";
import { useApp } from "@/context/AppContext";

export default function AssembliesPage() {
  const { defaultAssemblies, setDefaultAssemblies, materials } = useApp();

  return (
    <RouteGuard path="/assemblies">
      <DefaultAssembliesManager
        templates={defaultAssemblies}
        onUpdateTemplates={setDefaultAssemblies}
        materials={materials}
      />
    </RouteGuard>
  );
}
