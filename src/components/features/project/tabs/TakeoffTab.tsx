'use client';

import React from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type { TakeoffInstance, WallAssembly } from '@/types';
import type { PipelineCompleteData } from '@/context/PipelineContext';
import { TakeoffScheduleView } from '@/components/features/project/TakeoffScheduleView';
import { Button } from '@/components/ui';

interface TakeoffTabProps {
  filteredAssemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
  addInstance: (assemblyId: string | null) => void;
  activeAssemblyId: string | null;
  updateInstance: (assemblyId: string, instanceId: string, field: string, value: any) => void;
  deleteInstance: (assemblyId: string, instanceId: string) => void;
  openImportModal: (projectId: string | undefined, onComplete?: (data: PipelineCompleteData) => void) => void;
  projectId?: string | null;
  handleImportComplete: (data: PipelineCompleteData) => void;
}

export const TakeoffTab = ({
  filteredAssemblies,
  takeoffs,
  addInstance,
  activeAssemblyId,
  updateInstance,
  deleteInstance,
  openImportModal,
  projectId,
  handleImportComplete,
}: TakeoffTabProps) => (
  <div className="flex-1 h-full flex flex-col bg-slate-50 min-w-0">
    <div className="p-4 border-b border-slate-200 bg-white flex-none">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          Takeoff Schedule
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={Upload}
            onClick={() => openImportModal(projectId ?? undefined, handleImportComplete)}
            size="sm"
          >
            Import Files
          </Button>
        </div>
      </div>
    </div>

    <div className="flex-1 overflow-hidden relative flex flex-col">
      <TakeoffScheduleView
        assemblies={filteredAssemblies}
        takeoffs={takeoffs}
        onAddInstance={addInstance}
        selectedAssemblyId={activeAssemblyId}
        onUpdateInstance={updateInstance}
        onDeleteInstance={deleteInstance}
      />
    </div>
  </div>
);
