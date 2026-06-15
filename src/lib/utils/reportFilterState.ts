export const pruneSelectedFilterValues = (
  selected: Set<string>,
  available: string[],
): Set<string> => {
  if (selected.size === 0) return selected;

  const availableSet = new Set(available);
  const nextSelected = new Set(
    Array.from(selected).filter((value) => availableSet.has(value)),
  );

  return nextSelected.size === selected.size ? selected : nextSelected;
};
