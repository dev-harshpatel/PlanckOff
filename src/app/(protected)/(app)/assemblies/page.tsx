"use client";

import { DefaultAssembliesManager } from "@/components/features/assemblies/DefaultAssembliesManager";
import { useApp } from "@/context/AppContext";

export default function AssembliesPage() {
  const { defaultAssemblies, setDefaultAssemblies, materials } = useApp();

  return (
    <DefaultAssembliesManager
      templates={defaultAssemblies}
      onUpdateTemplates={setDefaultAssemblies}
      materials={materials}
    />
  );
}
