'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/shadcn/input';
import { Button } from '@/components/shadcn/button';
import { Skeleton } from '@/components/shadcn/skeleton';
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
import { MaterialDetailSheet } from './MaterialDetailSheet';
import type { MaterialDatabaseRow, PaginatedResponse } from '@/types';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 50;
const COL_COUNT = 26;

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function CodeChip({ value, color = 'slate' }: { value: string; color?: 'slate' | 'blue' | 'emerald' | 'purple' }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const cls: Record<string, string> = {
    slate:   'text-slate-700 bg-slate-100',
    blue:    'text-blue-700 bg-blue-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    purple:  'text-purple-700 bg-purple-50',
  };
  return (
    <code className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap', cls[color])}>
      {value}
    </code>
  );
}

function FormulaCell({ formula }: { formula: string }) {
  if (!formula) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <code
      className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded truncate block max-w-[220px]"
      title={formula}
    >
      {formula}
    </code>
  );
}

function PriceCell({ value }: { value: number }) {
  if (value === 0 || value == null) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="text-xs tabular-nums font-medium">
      <span className="text-muted-foreground text-[10px] mr-0.5">$</span>
      {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

function KeywordsCell({ keywords }: { keywords: string[] }) {
  if (!keywords?.length) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="flex flex-wrap gap-0.5">
      {keywords.map((k) => (
        <span
          key={k}
          className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono"
        >
          {k}
        </span>
      ))}
    </span>
  );
}

function TextCell({ value, className }: { value: string | number | null | undefined; className?: string }) {
  if (value == null || value === '') return <span className="text-muted-foreground text-xs">—</span>;
  return <span className={cn('text-xs', className)}>{value}</span>;
}

// ─── Column definitions — ordered exactly as the source sheet ─────────────────

const COLUMNS: { label: string; minWidth: number }[] = [
  { label: 'Row #',            minWidth: 48  },
  { label: 'Category',         minWidth: 96  },
  { label: 'Assembly Code',    minWidth: 148 },
  { label: 'Code',             minWidth: 120 },
  { label: 'Wall Labour',      minWidth: 128 },
  { label: 'Ceiling Labour',   minWidth: 128 },
  { label: 'Bulkhead Labour',  minWidth: 128 },
  { label: 'Type',             minWidth: 88  },
  { label: 'Description',      minWidth: 220 },
  { label: 'Section',          minWidth: 88  },
  { label: 'Size',             minWidth: 72  },
  { label: 'Size Num',         minWidth: 72  },
  { label: 'Unit Price',       minWidth: 88  },
  { label: 'Container',        minWidth: 88  },
  { label: 'QTY1 Formula',     minWidth: 248 },
  { label: 'UOM1',             minWidth: 64  },
  { label: 'QTY2 Formula',     minWidth: 248 },
  { label: 'UOM2',             minWidth: 64  },
  { label: 'QTY1 Ceiling',     minWidth: 248 },
  { label: 'UOM1 Ceiling',     minWidth: 80  },
  { label: 'QTY2 Ceiling',     minWidth: 248 },
  { label: 'UOM2 Ceiling',     minWidth: 80  },
  { label: 'Notes',            minWidth: 160 },
  { label: 'Keywords',         minWidth: 180 },
  { label: 'Size MM',          minWidth: 72  },
  { label: 'Size Imperial',    minWidth: 88  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MaterialDatabaseTab() {
  const [result, setResult] = useState<PaginatedResponse<MaterialDatabaseRow> | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MaterialDatabaseRow | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/material-database?meta=categories')
      .then((r) => r.json())
      .then((j) => { if (j.success) setCategories(j.data); });
  }, []);

  const load = useCallback(
    (p: number, q: string, cat: string) => {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        search: q,
        category: cat === 'all' ? '' : cat,
      });
      fetch(`/api/material-database?${params}`)
        .then((r) => r.json())
        .then((j) => { if (j.success) setResult(j.data); })
        .finally(() => setIsLoading(false));
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(1, search, category);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, category, load]);

  useEffect(() => {
    load(page, search, category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search code, description, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {isLoading ? 'Loading…' : `${from}–${to} of ${total.toLocaleString()}`}
        </span>
      </div>

      {/* Table — horizontally scrollable, every column at its natural width */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <Table className="w-max min-w-full border-collapse">
          <TableHeader className="sticky top-0 bg-slate-50 z-10">
            <TableRow>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.label}
                  className="text-xs whitespace-nowrap border-r border-slate-200 last:border-r-0"
                  style={{ minWidth: col.minWidth }}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading
              ? Array.from({ length: 15 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: COL_COUNT }).map((__, j) => (
                      <TableCell key={j} className="border-r border-slate-100 last:border-r-0">
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.length === 0
              ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="text-center py-16 text-muted-foreground text-sm">
                      No materials found
                    </TableCell>
                  </TableRow>
                )
              : rows.flatMap((row, i) => {
                  const isNewSection = row.parentSection !== rows[i - 1]?.parentSection;
                  const sectionRow = isNewSection ? (
                    <TableRow key={`section-${row.parentSection ?? 'unknown'}-${i}`} className="bg-emerald-50 hover:bg-emerald-50 cursor-default">
                      <TableCell colSpan={COL_COUNT} className="py-1.5 px-0 border-t border-emerald-200">
                        <div className="flex items-center gap-2 px-3">
                          <div className="w-1 h-3.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">
                            {row.parentSection || 'Unknown'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null;

                  const dataRow = (
                  <TableRow
                    key={`${row.code}-${i}`}
                    className={cn(
                      'cursor-pointer hover:bg-slate-50',
                      selected?.code === row.code && 'bg-emerald-50 hover:bg-emerald-50',
                    )}
                    onClick={() => setSelected(row)}
                  >
                    {/* Row # */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell value={row.rowNum} className="text-muted-foreground tabular-nums" />
                    </TableCell>

                    {/* Category */}
                    <TableCell className="border-r border-slate-100">
                      <TextCell value={row.category} className="text-muted-foreground" />
                    </TableCell>

                    {/* Assembly Code */}
                    <TableCell className="border-r border-slate-100">
                      <CodeChip value={row.assemblyCode} color="slate" />
                    </TableCell>

                    {/* Code */}
                    <TableCell className="border-r border-slate-100">
                      <CodeChip value={row.code} color="slate" />
                    </TableCell>

                    {/* Wall Labour */}
                    <TableCell className="border-r border-slate-100">
                      <CodeChip value={row.wallLabourCode} color="blue" />
                    </TableCell>

                    {/* Ceiling Labour */}
                    <TableCell className="border-r border-slate-100">
                      <CodeChip value={row.ceilingLabourCode} color="emerald" />
                    </TableCell>

                    {/* Bulkhead Labour */}
                    <TableCell className="border-r border-slate-100">
                      <CodeChip value={row.bulkheadLabourCode} color="purple" />
                    </TableCell>

                    {/* Type */}
                    <TableCell className="border-r border-slate-100">
                      <TextCell value={row.type} />
                    </TableCell>

                    {/* Description */}
                    <TableCell className="border-r border-slate-100 max-w-56">
                      <span className="text-xs truncate block" title={row.description}>
                        {row.description || '—'}
                      </span>
                    </TableCell>

                    {/* Section (CSI code e.g. "09 22 16") */}
                    <TableCell className="border-r border-slate-100">
                      <code className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {row.section || '—'}
                      </code>
                    </TableCell>

                    {/* Size */}
                    <TableCell className="border-r border-slate-100">
                      <TextCell value={row.size} className="text-muted-foreground" />
                    </TableCell>

                    {/* Size Num */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell value={row.sizeNum || null} className="tabular-nums text-muted-foreground" />
                    </TableCell>

                    {/* Unit Price */}
                    <TableCell className="border-r border-slate-100">
                      <PriceCell value={row.unitPrice} />
                    </TableCell>

                    {/* Container Unit */}
                    <TableCell className="border-r border-slate-100">
                      <TextCell value={row.containerUnit} className="text-muted-foreground" />
                    </TableCell>

                    {/* QTY1 Formula (wall) */}
                    <TableCell className="border-r border-slate-100">
                      <FormulaCell formula={row.qty1Formula} />
                    </TableCell>

                    {/* UOM1 (wall) */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell value={row.uom1} className="text-muted-foreground font-medium" />
                    </TableCell>

                    {/* QTY2 Formula (wall) */}
                    <TableCell className="border-r border-slate-100">
                      <FormulaCell formula={row.qty2Formula} />
                    </TableCell>

                    {/* UOM2 (wall) */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell value={row.uom2} className="text-muted-foreground font-medium" />
                    </TableCell>

                    {/* QTY1 Formula (ceiling) */}
                    <TableCell className="border-r border-slate-100">
                      <FormulaCell formula={row.qty1FormulaCeiling} />
                    </TableCell>

                    {/* UOM1 Ceiling */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell value={row.uom1Ceiling} className="text-muted-foreground font-medium" />
                    </TableCell>

                    {/* QTY2 Formula (ceiling) */}
                    <TableCell className="border-r border-slate-100">
                      <FormulaCell formula={row.qty2FormulaCeiling} />
                    </TableCell>

                    {/* UOM2 Ceiling */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell value={row.uom2Ceiling} className="text-muted-foreground font-medium" />
                    </TableCell>

                    {/* Notes */}
                    <TableCell className="border-r border-slate-100 max-w-40">
                      <span className="text-xs truncate block text-muted-foreground" title={row.notes}>
                        {row.notes || '—'}
                      </span>
                    </TableCell>

                    {/* Keywords */}
                    <TableCell className="border-r border-slate-100">
                      <KeywordsCell keywords={row.searchKeywords} />
                    </TableCell>

                    {/* Size MM */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell value={row.sizeMm} className="tabular-nums text-muted-foreground" />
                    </TableCell>

                    {/* Size Imperial */}
                    <TableCell>
                      <TextCell value={row.sizeImperial} className="tabular-nums text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                  );

                  return sectionRow ? [sectionRow, dataRow] : [dataRow];
                })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t bg-white shrink-0">
        <p className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{from}–{to}</span> of{' '}
          <span className="font-medium text-foreground">{total.toLocaleString()}</span> materials
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isLoading}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <MaterialDetailSheet material={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
