'use client';

import { useMemo } from 'react';
import type { CalculatedMaterial, TakeoffInstance, WallAssembly } from '@/types';

interface UseEstimateCalculationsParams {
  assemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
  assemblySearch: string;
  editingAssemblyId: string | null;
  editingHeight: number | null;
}

export function useEstimateCalculations({
  assemblies,
  takeoffs,
  assemblySearch,
  editingAssemblyId,
  editingHeight,
}: UseEstimateCalculationsParams) {

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
    // Group all instances under key 0 (height removed from takeoff)
    statsByHeight = assemblyInstances.reduce(
      (acc, instance) => {
        const length = (instance.length || 0) * (instance.quantity || 1);
        if (!acc[0]) acc[0] = { len: 0, area: 0, count: 0, perim: 0 };
        if (currentEditingAssembly.assemblyType === 'Ceiling') {
          acc[0].area += instance.ceilingArea || 0;
          acc[0].perim = (acc[0].perim || 0) + (instance.perimeter || 0);
        } else {
          acc[0].len += length;
        }
        acc[0].count += instance.quantity || 1;
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
    filteredAssemblies,
    currentEditingAssembly,
    statsByHeight: editingAssemblyMetrics.statsByHeight,
    totalAggLength: editingAssemblyMetrics.totalAggLength,
  };
}
