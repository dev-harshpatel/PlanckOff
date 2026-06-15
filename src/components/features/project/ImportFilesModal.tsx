'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileUploadZone, FileSlot } from './FileUploadZone';
import { TakeoffPreview } from './TakeoffPreview';
import { AggregatedTakeoff } from '@/types/takeoff';
import { Modal, Button, useToast } from '@/components/ui';
import { usePipeline } from '@/context/PipelineContext';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Check,
  Loader2,
  Minimize2,
  Maximize2,
  RefreshCw,
  Upload,
  FileText,
  TableProperties,
} from "lucide-react";

type Stage = "idle" | "processing" | "done" | "error";

interface ImportFilesModalProps {
  /** Optional: use props instead of context (for backwards compat when rendered with props). */
  isOpen?: boolean;
  onClose?: () => void;
  onComplete?: (data: {
    assemblyResult?: { assemblies: unknown[] };
    excelFile?: File;
    finalResult?: { assemblies?: unknown[] };
    pdfFile: File;
    takeoffData?: AggregatedTakeoff[];
    takeoffResult?: unknown[];
  }) => void;
  projectId?: string;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64 ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export const ImportFilesModal: React.FC<ImportFilesModalProps> = ({
  isOpen: isOpenProp,
  onClose: onCloseProp,
  onComplete: onCompleteProp,
  projectId: projectIdProp,
}) => {
  const toast = useToast();
  const pipeline = usePipeline();

  const useContextMode = isOpenProp === undefined;
  const isOpen = useContextMode ? pipeline.isOpen : (isOpenProp ?? false);
  const projectId = useContextMode ? pipeline.projectId : projectIdProp;
  const onClose = useContextMode ? pipeline.closeImportModal : (onCloseProp ?? (() => {}));
  const getOnComplete = useContextMode ? pipeline.getOnComplete : () => onCompleteProp;
  const [pdfSlot, setPdfSlot] = useState<FileSlot>({ file: null, status: 'empty' });
  const [excelSlot, setExcelSlot] = useState<FileSlot>({ file: null, status: 'empty' });
  const [takeoffData, setTakeoffData] = useState<AggregatedTakeoff[] | null>(null);
  const [excelFileName, setExcelFileName] = useState('');
  const [isParsingExcel, setIsParsingExcel] = useState(false);

  // Pipeline state
  const [stage, setStage] = useState<Stage>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [assemblyCount, setAssemblyCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);

  // Refs for timer & abort
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assemblyResultRef = useRef<{ assemblies: unknown[] } | null>(null);
  const takeoffResultRef = useRef<unknown[] | null>(null);
  const finalResultRef = useRef<{ assemblies?: unknown[] } | null>(null);
  
  // Strategy 1: Store IDs for sequential API calls + retry
  const takeoffOutputIdRef = useRef<string | null>(null);
  const assemblyExtractionIdRef = useRef<string | null>(null);
  const materialMatchIdRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const materialMatchResultRef = useRef<{ assemblies: unknown[] } | null>(null);

  /** Which step failed — used to show targeted retry options. */
  const [failedStep, setFailedStep] = useState<1 | 2 | 3 | null>(null);

  const pdfReady = pdfSlot.status === "ready";
  const excelReady = excelSlot.status === "ready";
  const isProcessing = stage === "processing";

  const [isMinimized, setIsMinimized] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Overwrite confirmation: show when project has existing extraction data
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);

  // Timer effect
  useEffect(() => {
    if (isProcessing) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isProcessing]);

  const handleFileSelected = useCallback(async (file: File, type: 'pdf' | 'excel') => {
    if (type === 'pdf') {
      setPdfSlot({ file, status: 'ready' });
    } else if (type === 'excel') {
      setExcelSlot({ file, status: 'processing' });
      setExcelFileName(file.name);
      setIsParsingExcel(true);

      try {
        const formData = new FormData();
        formData.append('file', file);
        if (projectId) {
          formData.append('projectId', projectId);
        }

        const res = await fetch('/api/parse-takeoff', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to parse Excel file');

        setTakeoffData(json.data.aggregated);
        takeoffOutputIdRef.current = json.takeoffOutputId || null; // Store takeoff ID
        setExcelSlot({ file, status: 'ready' });
        if (Array.isArray(json.warnings) && json.warnings.length > 0) {
          toast.warning("Takeoff Import Warnings", json.warnings.join(" "));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Parse error';
        setExcelSlot({ file, status: 'error', error: message });
        setTakeoffData(null);
      } finally {
        setIsParsingExcel(false);
      }
    }
  }, [projectId]);

  const handleFileRemoved = useCallback((type: 'pdf' | 'excel') => {
    if (type === 'pdf') {
      setPdfSlot({ file: null, status: 'empty' });
    } else {
      setExcelSlot({ file: null, status: 'empty' });
      setTakeoffData(null);
      setExcelFileName('');
    }
  }, []);

  const resetState = useCallback(() => {
    setPdfSlot({ file: null, status: 'empty' });
    setExcelSlot({ file: null, status: 'empty' });
    setTakeoffData(null);
    setExcelFileName('');
    setStage('idle');
    setStatusMessage('');
    setElapsedSeconds(0);
    setErrorMessage('');
    setAssemblyCount(0);
    setMatchedCount(0);
    setShowOverwriteModal(false);
    setIsCheckingExisting(false);
    setIsMinimized(false);
    assemblyResultRef.current = null;
    takeoffResultRef.current = null;
    finalResultRef.current = null;
    takeoffOutputIdRef.current = null;
    assemblyExtractionIdRef.current = null;
    materialMatchIdRef.current = null;
    runIdRef.current = null;
    materialMatchResultRef.current = null;
    setFailedStep(null);
    pipeline.resetProgress();
  }, [pipeline]);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStage('error');
    setErrorMessage('Processing cancelled');
  }, []);

  // Sequential API calls with run tracking and per-step retry
  const runFullPipeline = useCallback(async (fromStep: 1 | 2 | 3 = 1) => {
    if (fromStep === 1 && (!pdfReady || !pdfSlot.file)) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const pipelineStartTime = Date.now();
    setStage("processing");
    setFailedStep(null);

    // Track which step is currently running so the catch block can report it
    let lastAttemptedStep: 0 | 1 | 2 | 3 = 0;

    // Reuse existing runId on retry, create new one for fresh runs
    let currentRunId = fromStep > 1 ? runIdRef.current : null;

    try {
      let localAssemblyCount = assemblyCount; // capture for summary (updated during step 1)

      // Create a pipeline run record for fresh starts
      if (!currentRunId) {
        try {
          const runRes = await fetch("/api/pipeline-runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
            signal: controller.signal,
          });
          if (runRes.ok) {
            const runJson = await runRes.json() as { runId?: string };
            currentRunId = runJson.runId ?? null;
            runIdRef.current = currentRunId;
          }
        } catch {
          // Run tracking is non-critical — proceed without it
        }
      }

      let extractionId: string | null = assemblyExtractionIdRef.current;

      // ── Step 1: Extract ──────────────────────────────────────────────────
      if (fromStep <= 1) {
        lastAttemptedStep = 1;
        pipeline.setProgress(currentRunId, 1, "running");
        setStatusMessage("Step 1/3: Extracting assemblies from PDF...");

        const pdfBase64 = await fileToBase64(pdfSlot.file!);

        const extractRes = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfBase64,
            projectId: projectId ?? undefined,
            runId: currentRunId,
          }),
          signal: controller.signal,
        });
        if (!extractRes.ok) {
          const err = await extractRes.json() as { error?: string };
          throw new Error(err.error ?? `Extraction failed (${extractRes.status})`);
        }
        const extractJson = await extractRes.json() as {
          extractionId?: string;
          assemblyCount?: number;
          result?: { assemblies: unknown[] };
        };
        extractionId = extractJson.extractionId ?? null;
        assemblyExtractionIdRef.current = extractionId;
        const extractedCount = extractJson.assemblyCount ?? 0;
        localAssemblyCount = extractedCount;
        setAssemblyCount(extractedCount);
        assemblyResultRef.current = extractJson.result ?? null;
        console.log(`[ImportFiles] Step 1 done: ${extractedCount} assemblies`);
      }

      // ── Step 2: Match ────────────────────────────────────────────────────
      if (fromStep <= 2) {
        lastAttemptedStep = 2;
        pipeline.setProgress(currentRunId, 2, "running");
        setStatusMessage("Step 2/3: Matching materials to database...");

        const matchRes = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extraction: assemblyResultRef.current,
            extractionId,
            projectId: projectId ?? undefined,
            runId: currentRunId,
          }),
          signal: controller.signal,
        });
        if (!matchRes.ok) {
          const err = await matchRes.json() as { error?: string };
          throw new Error(err.error ?? `Material matching failed (${matchRes.status})`);
        }
        const matchJson = await matchRes.json() as {
          matchId?: string;
          matchedCount?: number;
          result?: { assemblies: unknown[] };
        };
        materialMatchIdRef.current = matchJson.matchId ?? null;
        materialMatchResultRef.current = matchJson.result ?? null;
        setMatchedCount(matchJson.matchedCount ?? 0);
        console.log(`[ImportFiles] Step 2 done: ${matchJson.matchedCount ?? 0} matched`);
      }

      // ── Step 3: Finalize ─────────────────────────────────────────────────
      lastAttemptedStep = 3;
      pipeline.setProgress(currentRunId, 3, "running");
      setStatusMessage("Step 3/3: Finalizing assemblies with takeoff data...");

      const finalizeRes = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialMatch: materialMatchResultRef.current,
          projectId: projectId ?? undefined,
          assemblyExtractionId: extractionId,
          takeoffOutputId: takeoffOutputIdRef.current,
          runId: currentRunId,
        }),
        signal: controller.signal,
      });
      if (!finalizeRes.ok) {
        const err = await finalizeRes.json() as { error?: string };
        throw new Error(err.error ?? `Finalization failed (${finalizeRes.status})`);
      }
      const finalizeJson = await finalizeRes.json() as {
        result?: { assemblies?: unknown[] };
      };
      const finalCount = finalizeJson.result?.assemblies?.length ?? 0;
      finalResultRef.current = finalizeJson.result ?? null;
      console.log(`[ImportFiles] Step 3 done: ${finalCount} final assemblies`);

      const totalTime = ((Date.now() - pipelineStartTime) / 1000).toFixed(2);
      console.log(`[ImportFiles] Pipeline complete in ${totalTime}s`);

      pipeline.setProgress(currentRunId, 3, "complete");
      setStage("done");
      const summaryParts: string[] = [`${localAssemblyCount} assemblies`, `${finalCount} final assemblies`];
      setStatusMessage(`Complete! ${summaryParts.join(", ")}.`);
      toast.success("Pipeline Complete", `${localAssemblyCount} assemblies, ${finalCount} final output.`);

    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStage("error");
        setErrorMessage("Processing cancelled");
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[ImportFiles] Pipeline error:", message);
      if (lastAttemptedStep > 0) {
        setFailedStep(lastAttemptedStep as 1 | 2 | 3);
        pipeline.setProgress(currentRunId, lastAttemptedStep, "failed", message);
      }
      setStage("error");
      setErrorMessage(message);
    }
  }, [pdfReady, pdfSlot.file, projectId, pipeline, toast, assemblyCount]); // assemblyCount used as initial value for localAssemblyCount

  const handleRetry = useCallback((fromStep: 1 | 2 | 3) => {
    runFullPipeline(fromStep);
  }, [runFullPipeline]);

  const handleContinue = useCallback(async () => {
    if (!pdfReady || !pdfSlot.file || !excelReady || !excelSlot.file) return;

    // If project has existing data, show overwrite confirmation
    if (projectId) {
      setIsCheckingExisting(true);
      try {
        const res = await fetch(`/api/assembly-data?projectId=${projectId}`);
        const data = await res.json() as { success?: boolean; hasExtraction?: boolean; hasData?: boolean };
        if (data.success && (data.hasExtraction ?? data.hasData)) {
          setShowOverwriteModal(true);
          setIsCheckingExisting(false);
          return;
        }
      } catch {
        // Proceed if check fails
      }
      setIsCheckingExisting(false);
    }

    await runFullPipeline(1);
  }, [pdfReady, pdfSlot.file, excelReady, excelSlot.file, projectId, runFullPipeline]);

  const handleOverwriteConfirm = useCallback(async () => {
    if (!projectId) return;
    setShowOverwriteModal(false);
    try {
      // Delete previous assembly/final_output data
      const res = await fetch(`/api/assembly-data?projectId=${projectId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete previous data");
      }
      // Clear all project-level material overrides (unit costs, formulas, MOUs) so
      // stale overrides from the old pipeline run don't bleed into the new one.
      await fetch(`/api/projects/${projectId}/material-overrides`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await runFullPipeline(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setStage('error');
      setErrorMessage(message);
    }
  }, [projectId, runFullPipeline]);

  const handleOverwriteCancel = useCallback(() => {
    setShowOverwriteModal(false);
  }, []);

  const handleDoneClose = () => {
    if (pdfSlot.file) {
      const cb = getOnComplete();
      cb?.({
        assemblyResult: assemblyResultRef.current ?? undefined,
        excelFile: excelSlot.file ?? undefined,
        finalResult: finalResultRef.current ?? undefined,
        pdfFile: pdfSlot.file,
        takeoffData: takeoffData ?? undefined,
        takeoffResult: takeoffResultRef.current ?? undefined,
      });
    }
    resetState();
    if (useContextMode) pipeline.closeImportModal();
  };

  const handleClose = () => {
    if (isProcessing) return; // prevent close during processing
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    onClose();
    resetState();
  };

  const handleMinimize = useCallback(() => setIsMinimized(true), []);
  const handleExpand = useCallback(() => setIsMinimized(false), []);

  const renderProcessingView = () => (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </div>
      <p className="text-base font-semibold text-slate-800 mb-1.5">{statusMessage}</p>
      <p className="text-sm text-slate-400 tabular-nums font-mono">
        {formatElapsed(elapsedSeconds)}
      </p>
      <div className="mt-8 flex gap-3">
        <Button
          variant="secondary"
          icon={Minimize2}
          onClick={handleMinimize}
          size="sm"
        >
          Minimize
        </Button>
        <button
          onClick={handleCancel}
          className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderMinimizedBar = () => (
    <div
      className="fixed bottom-4 right-4 z-[10000] flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-blue-600" />
      <span className="text-sm font-medium text-slate-700">
        Processing... {formatElapsed(elapsedSeconds)}
      </span>
      <Button
        variant="secondary"
        icon={Maximize2}
        onClick={handleExpand}
        size="sm"
      >
        Expand
      </Button>
      <button
        onClick={handleCancel}
        className="text-xs text-red-600 hover:text-red-700"
      >
        Cancel
      </button>
    </div>
  );

  const renderDoneView = () => (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
      </div>
      <p className="text-base font-semibold text-slate-800 mb-1.5">{statusMessage}</p>
      <p className="text-sm text-slate-400">Completed in <span className="font-mono">{formatElapsed(elapsedSeconds)}</span></p>
      <Button
        variant="primary"
        onClick={handleDoneClose}
        size="sm"
        className="mt-8"
      >
        Close & Apply
      </Button>

      {/* Dev-only JSON inspector — not shown in production */}
      {process.env.NODE_ENV === "development" && (
        <div className="mt-6 w-full max-w-lg">
          <button
            onClick={() => setShowDebugPanel((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
          >
            {showDebugPanel ? "Hide" : "Show"} debug output
          </button>
          {showDebugPanel && (
            <div className="mt-3 flex flex-col gap-3">
              {[
                { label: "Step 1 — Extraction", data: assemblyResultRef.current },
                { label: "Step 2 — Material Match", data: materialMatchResultRef.current },
                { label: "Step 3 — Final Output", data: finalResultRef.current },
              ].map(({ label, data }) => (
                <div key={label} className="text-left">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {label}
                  </p>
                  <pre className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto max-h-40">
                    {data ? JSON.stringify(data, null, 2).slice(0, 2000) : "—"}
                    {data && JSON.stringify(data).length > 2000 ? "\n…(truncated)" : ""}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderErrorView = () => (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <p className="text-base font-semibold text-slate-800 mb-1.5">Processing Failed</p>
      <p className="text-sm text-red-600 text-center max-w-md">{errorMessage}</p>

      {/* Retry options based on which step failed */}
      {failedStep !== null && errorMessage !== "Processing cancelled" && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500 mb-1">Retry options:</p>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {failedStep === 1 && pdfReady && (
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={() => handleRetry(1)}
              >
                Retry from Step 1 (Extract)
              </Button>
            )}
            {failedStep === 2 && assemblyExtractionIdRef.current && (
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={() => handleRetry(2)}
              >
                Retry from Step 2 (Match)
              </Button>
            )}
            {failedStep === 3 && materialMatchResultRef.current && (
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={() => handleRetry(3)}
              >
                Retry from Step 3 (Finalize)
              </Button>
            )}
            {failedStep > 1 && pdfReady && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRetry(1)}
              >
                Restart from beginning
              </Button>
            )}
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        onClick={handleClose}
        size="sm"
        className="mt-6"
      >
        Close
      </Button>
    </div>
  );

  const showMinimized = isMinimized && isProcessing;

  const steps: { label: string; stage: Stage | 'upload' }[] = [
    { label: 'Upload', stage: 'upload' },
    { label: 'Process', stage: 'processing' },
    { label: 'Done', stage: 'done' },
  ];
  const activeStepIndex =
    stage === 'idle' ? 0 :
    stage === 'processing' ? 1 :
    stage === 'done' ? 2 :
    stage === 'error' ? 1 : 0;

  return (
    <Modal
      isOpen={isOpen}
      minimized={showMinimized}
      onClose={isProcessing ? () => {} : handleClose}
      size="2xl"
    >
      {showMinimized ? (
        renderMinimizedBar()
      ) : (
        <div className="flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-white to-slate-50/40">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 leading-none">Import Project Files</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Upload Wall Spec PDF and Takeoff Excel to process assemblies.
                  </p>
                </div>
              </div>
              {/* Step indicator */}
              <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                {steps.map((step, idx) => {
                  const isActive = idx === activeStepIndex;
                  const isComplete = idx < activeStepIndex;
                  const isError = stage === 'error' && idx === 1;
                  return (
                    <React.Fragment key={step.label}>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          isError ? 'bg-red-100 border border-red-300 text-red-500' :
                          isComplete ? 'bg-emerald-100 border border-emerald-300 text-emerald-600' :
                          isActive ? 'bg-emerald-600 text-white' :
                          'bg-slate-100 border border-slate-200 text-slate-400'
                        }`}>
                          {isComplete ? <Check className="w-3 h-3" /> : idx + 1}
                        </div>
                        <span className={`text-xs font-medium ${
                          isActive ? 'text-slate-700' : isComplete ? 'text-emerald-600' : 'text-slate-400'
                        }`}>{step.label}</span>
                      </div>
                      {idx < steps.length - 1 && (
                        <ArrowRight className={`w-3 h-3 flex-shrink-0 ${isComplete ? 'text-emerald-300' : 'text-slate-200'}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {stage === 'idle' && showOverwriteModal && (
              <div className="flex flex-col items-center justify-center py-14 px-6">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-5">
                  <AlertCircle className="w-6 h-6 text-amber-500" />
                </div>
                <p className="text-base font-semibold text-slate-800 mb-1.5 text-center">
                  Existing data found
                </p>
                <p className="text-sm text-slate-500 text-center max-w-sm mb-8">
                  This project already has assembly data. Overwriting will replace all previous extraction results.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={handleOverwriteCancel}
                    size="sm"
                  >
                    Keep existing
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleOverwriteConfirm}
                    size="sm"
                  >
                    Overwrite & continue
                  </Button>
                </div>
              </div>
            )}
            {stage === 'idle' && !showOverwriteModal && (
              <>
                <FileUploadZone
                  pdfSlot={pdfSlot}
                  excelSlot={excelSlot}
                  onFileSelected={handleFileSelected}
                  onFileRemoved={handleFileRemoved}
                  disabled={isParsingExcel}
                />

                {isParsingExcel && (
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                    <p className="text-sm text-blue-700 font-medium">Parsing Excel takeoff data…</p>
                  </div>
                )}

                {takeoffData && takeoffData.length > 0 && (
                  <TakeoffPreview data={takeoffData} fileName={excelFileName} />
                )}

                {!pdfSlot.file && !excelSlot.file && (
                  <div className="flex items-center gap-6 px-5 py-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                    <div className="flex items-center gap-2.5 text-slate-400 flex-1">
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs">Wall Spec PDF</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                    <div className="flex items-center gap-2.5 text-slate-400 flex-1">
                      <TableProperties className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs">Takeoff Excel</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                    <div className="flex items-center gap-2.5 text-slate-400 flex-1">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs">Final Assemblies</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {stage === "processing" && !isMinimized && renderProcessingView()}
            {stage === "done" && renderDoneView()}
            {stage === "error" && renderErrorView()}
          </div>

          {/* Footer — only shown during idle stage, hidden when overwrite modal is shown */}
          {stage === 'idle' && !showOverwriteModal && (
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  pdfReady && excelReady ? 'bg-emerald-400' :
                  pdfReady || excelReady ? 'bg-amber-400' :
                  'bg-slate-300'
                }`} />
                <p className="text-xs text-slate-500">
                  {pdfReady && excelReady
                    ? "Both files ready — click Continue to process."
                    : pdfReady
                      ? "PDF ready. Upload Takeoff Excel to continue."
                      : excelReady
                        ? "Excel ready. Upload Wall Spec PDF to continue."
                        : "Upload both files to continue."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={handleClose} size="sm" disabled={isParsingExcel}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={isParsingExcel || isCheckingExisting ? Loader2 : ArrowRight}
                  iconPosition="right"
                  onClick={handleContinue}
                  disabled={
                    !pdfReady ||
                    !excelReady ||
                    isParsingExcel ||
                    isCheckingExisting
                  }
                  size="sm"
                >
                  {isParsingExcel
                    ? "Parsing Excel…"
                    : isCheckingExisting
                      ? "Checking…"
                      : "Continue"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
