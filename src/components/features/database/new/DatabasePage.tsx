'use client';

import { useState, useCallback } from 'react';
import { Database, Hammer, Layers, Upload, Plus, Trash2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shadcn/tabs';
import { MaterialDatabaseTab } from './MaterialDatabaseTab';
import { LabourDatabaseTab } from './LabourDatabaseTab';
import { AssemblyBunchTab } from './AssemblyBunchTab';
import { DatabaseUploadModal } from './DatabaseUploadModal';
import { ItemFormSheet } from './ItemFormSheet';
import { TrashSheet } from './TrashSheet';

type TabId = 'materials' | 'labour' | 'assembly-bunches';

const ADD_BUTTON_LABELS: Record<TabId, string> = {
  materials: 'Add Material',
  labour: 'Add Labour',
  'assembly-bunches': 'Add Assembly Item',
};

export function DatabasePage() {
  const [activeTab, setActiveTab] = useState<TabId>('materials');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Per-tab refresh keys — incremented individually after a single-item save
  const [tabKeys, setTabKeys] = useState<Record<TabId, number>>({
    materials: 0,
    labour: 0,
    'assembly-bunches': 0,
  });

  // Bulk import: refresh all tabs
  const handleImportSuccess = useCallback(() => {
    setTabKeys((prev) => ({
      materials: prev.materials + 1,
      labour: prev.labour + 1,
      'assembly-bunches': prev['assembly-bunches'] + 1,
    }));
  }, []);

  // Single-item add: refresh only the active tab
  function handleItemSaved() {
    setTabKeys((prev) => ({ ...prev, [activeTab]: prev[activeTab] + 1 }));
    setIsAddOpen(false);
  }

  return (
    <>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="h-full flex flex-col overflow-hidden bg-slate-50">
        {/* Page header with inline tabs */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                Reference Databases
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Master reference data used by the estimation pipeline
              </p>
            </div>

            <div className="flex items-center gap-3">
              <TabsList className="h-auto bg-slate-100 p-0.5 rounded-lg shrink-0 gap-0">
                <TabsTrigger
                  value="materials"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <Database className="w-3 h-3" />
                  Materials
                </TabsTrigger>
                <TabsTrigger
                  value="labour"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <Hammer className="w-3 h-3" />
                  Labour
                </TabsTrigger>
                <TabsTrigger
                  value="assembly-bunches"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <Layers className="w-3 h-3" />
                  Assembly Bunches
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsAddOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {ADD_BUTTON_LABELS[activeTab]}
                </button>
                <button
                  onClick={() => setUploadOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Data
                </button>
                <button
                  onClick={() => setIsTrashOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Trash
                </button>
              </div>
            </div>
          </div>
        </div>

        <TabsContent value="materials" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
          <MaterialDatabaseTab key={`materials-${tabKeys.materials}`} />
        </TabsContent>
        <TabsContent value="labour" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
          <LabourDatabaseTab key={`labour-${tabKeys.labour}`} />
        </TabsContent>
        <TabsContent value="assembly-bunches" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
          <AssemblyBunchTab key={`assembly-${tabKeys['assembly-bunches']}`} />
        </TabsContent>
      </Tabs>

      <ItemFormSheet
        activeTab={activeTab}
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSaved={handleItemSaved}
      />

      <DatabaseUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={handleImportSuccess}
      />

      <TrashSheet
        activeTab={activeTab}
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        onRestored={() => setTabKeys((prev) => ({ ...prev, [activeTab]: prev[activeTab] + 1 }))}
      />
    </>
  );
}
