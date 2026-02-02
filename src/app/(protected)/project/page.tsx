"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeftRight,
  Box,
  Briefcase,
  FileText,
  LogOut,
  Percent,
  Users,
  Loader2,
} from "lucide-react";
import { AppState, ProjectSummary, WallAssembly } from "@/types";
import { EstimateResult } from "@/components/features/project/EstimateResult";
import { identifyWallAssemblies } from "@/services/gemini/client";
import { useApp } from "@/context/AppContext";

function ProjectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  const { materials, setMaterials } = useApp();

  const [state, setState] = useState<AppState>(AppState.ESTIMATING);
  const [assemblies, setAssemblies] = useState<WallAssembly[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<
    "proposal" | "bidding" | "markups" | "materials" | "labor"
  >("proposal");
  const [displayUnit, setDisplayUnit] = useState<"imperial" | "metric">(
    "imperial"
  );

  const [activeProject, setActiveProject] = useState<ProjectSummary>({
    id: projectId || `new-${Date.now()}`,
    name: "Loading...",
    company: "",
    status: "Working Project Progress",
    dueDate: "TBD",
    projectNumber: "",
  });
  const [isLoadingProject, setIsLoadingProject] = useState(true);

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
            materials
          );
          setAssemblies((prev) => [...prev, ...detectedAssemblies]);
          setState(AppState.ESTIMATING);
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : "Failed to identify wall types.";
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

  const handleReset = () => {
    router.push("/dashboard");
  };

  return (
    <div className="h-full flex flex-col">
      {/* Project View Header */}
      <header className="sticky top-0 bg-white border-b border-slate-200 flex-none z-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"
            >
              <Briefcase className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              {isLoadingProject ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  <span className="text-sm text-slate-400">Loading project...</span>
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
              onClick={() =>
                setDisplayUnit((u) =>
                  u === "imperial" ? "metric" : "imperial"
                )
              }
              className="text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2 text-slate-600 hover:bg-slate-50 border-slate-200 bg-white shadow-sm"
              title="Toggle measurement units for reports"
            >
              <ArrowLeftRight className="w-4 h-4" />
              {displayUnit === "imperial" ? "Imperial" : "Metric"}
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <button
              onClick={() => {
                if (showReport && activeReportTab === "materials") {
                  setShowReport(false);
                } else {
                  setShowReport(true);
                  setActiveReportTab("materials");
                }
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
                if (showReport && activeReportTab === "labor") {
                  setShowReport(false);
                } else {
                  setShowReport(true);
                  setActiveReportTab("labor");
                }
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
                if (showReport && activeReportTab === "markups") {
                  setShowReport(false);
                } else {
                  setShowReport(true);
                  setActiveReportTab("markups");
                }
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
                ) {
                  setShowReport(false);
                } else {
                  setShowReport(true);
                  setActiveReportTab("proposal");
                }
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
          materials={materials}
          onUpdateMaterials={setMaterials}
          onAnalyze={handleAnalyze}
          isAnalyzing={state === AppState.ANALYZING}
          viewMode="project"
          displayUnit={displayUnit}
          activeReportTab={activeReportTab}
          setActiveReportTab={setActiveReportTab}
          onCloseReport={() => setShowReport(false)}
        />
      </div>
    </div>
  );
}

function ProjectLoading() {
  return (
    <div className="h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<ProjectLoading />}>
      <ProjectContent />
    </Suspense>
  );
}
