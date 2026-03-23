'use client';

import React, { useCallback, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight } from 'lucide-react';

import { Input } from '@/components/ui';
import { calcWeeksFromDates, calcMonthsFromDates, type ProjectInfo } from './types';

interface ProjectInfoPanelProps {
  info: ProjectInfo;
  onChange: (info: ProjectInfo) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FieldDef {
  key: keyof ProjectInfo;
  label: string;
  placeholder?: string;
  type?: string;
}

/** Compact labeled read-only display cell (for calculated values like Duration). */
function ReadOnlyCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-full">
      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </span>
      <div className="w-full h-[42px] flex items-center px-4 bg-emerald-100 border border-emerald-300 rounded-lg">
        <span className="text-sm font-bold text-emerald-800">{value || '—'}</span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectInfoPanel({ info, onChange }: ProjectInfoPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleField = useCallback(
    (field: keyof ProjectInfo, rawValue: string) => {
      const updated: ProjectInfo = { ...info, [field]: rawValue };

      // Auto-recalculate both duration values whenever either date changes
      if (field === 'startDate' || field === 'endDate') {
        const start = field === 'startDate' ? rawValue : info.startDate;
        const end   = field === 'endDate'   ? rawValue : info.endDate;
        updated.durationWeeks  = calcWeeksFromDates(start, end);
        updated.durationMonths = calcMonthsFromDates(start, end);
      }

      onChange(updated);
    },
    [info, onChange],
  );

  const field = (def: FieldDef) => (
    <Input
      key={String(def.key)}
      label={def.label}
      type={def.type ?? 'text'}
      value={String(info[def.key] ?? '')}
      onChange={(e) => handleField(def.key, e.target.value)}
      placeholder={def.placeholder}
    />
  );

  const weeksLabel  = info.durationWeeks  > 0 ? `${info.durationWeeks} wks`                           : '—';
  const monthsLabel = info.durationMonths > 0 ? `${info.durationMonths.toFixed(2)} mo` : '—';

  return (
    <div className="bg-white border border-slate-200 rounded-lg mb-6 overflow-hidden">
      {/* ── Header / toggle ── */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded
            ? <ChevronDown size={15} className="text-slate-400" />
            : <ChevronRight size={15} className="text-slate-400" />
          }
          <span className="text-sm font-bold text-slate-800">Project Information</span>
          {info.projectName && (
            <span className="text-xs text-slate-500 font-normal truncate max-w-xs">
              — {info.projectName}
            </span>
          )}
        </div>
        {info.durationWeeks > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded">
              {info.durationWeeks} wks
            </span>
            <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded">
              {info.durationMonths.toFixed(2)} mo
            </span>
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-5 border-t border-slate-100 space-y-3">
          {/* Row 1 */}
          <div className="grid grid-cols-4 gap-3 pt-3">
            {field({ key: 'proposalNumber', label: 'Proposal #',   placeholder: 'P-2024-001' })}
            {field({ key: 'projectName',    label: 'Project',       placeholder: 'Project name' })}
            {field({ key: 'client',         label: 'Client',        placeholder: 'Client name' })}
            {field({ key: 'competition',    label: 'Competition',   placeholder: 'Competitors' })}
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-4 gap-3">
            {field({ key: 'address',         label: 'Address',             placeholder: 'Site address' })}
            {field({ key: 'location',        label: 'Location',            placeholder: 'City / Region' })}
            {field({ key: 'buildingType',    label: 'Type of Building',    placeholder: 'e.g. Commercial' })}
            {field({ key: 'closingDateTime', label: 'Closing Date / Time', type: 'datetime-local' })}
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-4 gap-3">
            {field({ key: 'squareFootage',      label: 'Square Footage',       placeholder: '25000', type: 'number' })}
            {field({ key: 'ballParkValue',      label: 'Ball Park Value',      placeholder: '$2,500,000' })}
            {field({ key: 'workingHoursPerWeek', label: 'Working Hrs / Week',  placeholder: '40', type: 'number' })}
            {/* intentional empty column for visual balance */}
            <div />
          </div>

          {/* ── Duration band ── */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-1">
            <div className="flex items-center gap-1.5 mb-3">
              <Calendar size={13} className="text-emerald-600" />
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                Project Duration
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {field({ key: 'startDate', label: 'Start Date', type: 'date' })}
              {field({ key: 'endDate',   label: 'End Date',   type: 'date' })}
              <ReadOnlyCell label="Duration (Weeks)" value={weeksLabel} />
              <ReadOnlyCell label="Duration (Months)" value={monthsLabel} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
