"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { CalculationMethod, MaterialDefinition, TakeoffInstance, WallAssembly } from "@/types";
import type { ProjectOverrideMap } from "@/types/core/projectOverrides";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DatabaseManager } from "@/components/features/database/DatabaseManager";
import { AssemblyTemplate, DEFAULT_TEMPLATES } from "@/constants/defaultAssemblies";
import { AssemblyEditorModal } from "@/components/features/project/AssemblyEditorModal";
import { AssemblySummaryTab } from "@/components/features/project/tabs/AssemblySummaryTab";
import { ReportsTab } from "@/components/features/project/tabs/ReportsTab";
import { TakeoffTab } from "@/components/features/project/tabs/TakeoffTab";
import { useAssemblyActions } from "@/components/features/project/hooks/useAssemblyActions";
import { useAssemblySave } from "@/components/features/project/hooks/useAssemblySave";
import { useAssemblyState } from "@/components/features/project/hooks/useAssemblyState";
import { useEstimateCalculations } from "@/components/features/project/hooks/useEstimateCalculations";
import { useTakeoffSchedule } from "@/components/features/project/hooks/useTakeoffSchedule";
import { usePipeline } from "@/context/PipelineContext";
import { AssemblyData, MaterialCosting } from "@/types/assembly";
import { FORMULA_DEFINITIONS } from "@/constants/formulas";
import {
  mapFinalOutputToTakeoffs,
  mapRawTakeoffToInstances,
} from "@/lib/utils/assemblyJsonMapper";
import { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";
import { getRowDetails } from "@/lib/utils/calculationUtils";
import { serializeTakeoffsToRawRows } from "@/lib/utils/takeoffSerializer";
import { ConfirmModal, Modal, useToast } from "@/components/ui";

interface EstimateResultProps {
  assemblies: WallAssembly[];
  onReset: () => void;
  // materials/onUpdateMaterials removed 2026-06-22 — spec_database removed; will come from material_database (Phase 2+)
  onAnalyze: (file: File) => void;
  isAnalyzing: boolean;
  viewMode?: "project" | "report";
  displayUnit: "imperial" | "metric";
  activeReportTab?: "proposal" | "bidding" | "markups" | "materials" | "matlab" | "labor";
  setActiveReportTab?: (
    tab: "proposal" | "bidding" | "markups" | "materials" | "matlab" | "labor",
  ) => void;
  onCloseReport?: () => void;
  templates?: AssemblyTemplate[];
  assemblyData?: AssemblyData[];
  materialCostingData?: MaterialCosting[];
  /** Raw takeoff rows (one per original Excel row) — used to show individual levels in TakeoffScheduleView */
  rawTakeoffRows?: unknown[];
  projectId?: string | null;
  finalOutputId?: string | null;
  takeoffOutputId?: string | null;
  onUnitCostChange?: (code: string, newCost: number, type: "material" | "labor", unit?: string) => void;
  /** Updates materialCostingData locally so costs recalculate immediately on blur. DB save happens on Save button click. */
  onWasteChange?: (code: string, wastePercent: number, isLabor: boolean) => void;
  onImportComplete?: () => void;
  onAssemblySaveComplete?: (updatedCostingData: MaterialCosting[]) => void;
  overrideMap?: ProjectOverrideMap;
  onOverrideMapChange?: React.Dispatch<React.SetStateAction<ProjectOverrideMap>>;
}

export const EstimateResult: React.FC<EstimateResultProps> = ({
  assemblies: initialAssemblies,
  onReset,
  onAnalyze,
  isAnalyzing,
  viewMode = "project",
  displayUnit,
  activeReportTab,
  setActiveReportTab,
  onCloseReport,
  templates = DEFAULT_TEMPLATES,
  assemblyData = [],
  materialCostingData = [],
  rawTakeoffRows = [],
  projectId: projectIdProp,
  finalOutputId,
  takeoffOutputId,
  onUnitCostChange,
  onWasteChange,
  onImportComplete,
  onAssemblySaveComplete,
  overrideMap = {},
  onOverrideMapChange,
}) => {
  // spec_database removed 2026-06-22 — materials will come from material_database (Phase 2+)
  const resolvedMaterials: MaterialDefinition[] = [];

  const {
    assemblies,
    setAssemblies,
    assembliesRef,
    takeoffs,
    setTakeoffs,
    localRawTakeoffRows,
    setLocalRawTakeoffRows,
    editingAssemblyId,
    setEditingAssemblyId,
    editingHeight,
    setEditingHeight,
    activeAssemblyId,
    setActiveAssemblyId,
    isDatabaseOpen,
    setIsDatabaseOpen,
    activeTab,
    setActiveTab,
    assemblySearch,
    setAssemblySearch,
    manualItems,
    setManualItems,
    isSearchOpen,
    setIsSearchOpen,
    searchRef,
    importedPdfFile,
    setImportedPdfFile,
    importedTakeoffData,
    setImportedTakeoffData,
    skipNextTakeoffPersistRef,
    takeoffPersistTimeoutRef,
    lastPersistedTakeoffPayloadRef,
    isScopeDeleteModalOpen,
    setIsScopeDeleteModalOpen,
    scopeToDelete,
    setScopeToDelete,
    rowSearchOpen,
    setRowSearchOpen,
    rowSearchQuery,
    setRowSearchQuery,
    formulaDropdownOpen,
    setFormulaDropdownOpen,
    prodCalcOpen,
    setProdCalcOpen,
    isTemplateMenuOpen,
    setIsTemplateMenuOpen,
    templateMenuRef,
    sidebarWidth,
    setSidebarWidth,
    lastSidebarWidth,
    setLastSidebarWidth,
    isResizing,
    setIsResizing,
    containerRef,
  } = useAssemblyState({
    initialAssemblies,
    rawTakeoffRows,
  });

  const toast = useToast();
  const { openImportModal } = usePipeline();

  const handleScopeRemoved = useCallback(
    (scope: string) => {
      toast.success(
        "Scope Removed",
        `"${scope}" has been removed. Assemblies moved to Base Bid.`,
      );
    },
    [toast],
  );

  const {
    handleAddFromTemplate,
    handleLoadTemplate,
    confirmScopeDelete,
    handleDeleteScope,
    startResizing,
    stopResizing,
    resize,
    toggleSidebar,
    updateInstance,
    deleteInstance,
    addInstance,
    moveInstance,
    updateAssemblyInfo,
    applyTemplate,
    updateComponent,
    handleMaterialSelect,
    addComponent,
    removeComponent,
    handleAddAssembly,
    deleteAssembly,
  } = useAssemblyActions({
    assemblies,
    assembliesRef,
    takeoffs,
    materials: resolvedMaterials,
    editingAssemblyId,
    scopeToDelete,
    isResizing,
    containerRef,
    sidebarWidth,
    lastSidebarWidth,
    setAssemblies,
    setTakeoffs,
    setEditingAssemblyId,
    setIsTemplateMenuOpen,
    setScopeToDelete,
    setIsScopeDeleteModalOpen,
    setRowSearchOpen,
    setRowSearchQuery,
    setIsResizing,
    setSidebarWidth,
    setLastSidebarWidth,
    onScopeRemoved: handleScopeRemoved,
  });

  const { handleImportComplete, handleScheduleUpload } = useTakeoffSchedule({
    assemblies,
    takeoffs,
    viewMode,
    takeoffOutputId,
    setAssemblies,
    setTakeoffs,
    setLocalRawTakeoffRows,
    setImportedPdfFile,
    setImportedTakeoffData,
    skipNextTakeoffPersistRef,
    lastPersistedTakeoffPayloadRef,
    takeoffPersistTimeoutRef,
    onImportComplete,
  });

  const materialCostingDataRef = useRef<MaterialCosting[]>(materialCostingData);
  materialCostingDataRef.current = materialCostingData;

  const { handleSaveAssembly } = useAssemblySave({
    finalOutputId,
    projectId: projectIdProp,
    materialCostingDataRef,
    assembliesRef,
    resolvedMaterials,
    overrideMap,
    onAssemblySaveComplete,
    onOverrideMapChange,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
      const target = event.target as HTMLElement;
      if (!target.closest(".row-search-container")) {
        setRowSearchOpen(null);
      }
      if (!target.closest(".formula-dropdown-container")) {
        setFormulaDropdownOpen(null);
      }
      if (
        templateMenuRef.current &&
        !templateMenuRef.current.contains(event.target as Node)
      ) {
        setIsTemplateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync assemblies from parent when initialAssemblies or viewMode changes.
  // Separated from the takeoff effect below to avoid resetting user edits whenever
  // materialCostingData or rawTakeoffRows change independently.
  // Guard: skip the full reset while an assembly editor is open — otherwise async
  // override-map updates completing mid-edit would wipe the user's pending changes
  // (e.g. overrideHeight 15→10) before they click Save.
  useEffect(() => {
    if (viewMode === "project" && initialAssemblies.length > 0) {
      if (editingAssemblyId) {
        return;
      }
      setAssemblies(initialAssemblies);
    } else if (initialAssemblies.length > assemblies.length) {
      const newOnes = initialAssemblies.slice(assemblies.length);
      setAssemblies((prev) => [...prev, ...newOnes]);
      const mergedTakeoffs: Record<string, TakeoffInstance[]> = { ...takeoffs };
      newOnes.forEach((a) => {
        if (!mergedTakeoffs[a.id]) {
          mergedTakeoffs[a.id] = [];
        }
      });
      setTakeoffs(mergedTakeoffs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- takeoffs intentionally excluded to avoid sync loop
  }, [initialAssemblies, viewMode, editingAssemblyId]);

  // Recompute takeoffs whenever raw rows change (does NOT reset assemblies).
  useEffect(() => {
    setLocalRawTakeoffRows(rawTakeoffRows);
  }, [rawTakeoffRows]);

  useEffect(() => {
    if (viewMode !== "project" || initialAssemblies.length === 0) return;
    const hasFinalOutputFormat = materialCostingData.some(
      (a) =>
        typeof (a as { height_ft?: number; total_length?: number }).height_ft === "number" &&
        typeof (a as { height_ft?: number; total_length?: number }).total_length === "number",
    );
    let newTakeoffs: Record<string, TakeoffInstance[]>;
    if (hasFinalOutputFormat) {
      newTakeoffs =
        localRawTakeoffRows.length > 0
          ? mapRawTakeoffToInstances(
              localRawTakeoffRows as TakeoffRawRecord[],
              materialCostingData,
            )
          : mapFinalOutputToTakeoffs(materialCostingData);
      initialAssemblies.forEach((a) => {
        if (!newTakeoffs[a.id]) newTakeoffs[a.id] = [];
      });
    } else {
      newTakeoffs = {};
      initialAssemblies.forEach((a) => {
        newTakeoffs[a.id] = takeoffs[a.id] || [];
      });
    }
    skipNextTakeoffPersistRef.current = true;
    lastPersistedTakeoffPayloadRef.current = JSON.stringify(
      serializeTakeoffsToRawRows(newTakeoffs, initialAssemblies),
    );
    setTakeoffs(newTakeoffs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- takeoffs intentionally excluded to avoid sync loop
  }, [initialAssemblies, viewMode, materialCostingData, localRawTakeoffRows]);

  useEffect(() => {
    const initial: Record<string, TakeoffInstance[]> = {};
    assemblies.forEach((a) => {
      if (!takeoffs[a.id]) {
        initial[a.id] = [];
      }
    });
    if (Object.keys(initial).length > 0) {
      setTakeoffs((prev) => ({ ...prev, ...initial }));
    }
  }, [assemblies]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const handleFormulaChange = (
    assemblyId: string,
    componentId: string,
    val: string,
  ) => {
    const matchedMethod = Object.keys(FORMULA_DEFINITIONS).find(
      (key) =>
        (
          FORMULA_DEFINITIONS[key as CalculationMethod].label || ""
        ).toLowerCase() === val.toLowerCase(),
    ) as CalculationMethod | undefined;

    setAssemblies((prev) =>
      prev.map((a) => {
        if (a.id !== assemblyId) return a;
        return {
          ...a,
          components: a.components.map((c) => {
            if (c.id !== componentId) return c;
            if (matchedMethod) {
              return { ...c, usage: matchedMethod, customFormula: undefined };
            } else if (val.match(/Vertical.*@/i)) {
              return { ...c, usage: val, customFormula: undefined };
            } else {
              return { ...c, usage: "Custom Formula", customFormula: val };
            }
          }),
        };
      }),
    );
  };

  const {
    filteredAssemblies,
    currentEditingAssembly,
    statsByHeight,
    totalAggLength,
  } = useEstimateCalculations({
    assemblies,
    takeoffs,
    assemblySearch,
    editingAssemblyId,
    editingHeight,
  });

  return (
    <div
      className="relative z-0 flex h-full bg-slate-100 overflow-hidden"
      ref={containerRef}
      onMouseMove={isResizing ? () => {} : undefined}
    >
      <ReportsTab
        isVisible={viewMode === "report"}
        assemblies={assemblies}
        takeoffs={takeoffs}
        manualItems={manualItems}
        materialCostingData={materialCostingData}
        onUnitCostChange={onUnitCostChange}
        displayUnit={displayUnit}
        reportScopeId={projectIdProp}
        finalOutputId={finalOutputId}
        activeReportTab={activeReportTab}
        setActiveReportTab={setActiveReportTab}
        onCloseReport={onCloseReport}
      />
      <AssemblySummaryTab
        sidebarWidth={sidebarWidth}
        templateMenuRef={templateMenuRef}
        isTemplateMenuOpen={isTemplateMenuOpen}
        setIsTemplateMenuOpen={setIsTemplateMenuOpen}
        templates={templates}
        handleAddFromTemplate={handleAddFromTemplate}
        setIsDatabaseOpen={setIsDatabaseOpen}
        openImportModal={openImportModal}
        projectId={projectIdProp}
        handleImportComplete={handleImportComplete}
        handleAddAssembly={handleAddAssembly}
        assemblySearch={assemblySearch}
        setAssemblySearch={setAssemblySearch}
        filteredAssemblies={filteredAssemblies}
        takeoffs={takeoffs}
        setActiveAssemblyId={setActiveAssemblyId}
        setEditingAssemblyId={setEditingAssemblyId}
        setEditingHeight={setEditingHeight}
        activeAssemblyId={activeAssemblyId}
        deleteAssembly={deleteAssembly}
      />

      {/* Resizer */}
      <div
        className="w-1.5 bg-slate-100 hover:bg-blue-400 cursor-col-resize transition-colors z-20 flex items-center justify-center group relative -ml-[3px] border-l border-slate-200 hover:w-2"
        onMouseDown={startResizing}
      >
        <div
          className={`w-0.5 h-8 bg-slate-300 rounded group-hover:bg-white transition-colors ${isResizing ? "bg-white" : ""}`}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSidebar();
          }}
          className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 bg-white border border-slate-300 rounded-full p-0.5 shadow-sm hover:bg-slate-50 hover:text-blue-600 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title={sidebarWidth === 0 ? "Expand Sidebar" : "Collapse Sidebar"}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {sidebarWidth === 0 ? (
            <ChevronRight size={12} />
          ) : (
            <ChevronLeft size={12} />
          )}
        </button>
      </div>

      <TakeoffTab
        filteredAssemblies={filteredAssemblies}
        takeoffs={takeoffs}
        updateInstance={updateInstance}
        deleteInstance={deleteInstance}
        openImportModal={openImportModal}
        projectId={projectIdProp}
        handleImportComplete={handleImportComplete}
      />

      {/* Assembly Edit Modal */}
      <AssemblyEditorModal
        isOpen={!!currentEditingAssembly}
        onClose={() => {
          setEditingAssemblyId(null);
          setEditingHeight(null);
        }}
        assembly={
          currentEditingAssembly || {
            id: "",
            code: "",
            description: "",
            components: [],
            assemblyType: "Wall",
          }
        }
        updateAssemblyInfo={updateAssemblyInfo}
        totalAggLength={totalAggLength}
        materials={resolvedMaterials}
        handleMaterialSelect={handleMaterialSelect}
        handleUpdateComponent={updateComponent}
        handleAddComponent={addComponent}
        handleDeleteComponent={removeComponent}
        getRowDetails={getRowDetails}
        takeoffInstances={
          currentEditingAssembly
            ? takeoffs[currentEditingAssembly.id] || []
            : []
        }
        statsByHeight={statsByHeight}
        selectedHeight={editingHeight}
        onSelectHeight={setEditingHeight}
        onLoadTemplate={handleLoadTemplate}
        templates={templates}
        materialCostingData={materialCostingData.find(
          (m) => m.assembly_id === currentEditingAssembly?.code,
        )}
        projectId={projectIdProp}
        overrideMap={overrideMap}
        onOverrideMapChange={onOverrideMapChange}
        onWasteChange={onWasteChange}
        onSaveAssembly={finalOutputId ? handleSaveAssembly : undefined}
      />

      {/* Database Modal */}
      <Modal
        isOpen={isDatabaseOpen}
        onClose={() => setIsDatabaseOpen(false)}
        size="full"
      >
        <div className="h-full flex flex-col overflow-hidden">
          <DatabaseManager
            materials={[]}
            onUpdateMaterials={() => {}}
            onClose={() => setIsDatabaseOpen(false)}
          />
        </div>
      </Modal>

      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      <ConfirmModal
        isOpen={isScopeDeleteModalOpen}
        onClose={() => {
          setIsScopeDeleteModalOpen(false);
          setScopeToDelete(null);
        }}
        onConfirm={confirmScopeDelete}
        title="Remove Scope"
        message={`Remove scope "${scopeToDelete}"? Assemblies in this scope will default to Base Bid.`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  );
};
