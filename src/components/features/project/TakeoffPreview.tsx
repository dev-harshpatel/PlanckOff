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
  const totalVariants = data.reduce((sum, d) => sum + d.heightVariants.length, 0);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-800">Takeoff Preview</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><strong className="text-slate-700">{totalAssemblies}</strong> assemblies</span>
          <span className="text-slate-300">|</span>
          <span><strong className="text-slate-700">{totalVariants}</strong> height variants</span>
        </div>
      </div>

      {/* Assembly list */}
      <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
        {data.map((assembly) => {
          const isExpanded = expandedAssemblies.has(assembly.assemblyCode);
          return (
            <div key={assembly.assemblyCode}>
              {/* Assembly header row */}
              <button
                onClick={() => toggleAssembly(assembly.assemblyCode)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                {isExpanded
                  ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                }
                <span className="inline-flex items-center justify-center w-10 h-6 rounded bg-blue-100 text-blue-700 text-xs font-bold flex-shrink-0">
                  {assembly.assemblyCode}
                </span>
                <div className="flex-1 flex items-center gap-4 text-xs text-slate-500">
                  <span>{assembly.heightVariants.length} height{assembly.heightVariants.length !== 1 ? 's' : ''}</span>
                  <span className="text-slate-300">|</span>
                  <span>{formatNumber(assembly.totalLF)} LF total</span>
                  <span className="text-slate-300">|</span>
                  <span>{formatNumber(assembly.totalSF)} SF total</span>
                </div>
              </button>

              {/* Height variants */}
              {isExpanded && (
                <div className="bg-slate-50/50 border-t border-slate-100">
                  {/* Table header */}
                  <div className="grid grid-cols-4 gap-2 px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <div className="pl-10">Height</div>
                    <div className="text-right">Linear Feet</div>
                    <div className="text-right">Square Feet</div>
                    <div className="text-right">Entries</div>
                  </div>

                  {assembly.heightVariants.map((variant) => (
                    <div
                      key={variant.height}
                      className="grid grid-cols-4 gap-2 px-4 py-2.5 text-sm hover:bg-slate-100/50 transition-colors"
                    >
                      <div className="pl-10">
                        <span className="font-medium text-slate-700">
                          Wall @ {variant.height}&apos;
                        </span>
                      </div>
                      <div className="text-right font-mono text-slate-600">
                        {formatNumber(variant.totalLF)} <span className="text-slate-400 text-xs">LF</span>
                      </div>
                      <div className="text-right font-mono text-slate-600">
                        {formatNumber(variant.totalSF)} <span className="text-slate-400 text-xs">SF</span>
                      </div>
                      <div className="text-right text-slate-400 text-xs">
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
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <span>
          Parsed from <span className="font-medium text-slate-700">{fileName || 'Excel file'}</span>
        </span>
        <div className="flex items-center gap-3">
          <span>Total: <strong className="text-slate-700">{formatNumber(data.reduce((s, d) => s + d.totalLF, 0))} LF</strong></span>
          <span className="text-slate-300">|</span>
          <span>Total: <strong className="text-slate-700">{formatNumber(data.reduce((s, d) => s + d.totalSF, 0))} SF</strong></span>
        </div>
      </div>
    </div>
  );
};
