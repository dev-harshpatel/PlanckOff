'use client';

import { HardHat, FlaskConical, Ruler } from 'lucide-react';
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

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = value !== null && value !== undefined && value !== '' ? String(value) : '—';
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs text-muted-foreground shrink-0 w-36">{label}</span>
      <span className="text-xs text-right font-medium text-foreground break-all">{display}</span>
    </div>
  );
}

const HT_BAND_COLOR: Record<string, 'default' | 'success' | 'warning' | 'info' | 'purple'> = {
  Standard: 'success',
  Medium: 'info',
  High: 'warning',
  'Very High': 'warning',
  'Extra High': 'purple',
  All: 'secondary' as 'default',
};

export function LabourDetailSheet({ labour, onClose }: LabourDetailSheetProps) {
  const band = labour?.labourBands[0];

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
                    <code className="font-mono bg-slate-700 text-blue-300 px-1.5 py-0.5 rounded text-[11px] mr-2">
                      {band?.labourCode}
                    </code>
                    {labour.category}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="info">{labour.parentSection}</Badge>
                  <Badge variant={HT_BAND_COLOR[band?.htBand ?? 'All'] ?? 'outline'}>
                    {band?.htBand || 'All Heights'}
                  </Badge>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-4 space-y-5">

                {/* Identity */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Details</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                    <DetailRow label="Labour Code" value={band?.labourCode} />
                    <DetailRow label="Band Code" value={band?.code} />
                    <DetailRow label="Category" value={labour.category} />
                    <DetailRow label="Section" value={labour.parentSection} />
                    <DetailRow label="Height Band" value={band?.htBand || 'All'} />
                    <DetailRow label="Min Height (ft)" value={band?.htMinFt} />
                    <DetailRow label="Max Height (ft)" value={band && band.htMaxFt < 99 ? band.htMaxFt : '—'} />
                  </div>
                </div>

                {/* Rate */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <HardHat className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Rate</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                    <DetailRow
                      label="Rate per UOM"
                      value={!band?.ratePerUom ? '—' : `$${band.ratePerUom.toFixed(4)}`}
                    />
                    <DetailRow label="UOM" value={band?.uom} />
                  </div>
                </div>

                {/* Formula */}
                {labour.qty1Formula && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Quantity Formula</p>
                    </div>
                    <div className="space-y-2">
                      <code className="block text-[11px] font-mono bg-slate-900 text-blue-300 px-3 py-2.5 rounded-md leading-relaxed break-all">
                        {labour.qty1Formula}
                      </code>
                      {labour.qty1Uom && (
                        <p className="text-[10px] text-muted-foreground">
                          Output UOM: <span className="font-semibold text-foreground">{labour.qty1Uom}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {labour.notes && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">Notes</p>
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5 leading-relaxed">
                      {labour.notes}
                    </p>
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
