'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { Button, Modal, ModalBody, ModalFooter } from '@/components/ui';
import { FilterSection } from '@/components/features/reports/FilterSection';

export const BREAKDOWN_TYPES = [
  'Trade Breakdown',
  'Floor Wise Breakdown',
  'Interior and Exterior Envelop',
] as const;

export type BreakdownType = (typeof BREAKDOWN_TYPES)[number];

export interface MarkupFilterState {
  selectedBreakdownTypes: Set<BreakdownType>;
  selectedLevels: Set<string>;
}

interface MarkupFilterDropdownProps {
  availableLevels: string[];
  filterState: MarkupFilterState;
  onFilterChange: (state: MarkupFilterState) => void;
}

export const MarkupFilterDropdown = ({
  availableLevels,
  filterState,
  onFilterChange,
}: MarkupFilterDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filterState.selectedBreakdownTypes.size > 0) n++;
    if (filterState.selectedLevels.size > 0) n++;
    return n;
  }, [filterState]);

  const updateFilter = useCallback(
    (key: keyof MarkupFilterState, value: Set<string> | Set<BreakdownType>) => {
      onFilterChange({ ...filterState, [key]: value });
    },
    [filterState, onFilterChange]
  );

  const handleBreakdownToggle = useCallback(
    (value: BreakdownType) => {
      const next = new Set(filterState.selectedBreakdownTypes);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      updateFilter('selectedBreakdownTypes', next);
    },
    [filterState.selectedBreakdownTypes, updateFilter]
  );

  const handleLevelToggle = useCallback(
    (level: string) => {
      const next = new Set(filterState.selectedLevels);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      updateFilter('selectedLevels', next);
    },
    [filterState.selectedLevels, updateFilter]
  );

  const handleClearAllFilters = useCallback(() => {
    onFilterChange({
      selectedBreakdownTypes: new Set(),
      selectedLevels: new Set(),
    });
  }, [onFilterChange]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={Filter}
        iconPosition="left"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label="Open filters"
      >
        <span className="flex items-center gap-1.5">
          Filter
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </span>
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Markup Filters"
        size="2xl"
        closeOnOverlayClick
      >
        <ModalBody className="max-h-[75vh] overflow-y-auto">
          <p className="text-sm text-slate-500 mb-5">
            Select breakdown types to show. Leave empty for default view.
          </p>
          <div className="flex flex-col gap-6">
            <FilterSection
              title="Breakdown Type"
              options={[...BREAKDOWN_TYPES]}
              selected={filterState.selectedBreakdownTypes as Set<string>}
              onToggle={(v) => handleBreakdownToggle(v as BreakdownType)}
              onSelectAll={() =>
                updateFilter('selectedBreakdownTypes', new Set(BREAKDOWN_TYPES))
              }
              onDeselectAll={() =>
                updateFilter('selectedBreakdownTypes', new Set())
              }
              placeholder="Search breakdown types..."
            />
            <FilterSection
              title="Level / Area"
              options={availableLevels}
              selected={filterState.selectedLevels}
              onToggle={handleLevelToggle}
              onSelectAll={() =>
                updateFilter('selectedLevels', new Set(availableLevels))
              }
              onDeselectAll={() => updateFilter('selectedLevels', new Set())}
              placeholder="Search levels..."
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={handleClearAllFilters}>
            Clear All Filters
          </Button>
          <Button variant="primary" size="sm" onClick={handleClose}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};
