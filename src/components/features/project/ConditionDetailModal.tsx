'use client';

import React, { useMemo } from 'react';
import { WallAssembly, CalculatedMaterial } from '@/types';
import { Modal, ModalBody, Button } from '@/components/ui';

interface ConditionDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    assembly: WallAssembly;
    materials: CalculatedMaterial[];
    totalCost: number;
    totalSqFt: number;
}

export const ConditionDetailModal: React.FC<ConditionDetailModalProps> = ({
    isOpen, onClose, assembly, materials, totalCost, totalSqFt
}) => {
    // --- Data Preparation ---
    const rows = useMemo(() => {
        // Enriched Rows
        return materials.map((m, idx) => {
            const unitPrice = m.overridePrice || 0;
            const lineTotal = m.quantity * unitPrice;
            // Infer Labor Cost vs Mat Cost based on Category
            // In QB, Mat and Labor are often on same line if linked, or separate.
            // Our system separates them.
            // If it's Labor, Mat Cost is 0, Lab Cost is unitPrice.
            // If it's Material, Mat Cost is unitPrice, Lab Cost is 0 (unless we link them later).
            // For now, treat them as separate lines as per our data structure.

            const isLabor = m.category === 'Labor';
            const matCost = isLabor ? 0 : unitPrice;
            const labCost = isLabor ? unitPrice : 0;
            const matTotal = isLabor ? 0 : lineTotal;
            const labTotal = isLabor ? lineTotal : 0;

            // Row Color Logic (Mimicking QuickBid)
            // Framing -> Cyan (bg-cyan-100)
            // Drywall -> White or very light blue
            // Insulation -> White
            // Labor -> White?
            let rowClass = 'bg-white';
            if (m.sect === '05400' || m.category === 'Framing') rowClass = 'bg-cyan-100/50'; // Cyan
            if (m.sect === '09100') rowClass = 'bg-cyan-100'; // Darker cyan from image?
            if (m.category === 'Drywall') rowClass = 'bg-sky-50';
            if (m.category === 'Finishing') rowClass = 'bg-fuchsia-50'; // Pinkish hint from image?

            return {
                ...m,
                id: idx + 1,
                matCost, labCost, matTotal, labTotal, rowClass, unitPrice
            };
        });
    }, [materials]);

    // Section Summary
    const sectionSummary = useMemo(() => {
        const groups: Record<string, { mat: number, lab: number, total: number }> = {};
        rows.forEach(r => {
            const s = r.sect || '00000';
            if (!groups[s]) groups[s] = { mat: 0, lab: 0, total: 0 };
            groups[s].mat += r.matTotal;
            groups[s].lab += r.labTotal;
            groups[s].total += (r.matTotal + r.labTotal);
        });
        return Object.entries(groups).sort();
    }, [rows]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="full"
            closeOnOverlayClick={false}
        >
            <div className="bg-slate-100 rounded shadow-2xl w-full h-full max-w-[95vw] flex flex-col overflow-hidden border border-slate-400">

                {/* --- TOP HEADER --- */}
                <div className="bg-[#f0f0f0] border-b border-slate-300 p-2 flex gap-4 shrink-0 text-xs">

                    {/* Left: Info Panel */}
                    <div className="w-64 bg-white border border-slate-300 p-2 shadow-inner flex flex-col gap-1">
                        <div className="flex justify-between">
                            <span className="font-bold text-slate-700">Cond No.</span>
                            <span className="bg-slate-200 px-1">{assembly.code}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-bold text-slate-700">Name</span>
                            <span className="truncate w-32" title={assembly.description}>{assembly.description}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-bold text-slate-700">Type</span>
                            <span>{assembly.assemblyType}</span>
                        </div>
                        <div className="flex justify-between mt-1 pt-1 border-t border-slate-100">
                            <span className="font-bold text-slate-700">Calc Qty 1</span>
                            <span className="bg-slate-100 px-1 border border-slate-200">{materials.length > 0 ? materials[0].quantity : 0} {materials.length > 0 ? materials[0].unit : ''}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-bold text-slate-700">Height</span>
                            <span className="bg-white px-1 border border-slate-200">{assembly.defaultHeight}'</span>
                        </div>
                    </div>

                    {/* Center: Section Summary Grid */}
                    <div className="flex-1 bg-white border border-slate-300 overflow-auto shadow-inner">
                        <table className="w-full text-center text-[11px] border-collapse">
                            <thead className="bg-[#000080] text-white sticky top-0">
                                <tr>
                                    <th className="px-2 py-0.5 border-r border-slate-500/30">Sect</th>
                                    <th className="px-2 py-0.5 border-r border-slate-500/30">Mat.</th>
                                    <th className="px-2 py-0.5 border-r border-slate-500/30">Lab.</th>
                                    <th className="px-2 py-0.5 border-r border-slate-500/30">Unit</th>
                                    <th className="px-2 py-0.5">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {sectionSummary.map(([sect, totals]) => (
                                    <tr key={sect} className="bg-[#000080] text-white hover:bg-blue-900">
                                        <td className="px-1 border-r border-slate-500/30 bg-blue-900 font-bold">{sect}</td>
                                        <td className="px-1 border-r border-slate-500/30 text-right bg-white text-black">{totals.mat.toFixed(2)}</td>
                                        <td className="px-1 border-r border-slate-500/30 text-right bg-white text-black">{totals.lab.toFixed(2)}</td>
                                        <td className="px-1 border-r border-slate-500/30 text-right text-lime-400 bg-[#008000] font-bold">{(totals.total / (totalSqFt || 1)).toFixed(2)}</td>
                                        <td className="px-1 text-right text-lime-400 bg-[#008000] font-bold">{totals.total.toFixed(0)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-[#000080] text-white font-bold border-t-2 border-white">
                                    <td className="px-1 border-r border-slate-500/30">Total</td>
                                    <td className="px-1 border-r border-slate-500/30 text-right bg-white text-black">{sectionSummary.reduce((a, b) => a + b[1].mat, 0).toFixed(2)}</td>
                                    <td className="px-1 border-r border-slate-500/30 text-right bg-white text-black">{sectionSummary.reduce((a, b) => a + b[1].lab, 0).toFixed(2)}</td>
                                    <td className="px-1 border-r border-slate-500/30 text-right bg-[#008000] text-lime-400">{(totalCost / (totalSqFt || 1)).toFixed(2)}</td>
                                    <td className="px-1 text-right bg-[#008000] text-lime-400">{totalCost.toFixed(0)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Right: Actions */}
                    <div className="w-32 flex flex-col justify-end">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onClose}
                            className="mb-1"
                        >
                            Close
                        </Button>
                    </div>
                </div>

                {/* --- MAIN GRID --- */}
                <div className="flex-1 overflow-auto bg-white border-t border-slate-400 relative">
                    <table className="w-full text-[11px] border-collapse text-left whitespace-nowrap">
                        <thead className="bg-slate-100 text-slate-800 sticky top-0 z-10 shadow-sm font-semibold">
                            <tr className="border-b border-slate-300">
                                <th className="bg-slate-200 border-r border-slate-300 w-8 text-center px-1">#</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-16">Sect</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-32">Item</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-64">Description</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-12 text-center bg-yellow-100">Height</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-10 text-center bg-yellow-100">OC</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-10 text-center bg-yellow-100">Lay</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-16 text-right">Qty</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-12 text-center">UOM</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-20 text-right bg-green-50 text-emerald-800">Mat. Cost</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-12 text-center text-slate-400">Per</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-20 text-right text-blue-800">Lab. Cost</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-20 text-center">Crew</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-12 text-center bg-yellow-100">Prod</th>
                                <th className="border-r border-slate-300 px-2 py-1 w-20 text-right text-emerald-700 bg-green-100 font-bold">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className={`${row.rowClass} hover:bg-yellow-50 border-b border-slate-200/50`}>
                                    <td className="border-r border-slate-300 text-center bg-slate-50 text-slate-500">{row.id}</td>
                                    <td className="border-r border-slate-300 px-2 py-0.5 truncate">{row.sect}</td>
                                    <td className="border-r border-slate-300 px-2 py-0.5 font-medium truncate max-w-[150px]" title={row.item}>{row.item.substring(0, 20)}...</td>
                                    <td className="border-r border-slate-300 px-2 py-0.5 truncate max-w-[250px]" title={row.notes}>{row.notes || row.item}</td>

                                    {/* Yellow Fields */}
                                    <td className="border-r border-slate-300 px-2 py-0.5 text-center bg-yellow-50">{row.height || '-'}</td>
                                    <td className="border-r border-slate-300 px-2 py-0.5 text-center bg-yellow-50">{row.oc ? `${row.oc}"` : '-'}</td>
                                    <td className="border-r border-slate-300 px-2 py-0.5 text-center bg-yellow-50">{row.layers || '-'}</td>

                                    <td className="border-r border-slate-300 px-2 py-0.5 text-right font-medium">{row.quantity}</td>
                                    <td className="border-r border-slate-300 px-2 py-0.5 text-center text-xs">{row.unit}</td>

                                    <td className="border-r border-slate-300 px-2 py-0.5 text-right font-mono bg-green-50/50">
                                        {row.matCost > 0 ? row.matCost.toFixed(2) : '-'}
                                    </td>
                                    <td className="border-r border-slate-300 px-2 py-0.5 text-center text-[10px] text-slate-400">1.000</td>

                                    <td className="border-r border-slate-300 px-2 py-0.5 text-right font-mono text-blue-700">
                                        {row.labCost > 0 ? row.labCost.toFixed(3) : '-'}
                                    </td>

                                    <td className="border-r border-slate-300 px-2 py-0.5 text-center text-xs text-slate-600">{row.crew || '-'}</td>

                                    <td className="border-r border-slate-300 px-2 py-0.5 text-right bg-yellow-50">
                                        {row.productionRate ? row.productionRate.toFixed(2) : '-'}
                                    </td>

                                    {/* Total */}
                                    <td className="border-r border-slate-300 px-2 py-0.5 text-right font-bold bg-green-100 text-emerald-800">
                                        {(row.matTotal + row.labTotal).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* Empty state filler lines for "QuickBid feel" */}
                    <div className="bg-white/50 h-full w-full absolute -z-10" />
                </div>

                {/* Footer Status Bar */}
                <div className="bg-slate-200 p-1 border-t border-slate-300 flex justify-between text-[10px] text-slate-600">
                    <span>Ready</span>
                    <span>1 of {rows.length} Items Selected</span>
                </div>
            </div>
        </Modal>
    );
};
