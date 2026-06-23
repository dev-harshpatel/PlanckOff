'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronRight, ChevronDown, Layers, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Separator } from '@/components/shadcn/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table';
import { ScrollArea } from '@/components/shadcn/scroll-area';
import type { AssemblyBunchBranch } from '@/types';
import { cn } from '@/lib/cn';

const GROUP_COLORS: Record<string, string> = {
  Framing: 'bg-orange-100 text-orange-700 border-orange-200',
  Drywall: 'bg-blue-100 text-blue-700 border-blue-200',
  Sheathing: 'bg-purple-100 text-purple-700 border-purple-200',
  Insulation: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Ceiling Systems': 'bg-amber-100 text-amber-700 border-amber-200',
};

export function AssemblyBunchTab() {
  const [branches, setBranches] = useState<AssemblyBunchBranch[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/assembly-bunch-database?meta=groups')
      .then((r) => r.json())
      .then((j) => { if (j.success) setGroups(j.data); });
  }, []);

  const load = useCallback((q: string, g: string) => {
    setIsLoading(true);
    const params = new URLSearchParams({
      search: q,
      group: g === 'all' ? '' : g,
    });
    fetch(`/api/assembly-bunch-database?${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setBranches(j.data);
          // Auto-expand all when searching
          if (q.trim()) {
            setExpanded(new Set((j.data as AssemblyBunchBranch[]).map((b) => b.branchCode)));
          }
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(search, group), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, group, load]);

  const toggleBranch = (branchCode: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(branchCode)) next.delete(branchCode);
      else next.add(branchCode);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(branches.map((b) => b.branchCode)));
  const collapseAll = () => setExpanded(new Set());

  // Group branches by their group property
  const groupedBranches = branches.reduce<Record<string, AssemblyBunchBranch[]>>((acc, b) => {
    if (!acc[b.group]) acc[b.group] = [];
    acc[b.group].push(b);
    return acc;
  }, {});

  const totalItems = branches.reduce((sum, b) => sum + b.items.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search branch, item code, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={expandAll}
            className="text-[11px] text-emerald-600 hover:underline px-1"
          >
            Expand all
          </button>
          <span className="text-muted-foreground text-xs">·</span>
          <button
            onClick={collapseAll}
            className="text-[11px] text-slate-500 hover:underline px-1"
          >
            Collapse
          </button>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {isLoading ? 'Loading…' : `${branches.length} branches · ${totalItems} items`}
        </span>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">No branches found</p>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {Object.entries(groupedBranches).map(([grpName, grpBranches]) => (
              <div key={grpName}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">{grpName}</h3>
                  <Badge
                    className={cn('text-[10px] py-0 border', GROUP_COLORS[grpName] ?? 'bg-slate-100 text-slate-600 border-slate-200')}
                    variant="outline"
                  >
                    {grpBranches.length} branches
                  </Badge>
                </div>

                <div className="space-y-2">
                  {grpBranches.map((branch) => {
                    const isOpen = expanded.has(branch.branchCode);
                    return (
                      <div key={branch.branchCode} className="border border-border rounded-lg overflow-hidden">
                        {/* Branch header row */}
                        <button
                          onClick={() => toggleBranch(branch.branchCode)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
                        >
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          }
                          <code className="text-xs font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                            {branch.branchCode}
                          </code>
                          <span className="text-xs text-muted-foreground flex-1">
                            {branch.items.length} item{branch.items.length !== 1 ? 's' : ''}
                          </span>
                          <Badge
                            className={cn('text-[10px] py-0 border shrink-0', GROUP_COLORS[grpName] ?? 'bg-slate-100 text-slate-600 border-slate-200')}
                            variant="outline"
                          >
                            {grpName}
                          </Badge>
                        </button>

                        {/* Items table */}
                        {isOpen && (
                          <>
                            <Separator />
                            <div className="bg-slate-50/70 overflow-x-auto">
                              <Table className="w-max min-w-full">
                                <TableHeader className="sticky top-0 z-10">
                                  <TableRow className="bg-slate-100 hover:bg-slate-100">
                                    <TableHead className="text-[10px] min-w-8 text-center">#</TableHead>
                                    <TableHead className="text-[10px] min-w-36">Item Code</TableHead>
                                    <TableHead className="text-[10px] min-w-40">Assembly Code</TableHead>
                                    <TableHead className="text-[10px] min-w-48">Description</TableHead>
                                    <TableHead className="text-[10px] min-w-24">Size</TableHead>
                                    <TableHead className="text-[10px] min-w-16 text-center">Layers</TableHead>
                                    <TableHead className="text-[10px] min-w-36">Labour Code</TableHead>
                                    <TableHead className="text-[10px] min-w-20">Section</TableHead>
                                    <TableHead className="text-[10px] min-w-32">Note</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {branch.items.map((item, idx) => {
                                    const isPlaceholder = item.itemCode === 'XXXXXXX' || item.itemCode === '—';
                                    const isAssemblyPlaceholder = item.assemblyCode === 'XXXXXXX' || item.assemblyCode === '—';
                                    return (
                                      <TableRow key={idx} className="hover:bg-white/80 bg-white/40">
                                        <TableCell className="text-center text-[10px] text-muted-foreground tabular-nums">
                                          {item.sortOrder ?? idx + 1}
                                        </TableCell>
                                        <TableCell>
                                          {isPlaceholder ? (
                                            <span className="text-[10px] font-mono text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                              {item.itemCode}
                                            </span>
                                          ) : item.itemCode === '—' ? (
                                            <span className="text-[10px] text-muted-foreground">—</span>
                                          ) : (
                                            <code className="text-[10px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                                              {item.itemCode}
                                            </code>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {!item.assemblyCode || item.assemblyCode === '—' ? (
                                            <span className="text-[10px] text-muted-foreground">—</span>
                                          ) : isAssemblyPlaceholder ? (
                                            <span className="text-[10px] font-mono text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                              {item.assemblyCode}
                                            </span>
                                          ) : (
                                            <code className="text-[10px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                              {item.assemblyCode}
                                            </code>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <span className="text-xs truncate block max-w-48" title={item.description}>
                                            {item.description || '—'}
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          <span className="text-xs text-muted-foreground">{item.size || '—'}</span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                          {item.layers != null ? (
                                            <Badge variant="secondary" className="text-[10px] py-0 tabular-nums">
                                              {item.layers}
                                            </Badge>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">—</span>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {item.labourCode ? (
                                            <code className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                              {item.labourCode}
                                            </code>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">—</span>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <span className="text-xs text-muted-foreground">{item.section || '—'}</span>
                                        </TableCell>
                                        <TableCell>
                                          <span className="text-[10px] text-muted-foreground italic">
                                            {item.note || '—'}
                                          </span>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
