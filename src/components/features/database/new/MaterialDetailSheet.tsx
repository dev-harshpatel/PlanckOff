'use client';

import { Package, Code2, Layers, Ruler, FlaskConical, Link2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/shadcn/sheet';
import { Badge } from '@/components/shadcn/badge';
import { Separator } from '@/components/shadcn/separator';
import { ScrollArea } from '@/components/shadcn/scroll-area';
import type { MaterialDatabaseRow } from '@/types';

interface MaterialDetailSheetProps {
  material: MaterialDatabaseRow | null;
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

function FormulaBlock({ label, formula, uom }: { label: string; formula: string; uom: string }) {
  if (!formula) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-start gap-2">
        <code className="flex-1 text-[11px] font-mono bg-slate-900 text-emerald-300 px-3 py-2 rounded-md leading-relaxed break-all">
          {formula}
        </code>
        {uom && (
          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-1.5 rounded shrink-0">
            {uom}
          </span>
        )}
      </div>
    </div>
  );
}

export function MaterialDetailSheet({ material, onClose }: MaterialDetailSheetProps) {
  return (
    <Sheet open={!!material} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        {material && (
          <>
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 flex items-start gap-3 shrink-0">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 shrink-0 mt-0.5">
                <Package className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetHeader>
                  <SheetTitle className="text-white text-base leading-tight">
                    {material.description || material.code}
                  </SheetTitle>
                  <SheetDescription className="text-slate-400 text-xs mt-1">
                    <code className="font-mono bg-slate-700 text-emerald-300 px-1.5 py-0.5 rounded text-[11px] mr-2">
                      {material.code}
                    </code>
                    {material.category}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="success">{material.parentSection}</Badge>
                  {material.section && (
                    <Badge variant="outline" className="text-slate-300 border-slate-600 bg-transparent text-[10px]">
                      {material.section}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-4 space-y-5">

                {/* Identity */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Identity</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                    <DetailRow label="Code" value={material.code} />
                    <DetailRow label="Assembly Code" value={material.assemblyCode} />
                    <DetailRow label="Type" value={material.type} />
                    <DetailRow label="Category" value={material.category} />
                    <DetailRow label="Section" value={material.section} />
                    <DetailRow label="Parent Section" value={material.parentSection} />
                  </div>
                </div>

                {/* Pricing */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Pricing & Units</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                    <DetailRow label="Unit Price" value={material.unitPrice === 0 ? '—' : `$${material.unitPrice.toFixed(4)}`} />
                    <DetailRow label="Container Unit" value={material.containerUnit} />
                    <DetailRow label="Size" value={material.size} />
                    <DetailRow label="Size (numeric)" value={material.sizeNum || null} />
                    <DetailRow label="Size (mm)" value={material.sizeMm} />
                    <DetailRow label="Size (imperial)" value={material.sizeImperial} />
                  </div>
                </div>

                {/* Labour links */}
                {(material.wallLabourCode || material.ceilingLabourCode || material.bulkheadLabourCode) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Labour Links</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                      <DetailRow label="Wall Labour" value={material.wallLabourCode} />
                      <DetailRow label="Ceiling Labour" value={material.ceilingLabourCode} />
                      <DetailRow label="Bulkhead Labour" value={material.bulkheadLabourCode} />
                    </div>
                  </div>
                )}

                {/* Formulas */}
                {(material.qty1Formula || material.qty1FormulaCeiling) && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Formulas</p>
                    </div>
                    <div className="space-y-3">
                      {(material.qty1Formula || material.qty2Formula) && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-muted-foreground font-medium">Wall</p>
                          <FormulaBlock label="QTY 1" formula={material.qty1Formula} uom={material.uom1} />
                          <FormulaBlock label="QTY 2" formula={material.qty2Formula} uom={material.uom2} />
                        </div>
                      )}
                      {(material.qty1FormulaCeiling || material.qty2FormulaCeiling) && (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <p className="text-[10px] text-muted-foreground font-medium">Ceiling</p>
                            <FormulaBlock label="QTY 1" formula={material.qty1FormulaCeiling} uom={material.uom1Ceiling} />
                            <FormulaBlock label="QTY 2" formula={material.qty2FormulaCeiling} uom={material.uom2Ceiling} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {material.notes && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Notes</p>
                    </div>
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5 leading-relaxed">
                      {material.notes}
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
