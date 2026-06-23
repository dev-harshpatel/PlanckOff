'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';
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
import { LabourDetailSheet } from './LabourDetailSheet';
import type { LabourDatabaseRow } from '@/types';
import { cn } from '@/lib/cn';

const HT_BANDS = ['All', 'Standard', 'Medium', 'High', 'Very High', 'Extra High'];
const COL_COUNT = 14;

// ─── Badge variant maps ────────────────────────────────────────────────────────

const HT_BAND_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'purple' | 'secondary'> = {
  Standard:    'success',
  Medium:      'info',
  High:        'warning',
  'Very High': 'warning',
  'Extra High':'purple',
  All:         'secondary',
};

const SECTION_VARIANT: Record<string, 'success' | 'info' | 'warning'> = {
  Walls:    'success',
  Ceiling:  'info',
  Bulkhead: 'warning',
};

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function CodeChip({ value, color = 'slate' }: { value: string; color?: 'slate' | 'blue' | 'emerald' }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const cls: Record<string, string> = {
    slate:   'text-slate-700 bg-slate-100',
    blue:    'text-blue-700 bg-blue-50',
    emerald: 'text-emerald-700 bg-emerald-50',
  };
  return (
    <code className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap', cls[color])}>
      {value}
    </code>
  );
}

function FormulaCell({ formula, uom }: { formula: string; uom: string }) {
  if (!formula) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <code
        className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded truncate max-w-[200px]"
        title={formula}
      >
        {formula}
      </code>
      {uom && (
        <span className="text-[10px] text-muted-foreground shrink-0 font-medium">{uom}</span>
      )}
    </span>
  );
}

function RateCell({ value }: { value: number }) {
  if (!value || value === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="text-xs tabular-nums font-medium">
      <span className="text-muted-foreground text-[10px] mr-0.5">$</span>
      {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

function TextCell({ value, className }: { value: string | number | null | undefined; className?: string }) {
  if (value == null || value === '' || value === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return <span className={cn('text-xs', className)}>{value}</span>;
}

// ─── Column definitions — ordered exactly as the source sheet ─────────────────

const COLUMNS: { label: string; minWidth: number }[] = [
  { label: 'Row #',          minWidth: 48  },  // display index
  { label: 'Parent Section', minWidth: 104 },  // computed grouping column, shown first
  { label: 'Labour Code',    minWidth: 152 },  // LABOUR_CODE
  { label: 'Code',           minWidth: 64  },  // CODE (band short code: STD, HI…)
  { label: 'Description',    minWidth: 240 },  // DESCRIPTION
  { label: 'Category',       minWidth: 200 },  // CATEGORY
  { label: 'HT Band',        minWidth: 112 },  // HT_BAND
  { label: 'HT Min Ft',      minWidth: 80  },  // HT_MIN_FT
  { label: 'HT Max Ft',      minWidth: 80  },  // HT_MAX_FT
  { label: 'UOM',            minWidth: 64  },  // UOM
  { label: 'Rate Per UOM',   minWidth: 104 },  // RATE_PER_UOM
  { label: 'QTY1 Formula',   minWidth: 248 },  // QTY1_FORMULA + QTY1_UOM inline
  { label: 'QTY1 UOM',       minWidth: 80  },  // QTY1_UOM
  { label: 'Notes',          minWidth: 160 },  // NOTES
];

// ─── Component ────────────────────────────────────────────────────────────────

export function LabourDatabaseTab() {
  const [rows, setRows] = useState<LabourDatabaseRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [parentSection, setParentSection] = useState('all');
  const [htBand, setHtBand] = useState('all');
  const [selected, setSelected] = useState<LabourDatabaseRow | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/labour-database?meta=categories')
      .then((r) => r.json())
      .then((j) => { if (j.success) setCategories(j.data); });
  }, []);

  const load = useCallback((q: string, cat: string, sec: string, band: string) => {
    setIsLoading(true);
    const params = new URLSearchParams({
      search: q,
      category: cat === 'all' ? '' : cat,
      parentSection: sec === 'all' ? '' : sec,
      htBand: band === 'all' ? '' : band,
    });
    fetch(`/api/labour-database?${params}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setRows(j.data); })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(search, category, parentSection, htBand), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, category, parentSection, htBand, load]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search labour code, description, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={parentSection} onValueChange={setParentSection}>
            <SelectTrigger className="h-8 text-xs w-28">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              <SelectItem value="Walls">Walls</SelectItem>
              <SelectItem value="Ceiling">Ceiling</SelectItem>
              <SelectItem value="Bulkhead">Bulkhead</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={htBand} onValueChange={setHtBand}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue placeholder="HT Band" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Heights</SelectItem>
              {HT_BANDS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {isLoading ? 'Loading…' : `${rows.length} item${rows.length !== 1 ? 's' : ''}`}
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
              ? Array.from({ length: 12 }).map((_, i) => (
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
                      No labour items found
                    </TableCell>
                  </TableRow>
                )
              : rows.map((row, i) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'cursor-pointer hover:bg-slate-50',
                      selected?.id === row.id && 'bg-blue-50 hover:bg-blue-50',
                    )}
                    onClick={() => setSelected(row)}
                  >
                    {/* Row # */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    </TableCell>

                    {/* Parent Section (computed grouping) */}
                    <TableCell className="border-r border-slate-100">
                      <Badge
                        variant={SECTION_VARIANT[row.parentSection] ?? 'outline'}
                        className="text-[10px] py-0 whitespace-nowrap"
                      >
                        {row.parentSection || '—'}
                      </Badge>
                    </TableCell>

                    {/* LABOUR_CODE */}
                    <TableCell className="border-r border-slate-100">
                      <CodeChip value={row.labourCode} color="slate" />
                    </TableCell>

                    {/* CODE (band short code: STD, HI, VHI…) */}
                    <TableCell className="border-r border-slate-100">
                      <CodeChip value={row.code} color="blue" />
                    </TableCell>

                    {/* DESCRIPTION */}
                    <TableCell className="border-r border-slate-100 max-w-60">
                      <span className="text-xs truncate block" title={row.description}>
                        {row.description || '—'}
                      </span>
                    </TableCell>

                    {/* CATEGORY */}
                    <TableCell className="border-r border-slate-100 max-w-52">
                      <span className="text-xs truncate block text-muted-foreground" title={row.category}>
                        {row.category || '—'}
                      </span>
                    </TableCell>

                    {/* HT_BAND */}
                    <TableCell className="border-r border-slate-100">
                      <Badge
                        variant={HT_BAND_VARIANT[row.htBand] ?? 'outline'}
                        className="text-[10px] py-0 whitespace-nowrap"
                      >
                        {row.htBand || 'All'}
                      </Badge>
                    </TableCell>

                    {/* HT_MIN_FT */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell value={row.htMinFt} className="tabular-nums" />
                    </TableCell>

                    {/* HT_MAX_FT */}
                    <TableCell className="border-r border-slate-100 text-center">
                      <TextCell
                        value={row.htMaxFt && row.htMaxFt < 99 ? row.htMaxFt : null}
                        className="tabular-nums"
                      />
                    </TableCell>

                    {/* UOM */}
                    <TableCell className="border-r border-slate-100">
                      <TextCell value={row.uom} className="text-muted-foreground" />
                    </TableCell>

                    {/* RATE_PER_UOM */}
                    <TableCell className="border-r border-slate-100">
                      <RateCell value={row.ratePerUom} />
                    </TableCell>

                    {/* QTY1_FORMULA */}
                    <TableCell className="border-r border-slate-100">
                      <FormulaCell formula={row.qty1Formula} uom="" />
                    </TableCell>

                    {/* QTY1_UOM */}
                    <TableCell className="border-r border-slate-100">
                      <TextCell value={row.qty1Uom} className="text-muted-foreground" />
                    </TableCell>

                    {/* NOTES */}
                    <TableCell>
                      <span className="text-xs truncate block text-muted-foreground italic" title={row.notes}>
                        {row.notes || '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      <LabourDetailSheet labour={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
