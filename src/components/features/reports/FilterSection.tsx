'use client';

import React, { useMemo, useState } from 'react';
import { SearchInput } from '@/components/ui';

interface FilterSectionProps {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  placeholder?: string;
  listHeight?: string;
}

export const FilterSection = ({
  title,
  options,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  placeholder = 'Search...',
  listHeight = 'max-h-[140px]',
}: FilterSectionProps) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[10px] font-medium text-emerald-600 hover:text-emerald-700"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="text-[10px] font-medium text-slate-500 hover:text-slate-700"
          >
            Deselect All
          </button>
        </div>
      </div>
      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder={placeholder}
        showClear
        className="py-1.5 text-xs"
      />
      <div className={`${listHeight} overflow-y-auto border border-slate-200 rounded-lg bg-white`}>
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-400 text-center">
            No matches
          </div>
        ) : (
          <div className="p-1">
            {filtered.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt)}
                  onChange={() => onToggle(opt)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  aria-label={`Select ${opt}`}
                />
                <span className="text-xs text-slate-700 truncate" title={opt}>
                  {opt}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
