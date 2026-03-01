'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
import { AggregatedTakeoff } from '@/types/takeoff';

interface TakeoffPreviewProps {
  data: AggregatedTakeoff[];
  fileName?: string;
}

export const TakeoffPreview: React.FC<TakeoffPreviewProps> = ({ data, fileName }) => {
  const [expandedAssemblies, setExpandedAssemblies] = useState<Set<string>>(
    new Set(data.map(d => d.assemblyCode)) // All expanded by default
  );

  const toggleAssembly = (code: string) => {
    setExpandedAssemblies(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const formatNumber = (n: number): string => {
    return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  };

  const totalAssemblies = data.length;
  const totalRows = data.reduce((sum, d) => d.heightVariants.reduce((s, v) => s + v.count, 0) + sum, 0);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 leading-none">Takeoff Preview</h3>
            {fileName && (
              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px]">{fileName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-lg font-bold text-emerald-600 leading-none tabular-nums">{totalRows}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide font-medium">rows parsed</p>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div className="text-right">
            <p className="text-lg font-bold text-slate-700 leading-none tabular-nums">{totalAssemblies}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide font-medium">assemblies</p>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-slate-50/70 border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        <div>Assembly</div>
        <div className="text-right">Linear Feet</div>
        <div className="text-right">Square Feet</div>
        <div className="text-right">Rows</div>
      </div>

      {/* Assembly list */}
      <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
        {data.map((assembly) => {
          const isExpanded = expandedAssemblies.has(assembly.assemblyCode);
          const assemblyRows = assembly.heightVariants.reduce((s, v) => s + v.count, 0);
          return (
            <div key={assembly.assemblyCode}>
              {/* Assembly header row */}
              <button
                onClick={() => toggleAssembly(assembly.assemblyCode)}
                className="w-full grid grid-cols-4 gap-2 px-4 py-3 hover:bg-slate-50 transition-colors text-left items-center"
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  }
                  <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-blue-100 text-blue-700 text-xs font-bold">
                    {assembly.assemblyCode}
                  </span>
                </div>
                <div className="text-right font-mono text-sm font-medium text-slate-700">
                  {formatNumber(assembly.totalLF)}
                  <span className="text-slate-400 text-xs font-normal ml-0.5">LF</span>
                </div>
                <div className="text-right font-mono text-sm font-medium text-slate-700">
                  {formatNumber(assembly.totalSF)}
                  <span className="text-slate-400 text-xs font-normal ml-0.5">SF</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    {assemblyRows}
                  </span>
                </div>
              </button>

              {/* Height variants */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {assembly.heightVariants.map((variant) => (
                    <div
                      key={variant.height}
                      className="grid grid-cols-4 gap-2 px-4 py-2.5 bg-slate-50/50 hover:bg-slate-100/40 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="pl-8 flex items-center">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                          <span className="text-xs font-medium text-slate-500">@ {variant.height}&apos;</span>
                        </span>
                      </div>
                      <div className="text-right font-mono text-xs text-slate-500">
                        {formatNumber(variant.totalLF)}{' '}
                        <span className="text-slate-400">LF</span>
                      </div>
                      <div className="text-right font-mono text-xs text-slate-500">
                        {formatNumber(variant.totalSF)}{' '}
                        <span className="text-slate-400">SF</span>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        {variant.count} row{variant.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
        <span className="text-slate-400">
          From <span className="font-medium text-slate-600">{fileName || 'Excel file'}</span>
        </span>
        <div className="flex items-center gap-4">
          <span>
            <strong className="text-slate-700 tabular-nums">{formatNumber(data.reduce((s, d) => s + d.totalLF, 0))}</strong>
            <span className="ml-1 text-slate-400">LF total</span>
          </span>
          <span className="w-px h-3 bg-slate-300 inline-block" />
          <span>
            <strong className="text-slate-700 tabular-nums">{formatNumber(data.reduce((s, d) => s + d.totalSF, 0))}</strong>
            <span className="ml-1 text-slate-400">SF total</span>
          </span>
        </div>
      </div>
    </div>
  );
};
