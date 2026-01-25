
import React, { useState } from 'react';
import { Upload, FileImage, ScanSearch, FileText, AlertCircle } from 'lucide-react';

interface UploadSectionProps {
  onAnalyze: (file: File) => void;
  isAnalyzing: boolean;
}

export const UploadSection: React.FC<UploadSectionProps> = ({ onAnalyze, isAnalyzing }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Input Validation
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!validTypes.includes(selectedFile.type)) {
        setError("Invalid file type. Please upload a PDF or Image (JPG, PNG).");
        setFile(null);
        setPreviewUrl(null);
        e.target.value = ''; // Reset input
        return;
      }

      setError(null);
      setFile(selectedFile);
      
      if (selectedFile.type.includes('image')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setPreviewUrl(null); // No preview for PDF
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      onAnalyze(file);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-600" />
          Start New Project
        </h2>
        <p className="text-slate-500 text-sm mt-1">Upload a PDF or image containing Wall Type definitions.</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        
        {/* File Upload Area */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Wall Type Schedule / Drawing</label>
          <div className={`relative border-2 border-dashed rounded-lg p-8 transition-colors text-center ${file ? 'border-blue-300 bg-blue-50' : error ? 'border-red-300 bg-red-50' : 'border-slate-300 hover:border-blue-400'}`}>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isAnalyzing}
            />
            {file ? (
              <div className="relative z-10 flex flex-col items-center">
                {previewUrl ? (
                   <img src={previewUrl} alt="Preview" className="h-48 object-contain rounded shadow-sm mb-4 bg-white border border-slate-200" />
                ) : (
                   <div className="h-48 w-full flex items-center justify-center mb-4 bg-white border border-slate-200 rounded shadow-sm">
                       <div className="text-center">
                           <FileText className="w-16 h-16 text-red-500 mx-auto mb-2" />
                           <span className="text-slate-500 font-medium">PDF Document</span>
                       </div>
                   </div>
                )}
                <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-200">
                    <p className="text-sm text-slate-700 font-medium truncate max-w-[200px]">{file?.name}</p>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); setPreviewUrl(null); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${error ? 'bg-red-100 text-red-500' : 'bg-blue-50 text-blue-600'}`}>
                  {error ? <AlertCircle className="w-8 h-8" /> : <FileImage className="w-8 h-8" />}
                </div>
                <p className={`text-lg font-medium ${error ? 'text-red-600' : 'text-slate-700'}`}>
                  {error ? 'Invalid File Type' : 'Click to upload or drag and drop'}
                </p>
                <p className={`text-sm mt-1 ${error ? 'text-red-500' : 'text-slate-500'}`}>
                  {error ? error : 'Supports PDF, PNG, JPG'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          disabled={!file || isAnalyzing}
          className={`w-full py-4 px-4 rounded-lg font-semibold text-white shadow-md transition-all flex items-center justify-center gap-2
            ${!file || isAnalyzing 
              ? 'bg-slate-300 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:transform active:scale-[0.99]'
            }`}
        >
          {isAnalyzing ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Identifying Wall Types...
            </>
          ) : (
            <>
              <ScanSearch className="w-5 h-5" />
              Analyze Drawing
            </>
          )}
        </button>
      </form>
    </div>
  );
};
