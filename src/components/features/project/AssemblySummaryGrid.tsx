"use client";

import React, { useMemo, useState } from "react";
import { WallAssembly, TakeoffInstance, MaterialDefinition } from "@/types";
import { calculateMaterials } from "@/services/gemini/calculateMaterials";
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { ConfirmModal } from "@/components/ui";

interface AssemblySummaryGridProps {
  assemblies: WallAssembly[];
  takeoffs: Record<string, TakeoffInstance[]>;
  materials: MaterialDefinition[];
  priceMap: Record<
    string,
    { cost: number; per?: string; waste?: number; supplier?: string }
  >;
  onSelectAssembly: (id: string, height?: number) => void;
  onEditAssembly?: (id: string, height?: number) => void;
  selectedAssemblyId?: string | null;
  onDeleteAssembly?: (id: string) => void;
}

interface SummaryRow {
  id: string; // assemblyId
  code: string;
  name: string;
  type: string;
  totalQty: number;
  totalPerimeter?: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  instanceCount: number;
  height?: number; // specific height variant
}

export const AssemblySummaryGrid: React.FC<AssemblySummaryGridProps> = ({
  assemblies,
  takeoffs,
  materials,
  priceMap,
  onSelectAssembly,
  onEditAssembly,
  selectedAssemblyId,
  onDeleteAssembly,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );

  // Delete confirmation state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [assemblyToDelete, setAssemblyToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const openDeleteModal = (id: string, name: string) => {
    setAssemblyToDelete({ id, name });
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (assemblyToDelete && onDeleteAssembly) {
      onDeleteAssembly(assemblyToDelete.id);
    }
    setIsDeleteModalOpen(false);
    setAssemblyToDelete(null);
  };

  // Determine Display Type helper
  const getDisplayType = (asm: WallAssembly): string => {
    let displayType: string = asm.assemblyType || "Wall";
    if (asm.assemblyType === "Ceiling") {
      if (
        asm.description.toLowerCase().includes("tile") ||
        asm.description.toLowerCase().includes("act")
      )
        displayType = "ACT Ceiling";
      else if (asm.description.toLowerCase().includes("baffle"))
        displayType = "Baffles";
      else if (asm.description.toLowerCase().includes("grid"))
        displayType = "Suspended Grid";
      else if (
        asm.description.toLowerCase().includes("joist") ||
        asm.description.toLowerCase().includes("frame")
      )
        displayType = "Framed Ceiling";
      if (asm.ceilingSubtype) displayType = asm.ceilingSubtype;
    } else if (asm.assemblyType === "Soffit") {
      displayType = "Soffits";
    } else if (asm.assemblyType === "Bulkhead") {
      displayType = "Bulkheads";
    } else if (asm.assemblyType === "Hollow Metal Frame") {
      displayType = "H.M. Frames";
    } else if (asm.assemblyType === "Access Panel") {
      displayType = "Access Panels";
    } else if (asm.assemblyType === "Interior Wall") {
      displayType = "Interior Walls";
    } else if (asm.assemblyType === "Exterior Wall") {
      displayType = "Exterior Walls";
    }
    return displayType;
  };

  // Calculate Summary Data - one row per (assembly, height) to show all variants
  const summaryRows: SummaryRow[] = useMemo(() => {
    const rows: SummaryRow[] = [];
    assemblies.forEach((asm) => {
      const instances = takeoffs[asm.id] || [];
      const displayType = getDisplayType(asm);

      if (instances.length === 0) {
        rows.push({
          id: asm.id,
          code: asm.code,
          name: asm.description,
          type: displayType,
          totalQty: 0,
          totalPerimeter: 0,
          unit: asm.assemblyType === "Ceiling" ? "SF" : "LF",
          unitCost: 0,
          totalCost: 0,
          instanceCount: 0,
        });
        return;
      }

      // Group instances by height
      const byHeight = new Map<
        number,
        { instances: TakeoffInstance[]; cost: number; qty: number; perim: number }
      >();
      instances.forEach((inst) => {
        const h = inst.height || 0;
        if (!byHeight.has(h)) {
          byHeight.set(h, { instances: [], cost: 0, qty: 0, perim: 0 });
        }
        const entry = byHeight.get(h)!;
        entry.instances.push(inst);

        const mats = calculateMaterials(asm, [inst], materials);
        let instCost = 0;
        mats.forEach((m) => {
          let unitPrice = m.overridePrice || 0;
          if (!unitPrice && priceMap[m.item]) unitPrice = priceMap[m.item].cost;
          if (m.category === "Labor" && !unitPrice) unitPrice = 65;
          instCost += m.quantity * unitPrice;
        });
        entry.cost += instCost;

        if (asm.assemblyType === "Ceiling") {
          entry.qty += inst.ceilingArea || 0;
          entry.perim += inst.perimeter || 0;
        } else {
          entry.qty += (inst.length || 0) * (inst.quantity || 1);
        }
      });

      // Create one row per height variant
      const sortedHeights = Array.from(byHeight.entries()).sort(
        (a, b) => a[0] - b[0],
      );
      sortedHeights.forEach(([height, data]) => {
        rows.push({
          id: asm.id,
          code: asm.code,
          name: asm.description,
          type: displayType,
          totalQty: data.qty,
          totalPerimeter: data.perim,
          unit: asm.assemblyType === "Ceiling" ? "SF" : "LF",
          unitCost: data.qty > 0 ? data.cost / data.qty : 0,
          totalCost: data.cost,
          instanceCount: data.instances.length,
          height,
        });
      });
    });
    return rows;
  }, [assemblies, takeoffs, materials, priceMap]);

  // Grouping
  const groupedRows = useMemo(() => {
    const groups: Record<string, SummaryRow[]> = {};
    summaryRows.forEach((row) => {
      const type = row.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(row);
    });
    return groups;
  }, [summaryRows]);

  // Initialize expanded groups
  useMemo(() => {
    const initial: Record<string, boolean> = {};
    Object.keys(groupedRows).forEach((g) => (initial[g] = true));
    if (
      Object.keys(expandedGroups).length === 0 &&
      Object.keys(initial).length > 0
    ) {
      setExpandedGroups(initial);
    }
  }, [groupedRows]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans text-xs">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 font-bold text-slate-600 flex items-center px-3 py-2 sticky top-0 z-10 shadow-sm">
        <div className="flex-1 min-w-0">Assembly</div>
        <div className="w-16 text-center shrink-0">Qty</div>
        <div className="w-16 text-center shrink-0">Total</div>
        <div className="w-5 shrink-0" />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {Object.entries(groupedRows)
          .sort()
          .map(([group, groupRows]: [string, SummaryRow[]]) => (
            <div key={group}>
              {/* Group Header */}
              <div
                className="flex items-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 cursor-pointer border-b border-slate-200 sticky top-0 z-[5]"
                onClick={() => toggleGroup(group)}
              >
                <div className="w-4 flex justify-center mr-1.5 shrink-0">
                  {expandedGroups[group] ? (
                    <ChevronDown className="w-3 h-3 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-slate-500" />
                  )}
                </div>
                <span className="font-semibold text-slate-700 text-xs">{group}</span>
                <span className="ml-1.5 text-[10px] text-slate-400 font-normal">({groupRows.length})</span>
              </div>

              {expandedGroups[group] &&
                groupRows.map((row) => {
                  const rowKey = row.height != null ? `${row.id}-${row.height}` : row.id;
                  const isSelected = selectedAssemblyId === row.id;
                  const isCeiling =
                    row.type === "ACT Ceiling" ||
                    row.type === "Suspended Grid" ||
                    row.type === "Baffles" ||
                    row.type.includes("Ceiling");

                  return (
                    <div
                      key={rowKey}
                      onClick={() => onSelectAssembly(row.id, row.height)}
                      onDoubleClick={() => onEditAssembly && onEditAssembly(row.id, row.height)}
                      className={`flex items-center px-3 py-2 border-b border-slate-100 cursor-pointer transition-colors group
                        ${isSelected ? "bg-blue-600 text-white" : "hover:bg-blue-50 text-slate-700"}
                      `}
                    >
                      {/* Code badge + Description */}
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded leading-none
                              ${isSelected ? "bg-blue-500 text-blue-100" : "bg-slate-200 text-slate-500"}
                            `}
                            title={row.code}
                          >
                            {row.code}
                          </span>
                        </div>
                        <div className={`truncate text-[11px] font-medium leading-tight ${isSelected ? "text-white" : "text-slate-700"}`}>
                          {row.height != null ? `${row.name} @ ${row.height}'` : row.name}
                        </div>
                      </div>

                      {/* Qty + Unit stacked */}
                      <div className="w-16 shrink-0 text-center">
                        <div className={`font-mono text-[11px] font-semibold ${isSelected ? "text-white" : "text-slate-700"}`}>
                          {Math.round(row.totalQty).toLocaleString()}
                        </div>
                        <div className={`text-[9px] ${isSelected ? "text-blue-200" : "text-slate-400"}`}>
                          {isCeiling && row.totalPerimeter
                            ? `${row.unit} / ${Math.round(row.totalPerimeter || 0)} LF`
                            : row.unit}
                        </div>
                      </div>

                      {/* Total Cost */}
                      <div className={`w-16 shrink-0 text-center font-mono font-bold text-[11px] ${isSelected ? "text-white" : "text-slate-800"}`}>
                        {Math.round(row.totalCost).toLocaleString()}
                      </div>

                      {/* Delete - hover only */}
                      <div className="w-5 shrink-0 flex justify-center">
                        {onDeleteAssembly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteModal(row.id, row.name);
                            }}
                            className={`flex items-center justify-center w-4 h-4 rounded opacity-0 group-hover:opacity-100 transition-opacity
                              ${isSelected
                                ? "text-blue-200 hover:text-red-200 hover:bg-white/20"
                                : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                              }
                            `}
                            title="Delete Assembly"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setAssemblyToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Assembly"
        message={`Are you sure you want to delete "${assemblyToDelete?.name}" and all its instances? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};
