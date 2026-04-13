"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { AggregatedTakeoff } from "@/types/takeoff";

export interface PipelineCompleteData {
  assemblyResult?: { assemblies: unknown[] };
  excelFile?: File;
  finalResult?: { assemblies?: unknown[] };
  pdfFile: File;
  takeoffData?: AggregatedTakeoff[];
  takeoffResult?: unknown[];
}

type PipelineCompleteCallback = (data: PipelineCompleteData) => void;

export type PipelineStatus = "idle" | "running" | "complete" | "failed";

interface PipelineContextValue {
  isOpen: boolean;
  projectId: string | undefined;
  /** The current pipeline run ID — set when a run starts, cleared on close. */
  runId: string | null;
  /** 0=none, 1=extract, 2=match, 3=finalize */
  step: 0 | 1 | 2 | 3;
  status: PipelineStatus;
  error: string | null;
  openImportModal: (projectId: string | undefined, onComplete?: PipelineCompleteCallback) => void;
  closeImportModal: () => void;
  getOnComplete: () => PipelineCompleteCallback | undefined;
  /** Called by ImportFilesModal at each step transition to record progress. */
  setProgress: (runId: string | null, step: 0 | 1 | 2 | 3, status: PipelineStatus, error?: string | null) => void;
  /** Reset run-tracking state (called when the modal is reopened for a fresh run). */
  resetProgress: () => void;
}

const PipelineContext = createContext<PipelineContextValue | undefined>(
  undefined,
);

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const onCompleteRef = useRef<PipelineCompleteCallback | undefined>(undefined);

  // Run-tracking state
  const [runId, setRunId] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const openImportModal = useCallback(
    (pid: string | undefined, onComplete?: PipelineCompleteCallback) => {
      onCompleteRef.current = onComplete;
      setProjectId(pid);
      setIsOpen(true);
    },
    [],
  );

  const closeImportModal = useCallback(() => {
    setIsOpen(false);
    setProjectId(undefined);
    onCompleteRef.current = undefined;
  }, []);

  const getOnComplete = useCallback(() => onCompleteRef.current, []);

  const setProgress = useCallback(
    (
      rid: string | null,
      s: 0 | 1 | 2 | 3,
      st: PipelineStatus,
      err?: string | null,
    ) => {
      if (rid !== null) setRunId(rid);
      setStep(s);
      setStatus(st);
      setError(err ?? null);
    },
    [],
  );

  const resetProgress = useCallback(() => {
    setRunId(null);
    setStep(0);
    setStatus("idle");
    setError(null);
  }, []);

  const value: PipelineContextValue = {
    isOpen,
    projectId,
    runId,
    step,
    status,
    error,
    openImportModal,
    closeImportModal,
    getOnComplete,
    setProgress,
    resetProgress,
  };

  return (
    <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>
  );
}

export function usePipeline() {
  const context = useContext(PipelineContext);
  if (context === undefined) {
    throw new Error("usePipeline must be used within a PipelineProvider");
  }
  return context;
}
