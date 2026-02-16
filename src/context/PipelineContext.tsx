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

interface PipelineContextValue {
  isOpen: boolean;
  projectId: string | undefined;
  openImportModal: (projectId: string | undefined, onComplete?: PipelineCompleteCallback) => void;
  closeImportModal: () => void;
  getOnComplete: () => PipelineCompleteCallback | undefined;
}

const PipelineContext = createContext<PipelineContextValue | undefined>(
  undefined,
);

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const onCompleteRef = useRef<PipelineCompleteCallback | undefined>(undefined);

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

  const value: PipelineContextValue = {
    isOpen,
    projectId,
    openImportModal,
    closeImportModal,
    getOnComplete,
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
