'use client';

import React from 'react';
import { AssemblyComponent, MaterialDefinition } from '@/types';

interface FormulasTabProps {
    localComp: AssemblyComponent;
    material: MaterialDefinition | undefined;
    onLocalChange: (
        field: keyof AssemblyComponent,
        value: AssemblyComponent[keyof AssemblyComponent],
    ) => void;
}

const formulaTextareaStyles =
    'flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none';

const MouBadge = ({ value }: { value: string | undefined }) => (
    <div className="w-20 flex flex-col justify-center items-center bg-slate-50 rounded-lg border border-slate-100 px-1 py-2">
        <span className="text-[9px] font-bold text-slate-400 uppercase">MOU</span>
        <span className="text-xs font-mono text-slate-600 mt-1">{value || '—'}</span>
    </div>
);

const DbHint = ({ formula }: { formula: string | undefined }) =>
    formula ? (
        <div className="mt-1 px-2 py-1 bg-slate-50 rounded text-[10px] text-slate-400 font-mono border border-slate-100 truncate">
            <span className="font-bold text-slate-500">DB: </span>
            {formula}
        </div>
    ) : null;

export const FormulasTab = ({ localComp, material, onLocalChange }: FormulasTabProps) => (
    <div className="space-y-5">
        {/* Wall Formula Overrides */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Wall Formula Overrides
                    </h3>
                </div>
                <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">
                    Overrides DB formulas for this assembly only
                </span>
            </div>
            <div className="space-y-4">
                {/* Qty Formula */}
                <div className="flex gap-3 items-stretch">
                    <div className="flex-1 flex flex-col">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            Qty Formula Override
                        </label>
                        <textarea
                            className={formulaTextareaStyles}
                            value={localComp.formulaQtyOverride || ''}
                            placeholder={material?.formulaQty || 'No DB formula'}
                            rows={2}
                            onChange={(e) =>
                                onLocalChange('formulaQtyOverride', e.target.value || undefined)
                            }
                            spellCheck={false}
                        />
                        <DbHint formula={material?.formulaQty} />
                    </div>
                    <MouBadge value={material?.mouWall} />
                </div>

                {/* Sec Qty Formula */}
                <div className="flex gap-3 items-stretch">
                    <div className="flex-1 flex flex-col">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            Sec. Qty Formula Override
                        </label>
                        <textarea
                            className={formulaTextareaStyles}
                            value={localComp.formulaSecQtyOverride || ''}
                            placeholder={material?.formulaSecQty || 'No DB formula'}
                            rows={2}
                            onChange={(e) =>
                                onLocalChange('formulaSecQtyOverride', e.target.value || undefined)
                            }
                            spellCheck={false}
                        />
                        <DbHint formula={material?.formulaSecQty} />
                    </div>
                    <MouBadge value={material?.mouWallSec} />
                </div>
            </div>
        </div>

        {/* Ceiling Formula Overrides */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-sky-500 rounded-full" />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Ceiling Formula Overrides
                    </h3>
                </div>
            </div>
            <div className="space-y-4">
                {/* Ceiling Qty Formula */}
                <div className="flex gap-3 items-stretch">
                    <div className="flex-1 flex flex-col">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            Ceiling Qty Formula Override
                        </label>
                        <textarea
                            className={formulaTextareaStyles}
                            value={localComp.formulaCeilQtyOverride || ''}
                            placeholder={material?.formulaCeilQty || 'No DB formula'}
                            rows={2}
                            onChange={(e) =>
                                onLocalChange('formulaCeilQtyOverride', e.target.value || undefined)
                            }
                            spellCheck={false}
                        />
                        <DbHint formula={material?.formulaCeilQty} />
                    </div>
                    <MouBadge value={material?.mouCeil} />
                </div>

                {/* Ceiling Sec Qty Formula */}
                <div className="flex gap-3 items-stretch">
                    <div className="flex-1 flex flex-col">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            Ceiling Sec. Qty Formula Override
                        </label>
                        <textarea
                            className={formulaTextareaStyles}
                            value={localComp.formulaCeilSecQtyOverride || ''}
                            placeholder={material?.formulaCeilSecQty || 'No DB formula'}
                            rows={2}
                            onChange={(e) =>
                                onLocalChange(
                                    'formulaCeilSecQtyOverride',
                                    e.target.value || undefined,
                                )
                            }
                            spellCheck={false}
                        />
                        <DbHint formula={material?.formulaCeilSecQty} />
                    </div>
                    <MouBadge value={material?.mouCeilSec} />
                </div>
            </div>
        </div>

        {/* Tips */}
        <div className="px-3 py-2.5 bg-blue-50 rounded-lg border border-blue-100 text-[10px] text-blue-600">
            <span className="font-bold">Note:</span> These overrides apply to this assembly only.
            Leave blank to use the default formula from the material database. Use variables like{' '}
            <code className="font-mono bg-blue-100 px-1 rounded">Length</code>,{' '}
            <code className="font-mono bg-blue-100 px-1 rounded">Height</code>,{' '}
            <code className="font-mono bg-blue-100 px-1 rounded">Wastage</code>,{' '}
            <code className="font-mono bg-blue-100 px-1 rounded">layer</code>,{' '}
            <code className="font-mono bg-blue-100 px-1 rounded">sheet area</code>,{' '}
            <code className="font-mono bg-blue-100 px-1 rounded">Ceiling Area</code>,{' '}
            <code className="font-mono bg-blue-100 px-1 rounded">AREA COVER</code>.
        </div>
    </div>
);
