'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export interface FileSlot {
  file: File | null;
  status: 'empty' | 'ready' | 'processing' | 'error';
  error?: string;
}

interface FileUploadZoneProps {
  pdfSlot: FileSlot;
  excelSlot: FileSlot;
  onFileSelected: (file: File, type: 'pdf' | 'excel') => void;
  onFileRemoved: (type: 'pdf' | 'excel') => void;
  disabled?: boolean;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  pdfSlot,
  excelSlot,
  onFileSelected,
  onFileRemoved,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectFileType = (file: File): 'pdf' | 'excel' | null => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel';
    return null;
  };

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const type = detectFileType(file);
      if (type) {
        onFileSelected(file, type);
      }
    }
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const StatusIcon = ({ status }: { status: FileSlot['status'] }) => {
    switch (status) {
      case 'ready': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'processing': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragOver
            ? 'border-emerald-400 bg-emerald-50'
            : 'border-slate-300 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/50'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div className={`
            w-12 h-12 rounded-full flex items-center justify-center
            ${isDragOver ? 'bg-emerald-100' : 'bg-slate-100'}
            transition-colors
          `}>
            <Upload className={`w-6 h-6 ${isDragOver ? 'text-emerald-600' : 'text-slate-400'}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              Drop files here or <span className="text-emerald-600 underline">browse</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Wall Spec (.pdf) required, Takeoff Schedule (.xlsx) optional
            </p>
          </div>
        </div>
      </div>

      {/* File Slots */}
      {(pdfSlot.file || excelSlot.file) && (
        <div className="space-y-2">
          {/* PDF Slot */}
          {pdfSlot.file && (
            <div className={`
              flex items-center gap-3 px-4 py-3 rounded-lg border
              ${pdfSlot.status === 'error' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}
            `}>
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{pdfSlot.file.name}</p>
                <p className="text-xs text-slate-400">
                  {pdfSlot.status === 'error' ? pdfSlot.error : `Wall Spec PDF  ·  ${formatFileSize(pdfSlot.file.size)}`}
                </p>
              </div>
              <StatusIcon status={pdfSlot.status} />
              <button
                onClick={(e) => { e.stopPropagation(); onFileRemoved('pdf'); }}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Excel Slot */}
          {excelSlot.file && (
            <div className={`
              flex items-center gap-3 px-4 py-3 rounded-lg border
              ${excelSlot.status === 'error' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}
            `}>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{excelSlot.file.name}</p>
                <p className="text-xs text-slate-400">
                  {excelSlot.status === 'error' ? excelSlot.error : `Takeoff Schedule  ·  ${formatFileSize(excelSlot.file.size)}`}
                </p>
              </div>
              <StatusIcon status={excelSlot.status} />
              <button
                onClick={(e) => { e.stopPropagation(); onFileRemoved('excel'); }}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
