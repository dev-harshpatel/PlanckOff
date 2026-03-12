'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { Button, Modal, ModalBody, ModalFooter } from '@/components/ui';
import { FilterSection } from '@/components/features/reports/FilterSection';

export interface MaterialsFilterState {
  selectedItems: Set<string>;
  selectedLevels: Set<string>;
  selectedSections: Set<string>;
  selectedCostCodes: Set<string>;
}

interface MaterialsFilterDropdownProps {
  availableItems: string[];
  availableLevels: string[];
  availableSections: string[];
  availableCostCodes: string[];
  filterState: MaterialsFilterState;
  onFilterChange: (state: MaterialsFilterState) => void;
}

export const MaterialsFilterDropdown = ({
  availableItems,
  availableLevels,
  availableSections,
  availableCostCodes,
  filterState,
  onFilterChange,
}: MaterialsFilterDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filterState.selectedItems.size > 0) n++;
    if (filterState.selectedLevels.size > 0) n++;
    if (filterState.selectedCostCodes.size > 0) n++;
    return n;
  }, [filterState]);

  const updateFilter = useCallback(
    (key: keyof MaterialsFilterState, value: Set<string>) => {
      onFilterChange({ ...filterState, [key]: value });
    },
    [filterState, onFilterChange]
  );

  const toggleSet = useCallback(
    (
      current: Set<string>,
      key: keyof MaterialsFilterState,
      value: string,
      _allOptions: string[]
    ) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      updateFilter(key, next);
    },
    [updateFilter]
  );

  const handleItemToggle = useCallback(
    (item: string) =>
      toggleSet(
        filterState.selectedItems,
        'selectedItems',
        item,
        availableItems
      ),
    [filterState.selectedItems, availableItems, toggleSet]
  );

  const handleLevelToggle = useCallback(
    (level: string) =>
      toggleSet(
        filterState.selectedLevels,
        'selectedLevels',
        level,
        availableLevels
      ),
    [filterState.selectedLevels, availableLevels, toggleSet]
  );

  const handleSectionToggle = useCallback(
    (section: string) =>
      toggleSet(
        filterState.selectedSections,
        'selectedSections',
        section,
        availableSections
      ),
    [filterState.selectedSections, availableSections, toggleSet]
  );

  const handleCostCodeToggle = useCallback(
    (code: string) =>
      toggleSet(
        filterState.selectedCostCodes,
        'selectedCostCodes',
        code,
        availableCostCodes
      ),
    [filterState.selectedCostCodes, availableCostCodes, toggleSet]
  );

  const handleClearAllFilters = useCallback(() => {
    onFilterChange({
      selectedItems: new Set(),
      selectedLevels: new Set(),
      selectedSections: new Set(),
      selectedCostCodes: new Set(),
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
        title="Filters"
        size="2xl"
        closeOnOverlayClick
      >
        <ModalBody className="max-h-[75vh] overflow-y-auto">
          <p className="text-sm text-slate-500 mb-5">
            Select items to include. Leave empty for all.
          </p>
          <div className="flex flex-col gap-6">
            {/* Row 1: Cost Code (left) + Level / Area (right) */}
            <div className="grid grid-cols-2 gap-6">
              <FilterSection
                title="Cost Code"
                options={availableCostCodes}
                selected={filterState.selectedCostCodes}
                onToggle={handleCostCodeToggle}
                onSelectAll={() =>
                  updateFilter('selectedCostCodes', new Set(availableCostCodes))
                }
                onDeselectAll={() =>
                  updateFilter('selectedCostCodes', new Set())
                }
                placeholder="Search cost codes..."
              />
              <FilterSection
                title="Level / Area"
                options={availableLevels}
                selected={filterState.selectedLevels}
                onToggle={handleLevelToggle}
                onSelectAll={() =>
                  updateFilter('selectedLevels', new Set(availableLevels))
                }
                onDeselectAll={() =>
                  updateFilter('selectedLevels', new Set())
                }
                placeholder="Search levels..."
              />
            </div>
            {/* Row 2: Materials — full width, taller list */}
            <FilterSection
              title="Materials"
              options={availableItems}
              selected={filterState.selectedItems}
              onToggle={handleItemToggle}
              onSelectAll={() =>
                updateFilter('selectedItems', new Set(availableItems))
              }
              onDeselectAll={() =>
                updateFilter('selectedItems', new Set())
              }
              placeholder="Search materials..."
              listHeight="max-h-[280px]"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAllFilters}
          >
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
