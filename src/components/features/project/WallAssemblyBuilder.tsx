'use client';

import React, { useState, useCallback } from 'react';
import { Layers, Sparkles } from 'lucide-react';
import { FileUploadZone, FileSlot } from './FileUploadZone';
import { TakeoffPreview } from './TakeoffPreview';
import { AggregatedTakeoff } from '@/types/takeoff';
import { ParsedWallSpec } from '@/types/wallSpec';
import { Button, useToast } from '@/components/ui';

interface WallAssemblyBuilderProps {
  // Will accept more props in later phases (materials, unit system, etc.)
}

export const WallAssemblyBuilder: React.FC<WallAssemblyBuilderProps> = () => {
  const toast = useToast();

  // File state
  const [pdfSlot, setPdfSlot] = useState<FileSlot>({ file: null, status: 'empty' });
  const [excelSlot, setExcelSlot] = useState<FileSlot>({ file: null, status: 'empty' });

  // Parsed takeoff data
  const [takeoffData, setTakeoffData] = useState<AggregatedTakeoff[] | null>(null);
  const [excelFileName, setExcelFileName] = useState<string>('');

  // Parsed PDF wall spec data
  const [wallSpecData, setWallSpecData] = useState<ParsedWallSpec | null>(null);

  // Generate state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState<string>('');

  const bothFilesReady = pdfSlot.status === 'ready' && excelSlot.status === 'ready';

  const handleFileSelected = useCallback(async (file: File, type: 'pdf' | 'excel') => {
    if (type === 'pdf') {
      setPdfSlot({ file, status: 'ready' });
    } else if (type === 'excel') {
      setExcelSlot({ file, status: 'processing' });
      setExcelFileName(file.name);

      try {
        // Parse the Excel file via API
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/parse-takeoff', {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Failed to parse Excel file');
        }

        setTakeoffData(json.data.aggregated);
        setExcelSlot({ file, status: 'ready' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Parse error';
        setExcelSlot({ file, status: 'error', error: message });
        setTakeoffData(null);
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

  const handleGenerate = async () => {
    if (!bothFilesReady || !pdfSlot.file) {
      console.log("❌ Cannot generate: files not ready");
      return;
    }
    
    console.log("\n🚀 === STARTING PDF GENERATION ===");
    console.log("PDF file:", pdfSlot.file.name, pdfSlot.file.size, "bytes");
    console.log("Excel file:", excelSlot.file?.name);
    
    setIsGenerating(true);
    setGeneratingStatus('Reading PDF...');

    try {
      // Convert PDF to base64
      console.log("📄 Converting PDF to base64...");
      const pdfBase64 = await fileToBase64(pdfSlot.file);
      console.log("✓ PDF converted, base64 length:", pdfBase64.length);

      setGeneratingStatus('Analyzing PDF with AI...');

      console.log("📡 Calling /api/parse-pdf...");
      // Call PDF parsing API
      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfBase64,
          fileName: pdfSlot.file.name,
        }),
      });

      console.log("📥 API response status:", response.status, response.statusText);
      const result = await response.json();
      console.log("📦 API response data:", result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to parse PDF');
      }

      // Save parsed wall spec data
      setWallSpecData(result.data);

      setGeneratingStatus('Processing complete!');
      
      toast.success(
        'PDF Parsed Successfully',
        `Found ${result.data.totalWallTypes} wall types in ${Math.round(result.data.processingTime / 1000)}s`,
      );

      // Log detailed results in browser console
      console.log("\n🎉 === PDF PARSING SUCCESS ===");
      console.log("Total wall types:", result.data.totalWallTypes);
      console.log("Processing time:", result.data.processingTime, "ms");
      console.log("AI model:", result.data.aiModel);
      console.log("\n📋 Wall Types Found:");
      result.data.wallTypes.forEach((wt: any, idx: number) => {
        console.log(`\n${idx + 1}. ${wt.wallTypeId} - ${wt.description}`);
        console.log(`   📏 OC Spacing: ${wt.ocSpacing}"`);
        console.log(`   📚 Layers: ${wt.layerCount}`);
        console.log(`   🔥 Fire Rating: ${wt.fireRating || "N/A"}`);
        console.log(`   🔊 STC Rating: ${wt.stcRating || "N/A"}`);
        console.log(`   🧱 Materials (${wt.materials.length}):`);
        wt.materials.forEach((m: any) => {
          console.log(`      - ${m.keyword}`);
          console.log(`        Description: ${m.description}`);
          if (m.thickness) console.log(`        Thickness: ${m.thickness}`);
          if (m.specifications) console.log(`        Specs: ${m.specifications}`);
        });
      });
      console.log("\n✅ Full data:", result.data);
      console.log("=========================\n");

      // TODO: Phase 3 - Match materials with database
      // TODO: Phase 4 - Generate assembly tables
    } catch (error) {
      console.error('\n❌ === GENERATION ERROR ===');
      console.error('Error details:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      toast.error(
        'Generation Failed',
        error instanceof Error ? error.message : 'An error occurred',
      );
      setGeneratingStatus('');
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper: Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:application/pdf;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-6 h-6 text-emerald-600" />
              Wall Assembly Builder
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Upload your Wall Spec PDF and Takeoff Schedule to generate assemblies.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {/* Upload Section */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Upload Files</h3>
            <FileUploadZone
              pdfSlot={pdfSlot}
              excelSlot={excelSlot}
              onFileSelected={handleFileSelected}
              onFileRemoved={handleFileRemoved}
              disabled={isGenerating}
            />
          </div>

          {/* Takeoff Preview */}
          {takeoffData && takeoffData.length > 0 && (
            <div>
              <TakeoffPreview data={takeoffData} fileName={excelFileName} />
            </div>
          )}

          {/* Generate Button */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              icon={Sparkles}
              onClick={handleGenerate}
              disabled={!bothFilesReady || isGenerating}
              isLoading={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate Assemblies'}
            </Button>

            {/* Generating Status */}
            {isGenerating && generatingStatus && (
              <p className="text-sm text-blue-600 font-medium animate-pulse">
                {generatingStatus}
              </p>
            )}
          </div>

          {/* Hint when files are missing */}
          {!bothFilesReady && (pdfSlot.file || excelSlot.file) && (
            <p className="text-center text-xs text-slate-400">
              {!pdfSlot.file && 'Upload a Wall Spec PDF to continue.'}
              {!excelSlot.file && 'Upload a Takeoff Schedule (.xlsx) to continue.'}
              {pdfSlot.file && excelSlot.status === 'processing' && 'Parsing Excel file...'}
              {excelSlot.status === 'error' && 'Fix the Excel file error to continue.'}
            </p>
          )}

          {/* Debug: Show parsed wall spec data */}
          {wallSpecData && !isGenerating && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="text-sm font-semibold text-green-900 mb-2">
                ✓ PDF Parsed Successfully
              </h4>
              <p className="text-xs text-green-700">
                Found {wallSpecData.totalWallTypes} wall types
              </p>
              <details className="mt-2">
                <summary className="text-xs text-green-600 cursor-pointer hover:text-green-800">
                  View Details
                </summary>
                <pre className="mt-2 text-xs bg-white p-2 rounded border border-green-300 overflow-auto max-h-64">
                  {JSON.stringify(wallSpecData, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
