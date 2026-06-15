'use client';

import { useMemo } from 'react';
import type { CalculatedMaterial, MaterialDefinition, TakeoffInstance, WallAssembly } from '@/types';
import { getEffectiveProjectUnitCost } from '@/lib/utils/projectPricing';

interface UseEstimateCalculationsParams {
  assemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
  resolvedMaterials: MaterialDefinition[];
  assemblySearch: string;
  editingAssemblyId: string | null;
  editingHeight: number | null;
}

export function useEstimateCalculations({
  assemblies,
  takeoffs,
  resolvedMaterials,
  assemblySearch,
  editingAssemblyId,
  editingHeight,
}: UseEstimateCalculationsParams) {
  const priceMap = useMemo(() => {
    const map: Record<
      string,
      { cost: number; per?: string; waste?: number; supplier?: string }
    > = {};

    resolvedMaterials.forEach((material) => {
      map[material.description] = {
        cost: getEffectiveProjectUnitCost(material),
        per: material.per,
      };
    });

    return map;
  }, [resolvedMaterials]);

  const filteredAssemblies = useMemo(() => {
    const search = assemblySearch.toLowerCase();

    return assemblies.filter(
      (assembly) =>
        assembly.code.toLowerCase().includes(search) ||
        assembly.description.toLowerCase().includes(search),
    );
  }, [assemblies, assemblySearch]);

  const currentEditingAssembly = useMemo(
    () => assemblies.find((assembly) => assembly.id === editingAssemblyId),
    [assemblies, editingAssemblyId],
  );

  const editingAssemblyMetrics = useMemo(() => {
    let statsByHeight: Record<
      number,
      { len: number; area: number; count: number; perim?: number }
    > = {};
    let totalAggLength = 0;

    if (!currentEditingAssembly) {
      return { statsByHeight, totalAggLength };
    }

    const assemblyInstances = takeoffs[currentEditingAssembly.id] || [];
    statsByHeight = assemblyInstances.reduce(
      (acc, instance) => {
        const height = instance.height || 0;
        const length = (instance.length || 0) * (instance.quantity || 1);

        if (!acc[height]) acc[height] = { len: 0, area: 0, count: 0, perim: 0 };

        if (currentEditingAssembly.assemblyType === 'Ceiling') {
          acc[height].area += instance.ceilingArea || 0;
          acc[height].perim = (acc[height].perim || 0) + (instance.perimeter || 0);
        } else {
          acc[height].len += length;
          acc[height].area += length * height;
        }

        acc[height].count += instance.quantity || 1;
        return acc;
      },
      {} as Record<number, { len: number; area: number; count: number; perim?: number }>,
    );

    if (assemblyInstances.length > 0) {
      const baseTotal = Object.values(statsByHeight).reduce(
        (total, value) => total + (value.len || 0),
        0,
      );

      totalAggLength =
        editingHeight != null && statsByHeight[editingHeight]
          ? statsByHeight[editingHeight].len
          : baseTotal;
    } else {
      totalAggLength = currentEditingAssembly.defaultLength || 0;
    }

    return { statsByHeight, totalAggLength };
  }, [currentEditingAssembly, editingHeight, takeoffs]);

  return {
    priceMap,
    filteredAssemblies,
    currentEditingAssembly,
    statsByHeight: editingAssemblyMetrics.statsByHeight,
    totalAggLength: editingAssemblyMetrics.totalAggLength,
  };
}
