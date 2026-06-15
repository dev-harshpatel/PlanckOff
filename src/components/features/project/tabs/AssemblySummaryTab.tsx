'use client';

import React from 'react';
import { Database, Layers, LayoutTemplate, Plus, Upload } from 'lucide-react';
import type { MaterialDefinition, TakeoffInstance, WallAssembly } from '@/types';
import type { AssemblyTemplate } from '@/constants/defaultAssemblies';
import type { PipelineCompleteData } from '@/context/PipelineContext';
import { AssemblySummaryGrid } from '@/components/features/project/AssemblySummaryGrid';
import { IconButton, SearchInput } from '@/components/ui';

interface AssemblySummaryTabProps {
  sidebarWidth: number;
  templateMenuRef: React.RefObject<HTMLDivElement | null>;
  isTemplateMenuOpen: boolean;
  setIsTemplateMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  templates: AssemblyTemplate[];
  handleAddFromTemplate: (template: AssemblyTemplate) => void;
  setIsDatabaseOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openImportModal: (projectId: string | undefined, onComplete?: (data: PipelineCompleteData) => void) => void;
  projectId?: string | null;
  handleImportComplete: (data: PipelineCompleteData) => void;
  handleAddAssembly: () => void;
  assemblySearch: string;
  setAssemblySearch: React.Dispatch<React.SetStateAction<string>>;
  filteredAssemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
  resolvedMaterials: MaterialDefinition[];
  priceMap: Record<string, { cost: number; per?: string; waste?: number; supplier?: string }>;
  setActiveAssemblyId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditingAssemblyId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditingHeight: React.Dispatch<React.SetStateAction<number | null>>;
  activeAssemblyId: string | null;
  deleteAssembly: (id: string) => void;
}

export const AssemblySummaryTab = ({
  sidebarWidth,
  templateMenuRef,
  isTemplateMenuOpen,
  setIsTemplateMenuOpen,
  templates,
  handleAddFromTemplate,
  setIsDatabaseOpen,
  openImportModal,
  projectId,
  handleImportComplete,
  handleAddAssembly,
  assemblySearch,
  setAssemblySearch,
  filteredAssemblies,
  takeoffs,
  resolvedMaterials,
  priceMap,
  setActiveAssemblyId,
  setEditingAssemblyId,
  setEditingHeight,
  activeAssemblyId,
  deleteAssembly,
}: AssemblySummaryTabProps) => (
  <div
    style={{ width: `${sidebarWidth}%` }}
    className={`h-full flex flex-col border-r border-slate-200 bg-white relative shrink-0 ${sidebarWidth === 0 ? 'overflow-hidden' : ''}`}
  >
    {sidebarWidth > 0 && (
      <>
        <div className="p-5 border-b border-slate-200 bg-white sticky top-0 z-20 shadow-[0_4px_20px_-12px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate tracking-tight">
              <Layers className="w-5 h-5 text-blue-600 shrink-0" />
              {sidebarWidth > 20 && 'Wall Assemblies'}
            </h2>
            <div className="flex gap-1.5">
              <div className="relative" ref={templateMenuRef as React.RefObject<HTMLDivElement>}>
                <IconButton
                  icon={LayoutTemplate}
                  variant="default"
                  onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                  tooltip="Add from Template"
                />
                {isTemplateMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Select Template
                    </div>
                    <div className="max-h-[360px] overflow-y-auto">
                      {templates.map((template, index) => (
                        <button
                          key={index}
                          onClick={() => handleAddFromTemplate(template)}
                          className="group w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0 relative"
                          title={template.description}
                        >
                          <div className="text-sm font-semibold text-slate-800 leading-tight">
                            {template.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 line-clamp-2 group-hover:line-clamp-none transition-all">
                            {template.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <IconButton
                icon={Database}
                variant="default"
                onClick={() => setIsDatabaseOpen(true)}
                tooltip="Database"
              />
              <IconButton
                icon={Upload}
                variant="default"
                onClick={() => openImportModal(projectId ?? undefined, handleImportComplete)}
                tooltip="Import Files"
              />
              <IconButton
                icon={Plus}
                variant="primary"
                onClick={handleAddAssembly}
                tooltip="Create Assembly"
              />
            </div>
          </div>
          <SearchInput
            value={assemblySearch}
            onValueChange={setAssemblySearch}
            placeholder={sidebarWidth > 25 ? 'Search assemblies...' : ''}
          />
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col">
          <AssemblySummaryGrid
            assemblies={filteredAssemblies}
            takeoffs={takeoffs}
            materials={resolvedMaterials}
            priceMap={priceMap}
            onSelectAssembly={(id, height) => {
              setActiveAssemblyId(id);
              setEditingAssemblyId(id);
              setEditingHeight(height ?? null);
            }}
            onEditAssembly={(id, height) => {
              setEditingAssemblyId(id);
              setEditingHeight(height ?? null);
            }}
            selectedAssemblyId={activeAssemblyId}
            onDeleteAssembly={deleteAssembly}
          />
        </div>
      </>
    )}
  </div>
);
