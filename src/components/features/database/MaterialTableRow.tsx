"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui";
import { MaterialDefinition } from "@/types";

interface MaterialTableRowProps {
  material: MaterialDefinition;
  visibleOptionalColumns: Record<string, boolean>;
  onClick: () => void;
  onDelete: (code: string) => void;
}

export const MaterialTableRow = ({
  material: m,
  visibleOptionalColumns,
  onClick,
  onDelete,
}: MaterialTableRowProps) => {
  const unitCost = m.unitCost ?? m.matCost;
  const prodRate = (() => {
    const sz = m.sizeOfUnit ?? 0;
    if (unitCost != null && sz > 0) return (unitCost / sz).toFixed(4);
    return m.productivity != null ? m.productivity : "-";
  })();

  return (
    <tr
      className="group transition-colors hover:bg-slate-50 cursor-pointer"
      onClick={onClick}
    >
      <td className="px-4 py-3 text-sm font-mono text-slate-500">{m.code}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{m.section || "-"}</td>
      <td className="px-4 py-3 text-sm text-slate-600">
        {m.matCostCode || "-"}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{m.type || "-"}</td>
      <td className="px-4 py-3 text-sm text-slate-600">
        {m.manufacturer || "-"}
      </td>
      <td className="px-4 py-3 text-sm text-slate-800 font-medium">
        {m.description}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 text-right">
        {unitCost != null && unitCost > 0
          ? `$${unitCost.toLocaleString()}`
          : "-"}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{m.per || "-"}</td>
      <td className="px-4 py-3 text-sm text-slate-600">
        {m.sizeOfUnit != null ? m.sizeOfUnit : "-"}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{prodRate}</td>
      <td className="px-4 py-3">
        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
          {m.category}
        </span>
      </td>
      {visibleOptionalColumns.sheetBagBox && (
        <td className="px-4 py-3 text-sm text-slate-600">
          {m.sheetBagBox || "-"}
        </td>
      )}
      {visibleOptionalColumns.size && (
        <td className="px-4 py-3 text-sm text-slate-600">{m.size || "-"}</td>
      )}
      {visibleOptionalColumns.screwSpacing && (
        <td className="px-4 py-3 text-sm text-slate-600">
          {m.screwSpacing || "-"}
        </td>
      )}
      {visibleOptionalColumns.width && (
        <td className="px-4 py-3 text-sm text-slate-600">{m.width || "-"}</td>
      )}
      {visibleOptionalColumns.gauge && (
        <td className="px-4 py-3 text-sm text-slate-600">{m.gauge || "-"}</td>
      )}
      {visibleOptionalColumns.flange && (
        <td className="px-4 py-3 text-sm text-slate-600">
          {m.flange || "-"}
        </td>
      )}
      {visibleOptionalColumns.hourlyRate && (
        <td className="px-4 py-3 text-sm text-slate-600">
          {m.hourlyRate != null ? `$${m.hourlyRate}` : "-"}
        </td>
      )}
      <td className="px-4 py-3">
        <div
          className="flex gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            icon={Trash2}
            variant="danger"
            size="sm"
            onClick={() => onDelete(m.code)}
            className="opacity-0 group-hover:opacity-100 transition-all"
            tooltip="Delete material"
          />
        </div>
      </td>
    </tr>
  );
};
