'use client';

import { Database, Hammer, Layers } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shadcn/tabs';
import { MaterialDatabaseTab } from './MaterialDatabaseTab';
import { LabourDatabaseTab } from './LabourDatabaseTab';
import { AssemblyBunchTab } from './AssemblyBunchTab';

export function DatabasePage() {
  return (
    <Tabs defaultValue="materials" className="h-full flex flex-col overflow-hidden bg-slate-50">
      {/* Page header with inline tabs */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              Reference Databases
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Master reference data used by the estimation pipeline — read only
            </p>
          </div>
          <TabsList className="h-auto bg-slate-100 p-1 rounded-lg shrink-0 gap-0">
            <TabsTrigger
              value="materials"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              Materials
              <span className="ml-1 text-[10px] font-semibold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                1,213
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="labour"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <Hammer className="w-3.5 h-3.5" />
              Labour
              <span className="ml-1 text-[10px] font-semibold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                105
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="assembly-bunches"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              Assembly Bunches
              <span className="ml-1 text-[10px] font-semibold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                20
              </span>
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="materials" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
        <MaterialDatabaseTab />
      </TabsContent>
      <TabsContent value="labour" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
        <LabourDatabaseTab />
      </TabsContent>
      <TabsContent value="assembly-bunches" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
        <AssemblyBunchTab />
      </TabsContent>
    </Tabs>
  );
}
