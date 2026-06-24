'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, Database, Hammer, Layers } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/shadcn/sheet';
import { ScrollArea } from '@/components/shadcn/scroll-area';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Button } from '@/components/shadcn/button';
import type { MaterialDatabaseRow, LabourDatabaseRow, AssemblyBunchItem } from '@/types';

type TabId = 'materials' | 'labour' | 'assembly-bunches';

type TrashRow = MaterialDatabaseRow | LabourDatabaseRow | (AssemblyBunchItem & { branchCode: string; group: string });

interface TrashSheetProps {
  activeTab: TabId;
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
}

const ENDPOINT: Record<TabId, string> = {
  materials: 'material-database',
  labour: 'labour-database',
  'assembly-bunches': 'assembly-bunch-database',
};

const TAB_META: Record<TabId, { label: string; icon: React.ReactNode }> = {
  materials: { label: 'Materials Trash', icon: <Database className="w-4 h-4 text-emerald-400" /> },
  labour: { label: 'Labour Trash', icon: <Hammer className="w-4 h-4 text-blue-400" /> },
  'assembly-bunches': { label: 'Assembly Bunches Trash', icon: <Layers className="w-4 h-4 text-purple-400" /> },
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function daysLeft(deletedAt: string | null): number {
  if (!deletedAt) return 30;
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  return Math.max(0, Math.ceil((THIRTY_DAYS_MS - elapsed) / (24 * 60 * 60 * 1000)));
}

function rowTitle(tab: TabId, row: TrashRow): string {
  if (tab === 'materials') return (row as MaterialDatabaseRow).code;
  if (tab === 'labour') return (row as LabourDatabaseRow).labourBands[0]?.labourCode || (row as LabourDatabaseRow).category;
  return (row as AssemblyBunchItem).itemCode || (row as AssemblyBunchItem).assemblyCode;
}

function rowSubtitle(tab: TabId, row: TrashRow): string {
  if (tab === 'materials') return (row as MaterialDatabaseRow).description || (row as MaterialDatabaseRow).category;
  if (tab === 'labour') return (row as LabourDatabaseRow).description || (row as LabourDatabaseRow).category;
  const bunch = row as AssemblyBunchItem & { branchCode: string };
  return bunch.description || bunch.branchCode;
}

export function TrashSheet({ activeTab, isOpen, onClose, onRestored }: TrashSheetProps) {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const meta = TAB_META[activeTab];

  const load = useCallback(() => {
    setIsLoading(true);
    fetch(`/api/${ENDPOINT[activeTab]}?trash=true`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setRows(j.data ?? []); })
      .finally(() => setIsLoading(false));
  }, [activeTab]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  async function handleRestore(id: string) {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/${ENDPOINT[activeTab]}/${id}/restore`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setRows((prev) => prev.filter((r) => (r as { id: string }).id !== id));
        onRestored();
      }
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md" className="w-full flex flex-col p-0 gap-0">
        <div className="bg-slate-900 px-5 py-4 flex items-start gap-3 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20 shrink-0 mt-0.5">
            {meta.icon}
          </div>
          <SheetHeader className="flex-1 min-w-0">
            <SheetTitle className="text-white text-sm leading-tight">{meta.label}</SheetTitle>
            <SheetDescription className="text-slate-400 text-xs mt-0.5">
              Deleted rows are kept for 30 days, then removed automatically
            </SheetDescription>
          </SheetHeader>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Trash2 className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-400">Trash is empty</p>
              </div>
            ) : (
              rows.map((row) => {
                const id = (row as { id: string }).id;
                const left = daysLeft((row as { deletedAt: string | null }).deletedAt);
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-white"
                  >
                    <div className="min-w-0">
                      <code className="text-[11px] font-mono font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                        {rowTitle(activeTab, row) || '—'}
                      </code>
                      <p className="text-xs text-slate-500 truncate mt-1" title={rowSubtitle(activeTab, row)}>
                        {rowSubtitle(activeTab, row) || '—'}
                      </p>
                      <p className="text-[10px] text-amber-600 mt-1">
                        Auto-deletes in {left} day{left !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs shrink-0"
                      disabled={restoringId === id}
                      onClick={() => handleRestore(id)}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {restoringId === id ? 'Restoring…' : 'Restore'}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
