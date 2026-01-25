
import React, { useState, useEffect } from 'react';
import { X, Calculator, Play, Save, RotateCcw } from 'lucide-react';
import { AssemblyComponent, CalculationMethod } from '../types';
import { evaluateMath } from '../services/geminiService';

interface FormulaDebugModalProps {
    isOpen: boolean;
    onClose: () => void;
    component: AssemblyComponent;
    variables: Record<string, number>;
    onUpdateFormula: (formula: string) => void;
}

export const FormulaDebugModal: React.FC<FormulaDebugModalProps> = ({
    isOpen,
    onClose,
    component,
    variables,
    onUpdateFormula
}) => {
    const [mode, setMode] = useState<'standard' | 'custom'>('standard');
    const [customFormula, setCustomFormula] = useState('');
    const [testResult, setTestResult] = useState<number | null>(null);

    useEffect(() => {
        if (component.usage === 'Custom Formula' && component.customFormula) {
            setMode('custom');
            setCustomFormula(component.customFormula);
        } else {
            setMode('standard');
            setCustomFormula('');
        }
    }, [component]);

    if (!isOpen) return null;

    const handleTest = () => {
        try {
            // Map simple vars L, H, A to variables
            const evalVars = {
                l: variables.L,
                h: variables.H,
                a: variables.Area,
                c: variables.Count,
                p: variables.Perimeter,
                ca: variables.CeilingArea,
                ...variables
            };
            const res = evaluateMath(customFormula, evalVars);
            setTestResult(res);
        } catch (e) {
            setTestResult(null);
        }
    };

    const handleSave = () => {
        if (mode === 'custom' && customFormula) {
            onUpdateFormula(customFormula);
            onClose();
        }
    };

    const handleReset = () => {
        setMode('standard');
        setCustomFormula('');
        // We might want to reset to default usage but onUpdateFormula expects a string formula? 
        // Or if we want to revert to standard usage, we might need a different callback or logic.
        // For now, let's assume this pushes a Custom Formula. If user wants standard, they use the dropdown in the main UI.
        // Actually, let's just allow clearing custom formula.
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                            <Calculator className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Formula Debugger</h3>
                            <div className="text-xs text-slate-500">{component.materialName}</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Mode Toggle */}
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => setMode('standard')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'standard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Standard Formula
                        </button>
                        <button
                            onClick={() => setMode('custom')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'custom' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Custom Logic
                        </button>
                    </div>

                    {/* Standard View */}
                    {mode === 'standard' && (
                        <div className="space-y-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">Current Method</div>
                                <div className="text-lg font-medium text-blue-900">{component.usage}</div>
                                {component.usage.includes('Vertical') && <div className="text-sm text-blue-700 mt-1 font-mono">(L * 12 / OC) + Ends</div>}
                            </div>
                        </div>
                    )}

                    {/* Custom View */}
                    {mode === 'custom' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Custom Expression</label>
                                <textarea
                                    className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
                                    placeholder="e.g. (L * H) / 48"
                                    value={customFormula}
                                    onChange={(e) => setCustomFormula(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <button onClick={handleTest} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-purple-600 transition-colors">
                                    <Play className="w-4 h-4" /> Test Calculation
                                </button>
                                {testResult !== null && (
                                    <div className="font-mono font-bold text-purple-600">
                                        = {testResult.toFixed(2)}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Variables Table */}
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Available Variables</div>
                        <div className="grid grid-cols-2 gap-3">
                            <VarItem label="Length (L)" value={variables.L} unit="ft" />
                            <VarItem label="Height (H)" value={variables.H} unit="ft" />
                            <VarItem label="Area (A)" value={variables.Area} unit="sf" />
                            <VarItem label="Count (C)" value={variables.Count} unit="ea" />
                            <VarItem label="Perimeter (P)" value={variables.Perimeter} unit="ft" />
                            <VarItem label="CeilingArea (CA)" value={variables.CeilingArea} unit="sf" />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-500 font-medium hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                    {mode === 'custom' && (
                        <button onClick={handleSave} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg flex items-center gap-2 shadow-sm transition-all hover:-translate-y-0.5">
                            <Save className="w-4 h-4" /> Apply Formula
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const VarItem = ({ label, value, unit }: { label: string, value: number, unit: string }) => (
    <div className="flex justify-between items-center p-2 bg-slate-50 border border-slate-100 rounded text-sm">
        <span className="text-slate-500 font-medium">{label}</span>
        <span className="font-mono text-slate-700">{value?.toLocaleString()} <span className="text-slate-400 text-xs">{unit}</span></span>
    </div>
);
