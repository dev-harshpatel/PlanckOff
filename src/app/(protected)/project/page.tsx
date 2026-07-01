"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Box,
  Briefcase,
  FileText,
  Layers,
  LogOut,
  Percent,
  Users,
} from "lucide-react";
import { AppState, ProjectSummary } from "@/types";
import { MaterialCosting } from "@/types/assembly";
import { applyProjectCostingOverrides } from "@/lib/utils/projectPricing";
import { syncProjectOverrides } from "@/lib/utils/projectOverrideSync";
import { EstimateResult } from "@/components/features/project/EstimateResult";
import { identifyWallAssemblies } from "@/services/gemini/client";
import { mapFinalOutputToWallAssemblies } from "@/lib/utils/assemblyJsonMapper";
import { useProjectData } from "@/hooks/useProjectData";
import { ProjectDataProvider } from "@/context/ProjectDataContext";
import { ProjectPageSkeleton } from "@/components/features/project/ProjectPageSkeleton";
import { useNavigationLoading } from "@/context/NavigationLoadingContext";

const REPORT_TABS = ["materials", "matlab", "labor", "markups", "proposal", "bidding"] as const;
type ReportTab = (typeof REPORT_TABS)[number];

const isReportTab = (t: string | null): t is ReportTab =>
  t != null && REPORT_TABS.includes(t as ReportTab);

function ProjectContent() {
  const router = useRouter();
  const { startNavigation } = useNavigationLoading();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");
  const tabFromUrl = searchParams.get("tab");

  const [state, setState] = useState<AppState>(AppState.ESTIMATING);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<
    "proposal" | "bidding" | "markups" | "materials" | "matlab" | "labor"
  >("proposal");

  // Sync report view from URL so refresh keeps Materials/Labor tab
  useEffect(() => {
    if (!isReportTab(tabFromUrl)) return;
    setShowReport(true);
    setActiveReportTab(tabFromUrl);
  }, [tabFromUrl]);

  const openReportTab = (tab: ReportTab) => {
    setShowReport(true);
    setActiveReportTab(tab);
    const params = new URLSearchParams();
    if (projectId) params.set("id", projectId);
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeReport = () => {
    setShowReport(false);
    const params = new URLSearchParams();
    if (projectId) params.set("id", projectId);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };


  const [activeProject, setActiveProject] = useState<ProjectSummary>({
    id: projectId || `new-${Date.now()}`,
    name: "Loading...",
    company: "",
    status: "Working Project Progress",
    dueDate: "TBD",
    projectNumber: "",
  });
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  // ─── Project data via canonical hook ────────────────────────────────────────
  // Single fetch point — replaces assemblyDataRefreshTrigger + two separate useEffects.
  // materialCostingData is RAW; effectiveCostingData (below) has overrides baked in
  // for backward-compat components. Phase 3 will remove effectiveCostingData when all
  // tabs switch to reading from projectCosts.lineItems via ProjectDataContext.
  const projectData = useProjectData(projectId);
  const {
    assemblies,
    setAssemblies,
    materialCostingData,
    setMaterialCostingData,
    rawTakeoffRows,
    overrideMap,
    setOverrideMap,
    finalOutputId,
    takeoffOutputId,
    isLoading: isLoadingAssemblyData,
    refresh,
  } = projectData;

  // Backward-compat: bake overrides into costing data for existing tab components.
  // ProjectDataContext.projectCosts uses aggregateProjectCosts (no baking needed there).
  // Remove this once Phase 3 migrates all tabs to read from projectCosts.lineItems.
  const effectiveCostingData = useMemo(
    () => applyProjectCostingOverrides(materialCostingData, overrideMap),
    [materialCostingData, overrideMap],
  );

  // Fetch project data
  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) {
        setIsLoadingProject(false);
        return;
      }

      try {
        const response = await fetch(`/api/projects/${projectId}`);
        const data = await response.json();

        if (data.success && data.project) {
          setActiveProject({
            id: data.project.id,
            name: data.project.name || "Untitled Project",
            company: data.project.company || "Client",
            status: data.project.status || "Working Project Progress",
            dueDate: data.project.dueDate || "TBD",
            projectNumber: data.project.projectNumber || "",
          });
        }
      } catch (err) {
        console.error("Failed to fetch project:", err);
      } finally {
        setIsLoadingProject(false);
      }
    };

    fetchProject();
  }, [projectId]);

  // spec_database loading removed 2026-06-22 — materials will come from material_database (Phase 2+)

  // Data loading is now handled by useProjectData() above.
  // Override reactivity is now handled by effectiveCostingData useMemo above.

  // spec_database removed 2026-06-22 — baseline comes from material_database (Phase 2+)
  const syncProjectUnitCostOverride = async (
    code: string,
    newCost: number,
    type: "material" | "labor",
  ) => {
    if (!projectId) return;

    const field = type === "labor" ? "hourlyRate" : "productivity";
    await syncProjectOverrides({
      projectId,
      items: [
        {
          materialCode: code,
          field,
          value: newCost,
          baselineValue: undefined,
          existingValue: overrideMap[code]?.[field] as number | undefined,
        },
      ],
      onOverrideMapChange: setOverrideMap,
    });
  };

  const handleAnalyze = async (file: File) => {
    setState(AppState.ANALYZING);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result as string;
        const base64String = result.split(",")[1];
        const mimeType = file.type;

        try {
          const detectedAssemblies = await identifyWallAssemblies(
            base64String,
            mimeType,
            [],
          );
          setAssemblies((prev) => [...prev, ...detectedAssemblies]);
          setState(AppState.ESTIMATING);
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : "Failed to identify wall types.";
          setError(errorMessage);
          setState(AppState.ERROR);
        }
      };
      reader.onerror = () => {
        setError("Failed to read file");
        setState(AppState.ERROR);
      };
      reader.readAsDataURL(file);
    } catch {
      setError("Unexpected error");
      setState(AppState.ERROR);
    }
  };

  // Optimistic update helper — updates raw costing data + remaps assembly tiles.
  // effectiveCostingData (useMemo above) auto-recomputes with overrides applied.
  const syncUiFromCostingData = (updatedCostingData: MaterialCosting[]) => {
    const mappedAssemblies = mapFinalOutputToWallAssemblies(updatedCostingData);
    setMaterialCostingData(updatedCostingData);
    setAssemblies(mappedAssemblies);
  };

  const applyProjectWideCostingUpdate = ({
    code,
    isLabor,
    updater,
  }: {
    code: string;
    isLabor: boolean;
    updater: {
      material: (
        item: NonNullable<MaterialCosting["materials_costing"][number]["matched_material"]>,
      ) => NonNullable<MaterialCosting["materials_costing"][number]["matched_material"]>;
      labor: (
        item: NonNullable<MaterialCosting["materials_costing"][number]["matched_labor"]>[number],
      ) => NonNullable<MaterialCosting["materials_costing"][number]["matched_labor"]>[number];
    };
  }) =>
    materialCostingData.map((assembly) => ({
      ...assembly,
      materials_costing: assembly.materials_costing.map((item) => ({
        ...item,
        matched_material: !isLabor && item.matched_material?.code === code
          ? updater.material(item.matched_material)
          : item.matched_material,
        matched_labor: isLabor
          ? (item.matched_labor ?? []).map((lab) =>
              lab.code === code ? updater.labor(lab) : lab,
            )
          : item.matched_labor,
      })),
    }));

  const handleUnitCostChange = async (
    code: string,
    newCost: number,
    type: "material" | "labor",
  ) => {
    if (!finalOutputId) {
      return;
    }

    const previousCostingData = materialCostingData;
    const updatedData = applyProjectWideCostingUpdate({
      code,
      isLabor: type === "labor",
      updater: {
        material: (item) => ({ ...item, unit_cost: newCost }),
        labor: (item) => ({ ...item, unit_cost: newCost }),
      },
    });

    syncUiFromCostingData(updatedData);

    try {
      const res = await fetch(`/api/final-output/${finalOutputId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assemblies: updatedData }),
      });
      const json = await res.json();
      if (res.ok) {
        await syncProjectUnitCostOverride(code, newCost, type);
      } else {
        console.error("[UnitCost] PATCH failed", { status: res.status, error: json });
        syncUiFromCostingData(previousCostingData);
      }
    } catch (err) {
      console.error("[UnitCost] Network error during PATCH:", err);
      syncUiFromCostingData(previousCostingData);
    }
  };

  /**
   * Updates materialCostingData state when the user changes waste% in the Assembly modal.
   * This gives immediate cost-recalculation feedback in the UI without touching the DB —
   * the actual DB write happens only when the Save button is clicked (handleSaveAssembly).
   */
  const handleWasteChange = (
    code: string,
    wastePercent: number,
    isLabor: boolean,
  ) => {
    const updatedData = applyProjectWideCostingUpdate({
      code,
      isLabor,
      updater: {
        material: (item) => ({ ...item, waste_percent: wastePercent }),
        labor: (item) => ({ ...item, waste_percent: wastePercent }),
      },
    });
    setMaterialCostingData(updatedData);
  };

  const handleAssemblySaveComplete = (updatedCostingData: MaterialCosting[]) => {
    syncUiFromCostingData(updatedCostingData);
  };

  const handleReset = () => {
    startNavigation('/dashboard');
    router.push("/dashboard");
  };

  if (isLoadingProject && isLoadingAssemblyData) {
    return <ProjectPageSkeleton />;
  }

  return (
    <ProjectDataProvider projectId={projectId ?? ''} data={projectData}>
    <div className="h-full flex flex-col">
      {/* Project View Header */}
      <header className="sticky top-0 bg-white border-b border-slate-200 flex-none z-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { startNavigation('/dashboard'); router.push("/dashboard"); }}
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"
            >
              <Briefcase className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              {isLoadingProject ? (
                <div className="flex flex-col gap-1.5">
                  <div className="h-3.5 w-32 rounded bg-slate-200 animate-pulse" />
                  <div className="h-2.5 w-20 rounded bg-slate-100 animate-pulse" />
                </div>
              ) : (
                <>
                  <h1 className="text-base font-bold text-slate-900 leading-none flex items-center gap-2">
                    {activeProject.name}
                    {activeProject.projectNumber && (
                      <span className="text-slate-400 font-normal text-xs">
                        | {activeProject.projectNumber}
                      </span>
                    )}
                  </h1>
                  {activeProject.company && (
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5 uppercase tracking-wide">
                      {activeProject.company}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">

            <button
              onClick={() => {
                if (showReport && activeReportTab === "materials") closeReport();
                else openReportTab("materials");
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                ${
                  showReport && activeReportTab === "materials"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 border-transparent"
                }`}
            >
              <Box className="w-4 h-4" /> Materials
            </button>

            <button
              onClick={() => {
                if (showReport && activeReportTab === "matlab") closeReport();
                else openReportTab("matlab");
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                ${
                  showReport && activeReportTab === "matlab"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 border-transparent"
                }`}
            >
              <Layers className="w-4 h-4" /> Mat+Lab
            </button>

            <button
              onClick={() => {
                if (showReport && activeReportTab === "labor") closeReport();
                else openReportTab("labor");
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                ${
                  showReport && activeReportTab === "labor"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 border-transparent"
                }`}
            >
              <Users className="w-4 h-4" /> Labor
            </button>

            <button
              onClick={() => {
                if (showReport && activeReportTab === "markups") closeReport();
                else openReportTab("markups");
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                ${
                  showReport && activeReportTab === "markups"
                    ? "bg-purple-50 text-purple-700 border-purple-200 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 border-transparent"
                }`}
            >
              <Percent className="w-4 h-4" /> Markups
            </button>

            <div className="h-6 w-px bg-slate-200 mx-2" />

            <button
              onClick={() => {
                if (
                  showReport &&
                  (activeReportTab === "proposal" ||
                    activeReportTab === "bidding")
                )
                  closeReport();
                else openReportTab("proposal");
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                ${
                  showReport &&
                  (activeReportTab === "proposal" ||
                    activeReportTab === "bidding")
                    ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 border-transparent"
                }`}
            >
              <FileText className="w-4 h-4" /> Reports
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <button
              onClick={handleReset}
              className="text-xs font-medium text-slate-500 hover:text-red-600 flex items-center gap-1 px-2"
            >
              <LogOut className="w-3 h-3" /> Exit Project
            </button>
          </div>
        </div>
      </header>

      {/* Error Toast */}
      {state === AppState.ERROR && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-4 shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{error || "An error occurred"}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 ml-4"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <EstimateResult
          assemblies={assemblies}
          onReset={handleReset}
          onAnalyze={handleAnalyze}
          isAnalyzing={state === AppState.ANALYZING}
          viewMode={showReport ? "report" : "project"}
          activeReportTab={activeReportTab}
          setActiveReportTab={setActiveReportTab}
          onCloseReport={closeReport}
          materialCostingData={effectiveCostingData}
          rawTakeoffRows={rawTakeoffRows}
          projectId={projectId}
          finalOutputId={finalOutputId}
          takeoffOutputId={takeoffOutputId}
          onUnitCostChange={handleUnitCostChange}
          onWasteChange={handleWasteChange}
          overrideMap={overrideMap}
          onOverrideMapChange={setOverrideMap}
          onImportComplete={refresh}
          onAssemblySaveComplete={handleAssemblySaveComplete}
        />
      </div>
    </div>
    </ProjectDataProvider>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<ProjectPageSkeleton />}>
      <ProjectContent />
    </Suspense>
  );
}
