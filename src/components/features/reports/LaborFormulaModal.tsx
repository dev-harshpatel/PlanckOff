'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calculator, ChevronRight, RotateCcw } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import {
  buildFormulaVarMap,
  evaluateMaterialFormula,
  getActiveFormulaVars,
} from '@/lib/utils/formulaEvaluator';

interface LaborFormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
  laborCode: string;
  description: string;
  unit: string;
  dimensions: { totalLength: number; heightFt: number; ceilingArea: number };
  openedFrom: 'qty' | 'seqty';
  currentQty: number | null;
  currentSecQty: number | null;
  onApply: (qty: number | null, secQty: number | null) => void;
}

interface FormulaPaneProps {
  label: string;
  formula: string;
  onFormulaChange: (val: string) => void;
  varValues: Record<string, number>;
  onVarChange: (key: string, val: number) => void;
  isActive: boolean;
  onClick: () => void;
}

const FormulaPane = ({
  label,
  formula,
  onFormulaChange,
  varValues,
  onVarChange,
  isActive,
  onClick,
}: FormulaPaneProps) => {
  const activeVars = useMemo(() => getActiveFormulaVars(formula), [formula]);
  const result = useMemo(() => evaluateMaterialFormula(formula, varValues), [formula, varValues]);

  return (
    <div
      className={[
        'flex-1 min-w-0 flex flex-col rounded-xl border-2 transition-all cursor-default',
        isActive
          ? 'border-emerald-400 shadow-md shadow-emerald-100'
          : 'border-slate-200 hover:border-slate-300',
      ].join(' ')}
      onClick={onClick}
    >
      {/* Pane Header */}
      <div
        className={[
          'flex items-center justify-between px-4 py-2.5 rounded-t-[10px] border-b',
          isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200',
        ].join(' ')}
      >
        <div className="flex items-center gap-2">
          <Calculator className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600">{label}</span>
        </div>
        {result !== null && (
          <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
            = {result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
        {/* Formula textarea */}
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Expression
          </label>
          <textarea
            className={[
              'w-full px-3 py-2.5 rounded-lg font-mono text-xs resize-none',
              'border focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-colors leading-relaxed',
              isActive
                ? 'bg-slate-900 text-emerald-300 border-slate-700 placeholder-slate-600'
                : 'bg-slate-800 text-slate-400 border-slate-700 placeholder-slate-600',
            ].join(' ')}
            rows={3}
            placeholder="e.g. Length * Height"
            value={formula}
            onChange={(e) => onFormulaChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            spellCheck={false}
          />
        </div>

        {/* Variable inputs */}
        {activeVars.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Variables in Use
            </div>
            <div className="space-y-1.5">
              {activeVars.map((varDef) => (
                <VarRow
                  key={varDef.key}
                  label={varDef.displayName}
                  unit={varDef.unit}
                  value={varValues[varDef.key] ?? 0}
                  onChange={(val) => onVarChange(varDef.key, val)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!formula && (
          <div className="flex items-center justify-center py-6 text-center text-slate-400">
            <div>
              <Calculator className="w-7 h-7 mx-auto mb-1.5 opacity-25" />
              <p className="text-xs">No formula defined</p>
              <p className="text-[11px] mt-0.5 text-slate-300">Type an expression above</p>
            </div>
          </div>
        )}
      </div>

      {/* Result pin */}
      {formula && (
        <div className="shrink-0 px-4 pb-4 pt-0">
          <div
            className={[
              'flex items-center justify-between rounded-lg px-3 py-2.5 border',
              result !== null
                ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100'
                : 'bg-slate-50 border-slate-200',
            ].join(' ')}
          >
            <span className="text-xs text-slate-500 font-medium">Computed Result</span>
            <div className="flex items-center gap-1.5">
              <ChevronRight className={`w-3 h-3 ${result !== null ? 'text-emerald-500' : 'text-slate-300'}`} />
              {result !== null ? (
                <span className="font-bold font-mono text-emerald-700 text-sm">
                  {result >= 10
                    ? result.toLocaleString(undefined, { maximumFractionDigits: 0 })
                    : result.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                </span>
              ) : (
                <span className="font-mono text-slate-400 text-sm">—</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface VarRowProps {
  label: string;
  unit?: string;
  value: number;
  onChange: (val: number) => void;
}

const VarRow = ({ label, unit, value, onChange }: VarRowProps) => {
  const [inputVal, setInputVal] = useState(String(value));

  useEffect(() => {
    setInputVal(String(value));
  }, [value]);

  const handleBlur = () => {
    const parsed = parseFloat(inputVal);
    if (!isNaN(parsed)) onChange(parsed);
    else setInputVal(String(value));
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 min-w-0 truncate">
        <span className="font-mono text-slate-600 text-[11px]">{label}</span>
        {unit && <span className="ml-1 text-[9px] text-slate-400 uppercase">{unit}</span>}
      </div>
      <input
        type="text"
        inputMode="decimal"
        className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-200 bg-white font-mono text-[11px] text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 hover:border-slate-300 transition-colors"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  );
};

export const LaborFormulaModal = ({
  isOpen,
  onClose,
  laborCode,
  description,
  unit,
  dimensions,
  openedFrom,
  currentQty,
  currentSecQty,
  onApply,
}: LaborFormulaModalProps) => {
  const [focusedPane, setFocusedPane] = useState<'qty' | 'seqty'>(openedFrom);
  const [qtyFormula, setQtyFormula] = useState('');
  const [secQtyFormula, setSecQtyFormula] = useState('');
  const [varValues, setVarValues] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;
    setFocusedPane(openedFrom);
    setQtyFormula('');
    setSecQtyFormula('');
    // Pre-fill variable values from the extracted dimensions
    setVarValues(
      buildFormulaVarMap({
        length: dimensions.totalLength,
        height: dimensions.heightFt,
        ceilingArea: dimensions.ceilingArea,
        perimeter: 0,
        wastage: 0,
        layers: 1,
        oc: 16,
        packageSize: 32,
        areaCover: 0,
      }),
    );
  }, [isOpen, openedFrom, dimensions]);

  const handleVarChange = useCallback((key: string, val: number) => {
    setVarValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleApply = () => {
    const computedQty = qtyFormula ? evaluateMaterialFormula(qtyFormula, varValues) : currentQty;
    const computedSecQty = secQtyFormula ? evaluateMaterialFormula(secQtyFormula, varValues) : currentSecQty;
    onApply(computedQty, computedSecQty);
    onClose();
  };

  const handleClear = () => {
    onApply(null, null);
    onClose();
  };

  const hasCurrent = currentQty != null || currentSecQty != null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" closeOnOverlayClick={false} showCloseButton={false}>
      {/* Header */}
      <div className="bg-slate-900 text-white px-5 py-4 flex items-start justify-between rounded-t-xl">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded bg-emerald-500/20 border border-emerald-500/40">
              <Calculator className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-sm font-bold text-white">Formula Editor</span>
            {laborCode && (
              <span className="text-[10px] font-mono bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-600">
                {laborCode}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate ml-9">{description}</p>
        </div>
        <div className="text-[10px] text-slate-400 font-mono shrink-0 ml-4 mt-1">
          UOM: <span className="text-slate-300">{unit}</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 bg-slate-50">
        {/* Dimension context bar */}
        <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700 uppercase tracking-wide">Context</span>
          <span className="text-slate-300">|</span>
          <span>Length: <span className="font-semibold text-slate-700 font-mono">{dimensions.totalLength} LF</span></span>
          <span className="text-slate-300">|</span>
          <span>Height: <span className="font-semibold text-slate-700 font-mono">{dimensions.heightFt} ft</span></span>
          {dimensions.ceilingArea > 0 && (
            <>
              <span className="text-slate-300">|</span>
              <span>Ceiling Area: <span className="font-semibold text-slate-700 font-mono">{dimensions.ceilingArea} SF</span></span>
            </>
          )}
          {(currentQty != null || currentSecQty != null) && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-amber-600 font-medium">
                Current: Qty={currentQty ?? '—'}, SecQty={currentSecQty ?? '—'}
              </span>
            </>
          )}
        </div>

        {/* Two-pane editor */}
        <div className="flex gap-3 h-[400px]">
          <FormulaPane
            label="Qty. Formula"
            formula={qtyFormula}
            onFormulaChange={setQtyFormula}
            varValues={varValues}
            onVarChange={handleVarChange}
            isActive={focusedPane === 'qty'}
            onClick={() => setFocusedPane('qty')}
          />
          <FormulaPane
            label="Sec. Qty. Formula"
            formula={secQtyFormula}
            onFormulaChange={setSecQtyFormula}
            varValues={varValues}
            onVarChange={handleVarChange}
            isActive={focusedPane === 'seqty'}
            onClick={() => setFocusedPane('seqty')}
          />
        </div>

        {/* Syntax hint */}
        <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 text-[10px] text-blue-600">
          <span className="font-bold">Tip:</span> Use{' '}
          <code className="font-mono bg-blue-100 px-1 rounded">Length</code>,{' '}
          <code className="font-mono bg-blue-100 px-1 rounded">Height</code>,{' '}
          <code className="font-mono bg-blue-100 px-1 rounded">Ceiling Area</code>,{' '}
          <code className="font-mono bg-blue-100 px-1 rounded">Wastage</code>,{' '}
          <code className="font-mono bg-blue-100 px-1 rounded">layer</code> — operators:{' '}
          <code className="font-mono bg-blue-100 px-1 rounded">+ - * / ( )</code>.
          Leave a pane empty to keep the existing value.
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between rounded-b-xl">
        <div>
          {hasCurrent && (
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleClear}>
              Clear Values
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" icon={Calculator} onClick={handleApply}>
            Apply Formula
          </Button>
        </div>
      </div>
    </Modal>
  );
};
