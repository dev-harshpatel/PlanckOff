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
  Loader2,
  Minimize2,
  Maximize2,
  Upload,
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
  
  // Strategy 1: Store IDs for sequential API calls
  const takeoffOutputIdRef = useRef<string | null>(null);
  const assemblyExtractionIdRef = useRef<string | null>(null);
  const materialMatchIdRef = useRef<string | null>(null);

  const pdfReady = pdfSlot.status === "ready";
  const excelReady = excelSlot.status === "ready";
  const isProcessing = stage === "processing";

  const [isMinimized, setIsMinimized] = useState(false);

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
  }, []);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStage('error');
    setErrorMessage('Processing cancelled');
  }, []);

  // Strategy 1: Sequential API calls instead of single process-pipeline
  const runFullPipeline = useCallback(async () => {
    if (!pdfReady || !pdfSlot.file || !excelReady || !excelSlot.file) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const pipelineStartTime = Date.now();
    console.log("\n" + "=".repeat(70));
    console.log("[ImportFiles] 🚀 Starting SEQUENTIAL PIPELINE (Strategy 1 + Strategy 2)");
    console.log("[ImportFiles] ⚡ Optimized: Split into 3 steps with reduced batch sizes");
    console.log("=".repeat(70));

    try {
      setStage("processing");
      
      const [pdfBase64] = await Promise.all([
        fileToBase64(pdfSlot.file),
      ]);

      // Step 1: Extract assemblies from PDF
      const step1Start = Date.now();
      setStatusMessage("Step 1/3: Extracting assemblies from PDF...");
      console.log(`\n[ImportFiles] 📄 Step 1/3: Extracting assemblies from PDF...`);
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          projectId: projectId ?? undefined,
        }),
        signal: controller.signal,
      });
      if (!extractRes.ok) {
        const err = await extractRes.json();
        throw new Error(err.error || `Extraction failed (${extractRes.status})`);
      }
      const extractJson = await extractRes.json();
      const extractionId = extractJson.extractionId;
      assemblyExtractionIdRef.current = extractionId;
      const assemblyCount = extractJson.assemblyCount ?? 0;
      setAssemblyCount(assemblyCount);
      assemblyResultRef.current = extractJson.result ?? null;
      const step1Time = ((Date.now() - step1Start) / 1000).toFixed(2);
      console.log(`[ImportFiles] ✅ Step 1 complete: ${assemblyCount} assemblies extracted in ${step1Time}s`);

      // Step 2: Match materials (already have takeoff parsed, now match materials)
      const step2Start = Date.now();
      setStatusMessage("Step 2/3: Matching materials to database...");
      console.log(`\n[ImportFiles] 🔍 Step 2/3: Matching materials to database...`);
      const matchRes = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction: extractJson.result,
          extractionId,
          projectId: projectId ?? undefined,
        }),
        signal: controller.signal,
      });
      if (!matchRes.ok) {
        const err = await matchRes.json();
        throw new Error(err.error || `Material matching failed (${matchRes.status})`);
      }
      const matchJson = await matchRes.json();
      materialMatchIdRef.current = matchJson.matchId;
      const matchedCount = matchJson.matchedCount ?? 0;
      setMatchedCount(matchedCount);
      const step2Time = ((Date.now() - step2Start) / 1000).toFixed(2);
      console.log(`[ImportFiles] ✅ Step 2 complete: ${matchedCount} assemblies matched in ${step2Time}s`);

      // Step 3: Finalize (combine match + takeoff)
      const step3Start = Date.now();
      setStatusMessage("Step 3/3: Finalizing assemblies with takeoff data...");
      console.log(`\n[ImportFiles] 🎯 Step 3/3: Finalizing assemblies with takeoff data...`);
      const finalizeRes = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialMatch: matchJson.result,
          projectId: projectId ?? undefined,
          assemblyExtractionId: extractionId,
          takeoffOutputId: takeoffOutputIdRef.current,
        }),
        signal: controller.signal,
      });
      if (!finalizeRes.ok) {
        const err = await finalizeRes.json();
        throw new Error(err.error || `Finalization failed (${finalizeRes.status})`);
      }
      const finalizeJson = await finalizeRes.json();
      const finalCount = finalizeJson.result?.assemblies?.length ?? 0;
      finalResultRef.current = finalizeJson.result ?? null;
      const step3Time = ((Date.now() - step3Start) / 1000).toFixed(2);
      console.log(`[ImportFiles] ✅ Step 3 complete: ${finalCount} final assemblies in ${step3Time}s`);

      // Get takeoff count from parsed data
      const takeoffCount = takeoffResultRef.current?.length ?? 0;
      const totalTime = ((Date.now() - pipelineStartTime) / 1000).toFixed(2);

      console.log("\n" + "=".repeat(70));
      console.log(`[ImportFiles] 🎉 SEQUENTIAL PIPELINE COMPLETE`);
      console.log(`[ImportFiles] ⏱️  Total time: ${totalTime}s`);
      console.log(`[ImportFiles]    Step 1 (Extract): ${step1Time}s`);
      console.log(`[ImportFiles]    Step 2 (Match):   ${step2Time}s`);
      console.log(`[ImportFiles]    Step 3 (Finalize): ${step3Time}s`);
      console.log(`[ImportFiles] 📊 Results: ${assemblyCount} assemblies → ${matchedCount} matched → ${finalCount} final`);
      console.log("=".repeat(70) + "\n");

      setStage("done");
      setStatusMessage(
        `Complete! ${assemblyCount} assemblies, ${takeoffCount} takeoff rows, ${finalCount} final assemblies.`,
      );
      toast.success("Pipeline Complete", `${assemblyCount} assemblies, ${finalCount} final output.`);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStage("error");
        setErrorMessage("Processing cancelled");
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[ImportFiles] Pipeline error:", message);
      setStage("error");
      setErrorMessage(message);
    }
  }, [pdfReady, pdfSlot.file, excelReady, excelSlot.file, projectId, toast]);

  const handleContinue = useCallback(async () => {
    if (!pdfReady || !pdfSlot.file || !excelReady || !excelSlot.file) return;

    // If project has existing data, show overwrite confirmation
    if (projectId) {
      setIsCheckingExisting(true);
      try {
        const res = await fetch(`/api/assembly-data?projectId=${projectId}`);
        const data = await res.json();
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

    await runFullPipeline();
  }, [pdfReady, pdfSlot.file, projectId, runFullPipeline]);

  const handleOverwriteConfirm = useCallback(async () => {
    if (!projectId) return;
    setShowOverwriteModal(false);
    try {
      const res = await fetch(`/api/assembly-data?projectId=${projectId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete previous data");
      }
      await runFullPipeline();
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
      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
      <p className="text-lg font-semibold text-slate-800 mb-2">{statusMessage}</p>
      <p className="text-sm text-slate-500 tabular-nums">
        {formatElapsed(elapsedSeconds)}
      </p>
      <div className="mt-6 flex gap-3">
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
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
      </div>
      <p className="text-lg font-semibold text-slate-800 mb-2">{statusMessage}</p>
      <p className="text-sm text-slate-500">Completed in {formatElapsed(elapsedSeconds)}</p>
      <Button
        variant="primary"
        onClick={handleDoneClose}
        size="sm"
        className="mt-6"
      >
        Close
      </Button>
    </div>
  );

  const renderErrorView = () => (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <p className="text-lg font-semibold text-slate-800 mb-2">Processing Failed</p>
      <p className="text-sm text-red-600 text-center max-w-md">{errorMessage}</p>
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

  return (
    <Modal
      isOpen={isOpen}
      minimized={showMinimized}
      onClose={isProcessing ? () => {} : handleClose}
      size="lg"
    >
      {showMinimized ? (
        renderMinimizedBar()
      ) : (
        <div className="flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-600" />
            Import Project Files
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload Wall Spec PDF and Takeoff Excel to process and generate final assemblies.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {stage === 'idle' && showOverwriteModal && (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <p className="text-base font-medium text-slate-800 mb-6 text-center">
                This project already has assembly data. Please select one of the options below.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={handleOverwriteCancel}
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleOverwriteConfirm}
                  size="sm"
                >
                  Overwrite all previous data
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

              {takeoffData && takeoffData.length > 0 && (
                <TakeoffPreview data={takeoffData} fileName={excelFileName} />
              )}

              {!pdfSlot.file && !excelSlot.file && (
                <div className="text-center py-2">
                  <p className="text-xs text-slate-400">
                    Drag and drop files, or upload them one at a time.
                  </p>
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
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="text-xs text-slate-500">
              {pdfSlot.file && excelSlot.file
                ? "PDF and Excel uploaded. Ready to process."
                : "Upload both Wall Spec PDF and Takeoff Excel to continue."}
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
                  ? "Parsing Excel..."
                  : isCheckingExisting
                    ? "Checking..."
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
