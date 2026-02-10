'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileUploadZone, FileSlot } from './FileUploadZone';
import { TakeoffPreview } from './TakeoffPreview';
import { AggregatedTakeoff } from '@/types/takeoff';
import { Modal, Button, useToast } from '@/components/ui';
import { Upload, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

type Stage = 'idle' | 'extracting' | 'matching' | 'done' | 'error';

interface ImportFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: {
    pdfFile: File;
    excelFile?: File;
    takeoffData?: AggregatedTakeoff[];
    extractionResult?: { assemblies: unknown[] };
    matchResult?: { assemblies: unknown[] };
  }) => void;
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
  isOpen,
  onClose,
  onComplete,
}) => {
  const toast = useToast();
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
  const extractionResultRef = useRef<{ assemblies: unknown[] } | null>(null);
  const matchResultRef = useRef<{ assemblies: unknown[] } | null>(null);

  const pdfReady = pdfSlot.status === 'ready';
  const isProcessing = stage === 'extracting' || stage === 'matching';

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

        const res = await fetch('/api/parse-takeoff', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to parse Excel file');

        setTakeoffData(json.data.aggregated);
        setExcelSlot({ file, status: 'ready' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Parse error';
        setExcelSlot({ file, status: 'error', error: message });
        setTakeoffData(null);
      } finally {
        setIsParsingExcel(false);
      }
    }
  }, []);

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
    extractionResultRef.current = null;
    matchResultRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStage('error');
    setErrorMessage('Processing cancelled');
  }, []);

  const handleContinue = async () => {
    if (!pdfReady || !pdfSlot.file) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Stage 1: Extract
      setStage('extracting');
      setStatusMessage('Extracting assemblies from PDF...');

      const pdfBase64 = await fileToBase64(pdfSlot.file);

      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
        signal: controller.signal,
      });

      const extractJson = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractJson.error || `Extract failed (${extractRes.status})`);

      const count = extractJson.assemblyCount ?? extractJson.result?.assemblies?.length ?? 0;
      const extractionId = extractJson.extractionId;
      setAssemblyCount(count);
      extractionResultRef.current = extractJson.result;

      // Stage 2: Match
      setStage('matching');
      setStatusMessage(`Matching ${count} assemblies to material database...`);

      const matchRes = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          extraction: extractJson.result,
          extractionId: extractionId,
        }),
        signal: controller.signal,
      });

      const matchJson = await matchRes.json();
      if (!matchRes.ok) throw new Error(matchJson.error || `Match failed (${matchRes.status})`);

      const matched = matchJson.matchedCount ?? matchJson.result?.assemblies?.length ?? 0;
      setMatchedCount(matched);
      matchResultRef.current = matchJson.result;

      // Done
      setStage('done');
      setStatusMessage(`Wall assemblies matched! ${count} assemblies extracted, ${matched} matched.`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setStage('error');
        setErrorMessage('Processing cancelled');
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[ImportFiles] Pipeline error:', message);
      setStage('error');
      setErrorMessage(message);
    }
  };

  const handleDoneClose = () => {
    if (pdfSlot.file) {
      onComplete({
        pdfFile: pdfSlot.file,
        excelFile: excelSlot.file || undefined,
        takeoffData: takeoffData || undefined,
        extractionResult: extractionResultRef.current || undefined,
        matchResult: matchResultRef.current || undefined,
      });
    }
    resetState();
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

  // Render processing/done/error views
  const renderProcessingView = () => (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
      <p className="text-lg font-semibold text-slate-800 mb-2">{statusMessage}</p>
      <p className="text-sm text-slate-500 tabular-nums">{formatElapsed(elapsedSeconds)}</p>
      <button
        onClick={handleCancel}
        className="mt-6 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
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

  return (
    <Modal isOpen={isOpen} onClose={isProcessing ? () => {} : handleClose} size="lg">
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-600" />
            Import Project Files
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload your Wall Spec PDF to extract and match assemblies. Takeoff Schedule (.xlsx) is optional.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {stage === 'idle' && (
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

          {(stage === 'extracting' || stage === 'matching') && renderProcessingView()}
          {stage === 'done' && renderDoneView()}
          {stage === 'error' && renderErrorView()}
        </div>

        {/* Footer — only shown during idle stage */}
        {stage === 'idle' && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="text-xs text-slate-500">
              {pdfSlot.file
                ? excelSlot.file
                  ? 'PDF and Excel uploaded. Ready to continue.'
                  : 'PDF uploaded. Ready to extract assemblies.'
                : 'Upload a Wall Spec PDF to continue.'
              }
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={handleClose} size="sm" disabled={isParsingExcel}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={isParsingExcel ? Loader2 : ArrowRight}
                iconPosition="right"
                onClick={handleContinue}
                disabled={!pdfReady || isParsingExcel}
                size="sm"
              >
                {isParsingExcel ? 'Parsing Excel...' : 'Continue'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
