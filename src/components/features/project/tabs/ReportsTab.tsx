'use client';

import React from 'react';
import type { CalculatedMaterial, MaterialDefinition, TakeoffInstance, WallAssembly } from '@/types';
import type { MaterialCosting } from '@/types/assembly';
import { Reports } from '@/components/features/reports/Reports';

interface ReportsTabProps {
  isVisible: boolean;
  assemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
  manualItems: CalculatedMaterial[];
  materials: MaterialDefinition[];
  materialCostingData: MaterialCosting[];
  onUnitCostChange?: (code: string, newCost: number, type: 'material' | 'labor', unit?: string) => void;
  displayUnit: 'imperial' | 'metric';
  reportScopeId?: string | null;
  finalOutputId?: string | null;
  activeReportTab?: 'proposal' | 'bidding' | 'markups' | 'materials' | 'matlab' | 'labor';
  setActiveReportTab?: (
    tab: 'proposal' | 'bidding' | 'markups' | 'materials' | 'matlab' | 'labor',
  ) => void;
  onCloseReport?: () => void;
}

export const ReportsTab = ({
  isVisible,
  assemblies,
  takeoffs,
  manualItems,
  materials,
  materialCostingData,
  onUnitCostChange,
  displayUnit,
  reportScopeId,
  finalOutputId,
  activeReportTab,
  setActiveReportTab,
  onCloseReport,
}: ReportsTabProps) => {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-50 bg-white overflow-auto flex flex-col">
      <Reports
        assemblies={assemblies}
        takeoffs={takeoffs}
        manualItems={manualItems}
        materials={materials}
        materialCostingData={materialCostingData}
        onUnitCostChange={onUnitCostChange}
        displayUnit={displayUnit}
        reportScopeId={reportScopeId ?? finalOutputId ?? null}
        activeReportTab={activeReportTab}
        setActiveReportTab={setActiveReportTab}
        onCloseReport={onCloseReport}
      />
    </div>
  );
};
