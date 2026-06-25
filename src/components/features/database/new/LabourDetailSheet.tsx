'use client';

import { HardHat, FlaskConical } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/shadcn/sheet';
import { Badge } from '@/components/shadcn/badge';
import { ScrollArea } from '@/components/shadcn/scroll-area';
import type { LabourDatabaseRow } from '@/types';

interface LabourDetailSheetProps {
  labour: LabourDatabaseRow | null;
  onClose: () => void;
}

const HT_BAND_COLOR: Record<string, 'default' | 'success' | 'warning' | 'info' | 'purple'> = {
  Standard: 'success',
  Medium: 'info',
  High: 'warning',
  'Very High': 'warning',
  'Extra High': 'purple',
  All: 'secondary' as 'default',
};

const SECTION_VARIANT: Record<string, 'success' | 'info' | 'warning'> = {
  Walls:    'success',
  Ceiling:  'info',
  Bulkhead: 'warning',
};

export function LabourDetailSheet({ labour, onClose }: LabourDetailSheetProps) {
  return (
    <Sheet open={!!labour} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="xl" className="w-full flex flex-col p-0 gap-0">
        {labour && (
          <>
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 flex items-start gap-3 shrink-0">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/20 border border-blue-500/30 shrink-0 mt-0.5">
                <HardHat className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetHeader>
                  <SheetTitle className="text-white text-base leading-tight">
                    {labour.description}
                  </SheetTitle>
                  <SheetDescription className="text-slate-400 text-xs mt-1">
                    <code className="font-mono bg-slate-700 text-emerald-300 px-1.5 py-0.5 rounded text-[11px] mr-2">
                      {labour.parentCode}
                    </code>
                    {labour.labourBands.length} band{labour.labourBands.length !== 1 ? 's' : ''}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant={SECTION_VARIANT[labour.parentSection] ?? 'outline'}>
                    {labour.parentSection}
                  </Badge>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-4 space-y-5">

                {/* Labour Bands table */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <HardHat className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Labour Bands</p>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Child Code</th>
                          <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">HT Band</th>
                          <th className="px-3 py-2 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Min Ft</th>
                          <th className="px-3 py-2 text-center font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Max Ft</th>
                          <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">UOM</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">Rate / UOM</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-background">
                        {labour.labourBands.map((band, idx) => (
                          <tr key={idx} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2">
                              <code className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                {band.labourCode}
                              </code>
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant={HT_BAND_COLOR[band.htBand] ?? 'outline'}
                                className="text-[10px] py-0"
                              >
                                {band.htBand || 'All'}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums text-foreground">
                              {band.htMinFt}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums text-foreground">
                              {band.htMaxFt < 99 ? band.htMaxFt : '∞'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{band.uom || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {band.ratePerUom
                                ? `$${band.ratePerUom.toFixed(4)}`
                                : <span className="text-muted-foreground">—</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Per-band descriptions */}
                {labour.labourBands.some((b) => b.description) && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">Band Descriptions</p>
                    <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                      {labour.labourBands.map((band, idx) => (
                        band.description ? (
                          <div key={idx} className="flex items-start justify-between gap-4 py-2">
                            <code className="text-[10px] font-mono text-slate-500 shrink-0">
                              {band.labourCode}
                            </code>
                            <span className="text-xs text-right text-foreground break-all">
                              {band.description}
                              {band.notes && (
                                <span className="ml-1.5 italic text-amber-600">({band.notes})</span>
                              )}
                            </span>
                          </div>
                        ) : null
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantity formulas — show if any band has one */}
                {labour.labourBands.some((b) => b.qty1Formula) && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Quantity Formulas</p>
                    </div>
                    <div className="space-y-2">
                      {labour.labourBands.map((band, idx) =>
                        band.qty1Formula ? (
                          <div key={idx} className="flex items-start gap-2">
                            <code className="text-[10px] font-mono text-slate-400 shrink-0 mt-0.5 w-28 truncate">
                              {band.labourCode}
                            </code>
                            <code className="flex-1 text-[11px] font-mono bg-slate-900 text-blue-300 px-2 py-1.5 rounded-md leading-relaxed break-all">
                              {band.qty1Formula}
                              {band.qty1Uom && (
                                <span className="text-slate-500 ml-2">→ {band.qty1Uom}</span>
                              )}
                            </code>
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>
                )}

              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
