'use client';

import React, { useState, useMemo } from 'react';
import { WallAssembly, TakeoffInstance, CalculatedMaterial, MaterialDefinition, ProposalConfig } from '@/types';
import { calculateMaterials } from '@/services/gemini/calculateMaterials';
import { Printer, FileText, Settings } from 'lucide-react';
import { Select } from '@/components/ui';
import { MarkupsView } from '@/components/features/reports/Markups';
import { MaterialsView, ExtendedLineItem } from '@/components/features/reports/MaterialsView';
import { LaborView } from '@/components/features/reports/LaborView';
import { parsePer } from '@/lib/utils/calculationUtils';
import { getCSISection } from '@/constants/csiSections';

interface ReportsProps {
    assemblies: WallAssembly[];
    takeoffs: Record<string, TakeoffInstance[]>;
    manualItems: CalculatedMaterial[];
    materials: MaterialDefinition[];
    displayUnit: 'imperial' | 'metric';
    activeReportTab?: 'proposal' | 'bidding' | 'markups' | 'materials' | 'labor';
    setActiveReportTab?: (tab: 'proposal' | 'bidding' | 'markups' | 'materials' | 'labor') => void;
    onCloseReport?: () => void;
}

export const Reports: React.FC<ReportsProps> = ({
    assemblies,
    takeoffs,
    manualItems,
    materials,
    displayUnit,
    activeReportTab,
    setActiveReportTab,
    onCloseReport
}) => {
    console.log("Reports Component Rendered", { assemblyCount: assemblies.length });

    // Configuration
    const [config, setConfig] = useState<ProposalConfig>({
        clientName: 'Client Name',
        clientAddress: 'Project Address',
        preparedBy: 'Your Company Name',
        validityDays: 30,
        taxRate: 8.25,
        markup: 15.0,
        overhead: 10.0
    });

    const [showConfig, setShowConfig] = useState(false);
    const [localActiveReport, setLocalActiveReport] = useState<'proposal' | 'bidding' | 'markups' | 'materials' | 'labor'>('proposal');

    const activeReport = activeReportTab || localActiveReport;
    const handleReportChange = (tab: 'proposal' | 'bidding' | 'markups') => {
        if (setActiveReportTab) setActiveReportTab(tab);
        else setLocalActiveReport(tab);
    };
    const [floorFilter, setFloorFilter] = useState<string>('All');

    // Price Map Calculation
    const priceMap = useMemo(() => {
        const map: Record<string, { cost: number, per: number }> = {};
        if (materials) {
            materials.forEach(m => {
                if (m && m.description) {
                    map[m.description] = { cost: m.matCost || 0, per: parsePer(m.per || '1') };
                }
            });
        }
        return map;
    }, [materials]);

    // Data Processing
    const proposalData = useMemo(() => {
        let allMats: CalculatedMaterial[] = [];
        const safeAssemblies = assemblies || [];
        const safeTakeoffs: Record<string, TakeoffInstance[]> = takeoffs || {};

        // 1. Calculate Materials for all assemblies
        Object.entries(safeTakeoffs).forEach(([aid, insts]) => {
            const asm = safeAssemblies.find(a => a.id === aid);
            if (asm && insts && insts.length > 0) {
                try {
                    const mats = calculateMaterials(asm, insts as TakeoffInstance[], materials || []);
                    allMats = [...allMats, ...mats];
                } catch (err) {
                    console.error("Error calculating materials:", err);
                }
            }
        });

        // Add manual items
        if (manualItems && manualItems.length > 0) {
            allMats = [...allMats, ...manualItems];
        }

        // 2. Group by CSI and Cost
        const csiGroups: Record<string, { material: CalculatedMaterial, cost: number }[]> = {};

        allMats.forEach(m => {
            if (!m) return;

            // Cost Logic
            let pricing = priceMap[m.item];
            if (!pricing && m.item.includes('@')) pricing = priceMap[m.item.split('@')[0].trim()];
            if (m.overridePrice !== undefined) pricing = { cost: m.overridePrice, per: 1 };

            let totalCost = 0;
            if (pricing) {
                let pricingQty = m.quantity || 0;
                // Simple unit conversion fallback logic could go here
                // For now assuming direct match except for sheets
                if (m.unit.includes('sheet')) pricingQty = (m.quantity || 0) * 48; // Estimate

                totalCost = pricingQty * (pricing.cost / (pricing.per || 1));
            }

            const csi = getCSISection(m.category, m.item);
            if (!csiGroups[csi]) csiGroups[csi] = [];

            const existing = csiGroups[csi].find(x => x.material.item === m.item && x.material.unit === m.unit);
            if (existing) {
                existing.material.quantity = (existing.material.quantity || 0) + (m.quantity || 0);
                existing.cost += totalCost;
            } else {
                csiGroups[csi].push({ material: { ...m }, cost: totalCost });
            }
        });

        // 3. Scope Summary
        const scopeSummary = safeAssemblies.map(a => {
            const insts = safeTakeoffs[a.id] || [];
            const totalLF = insts.reduce((s, i) => s + ((i.length || 0) * (i.quantity || 1)), 0);
            const totalSF = insts.reduce((s, i) => {
                const q = i.quantity || 1;
                if (i.ceilingArea) return s + (i.ceilingArea * q);
                return s + ((i.length || 0) * (i.height || 0) * q);
            }, 0);
            return { ...a, totalLF, totalSF };
        }).filter(a => a.totalLF > 0 || a.totalSF > 0);

        const subtotal = Object.values(csiGroups).flat().reduce((s, i) => s + i.cost, 0);

        return { csiGroups, scopeSummary, subtotal, allMats };
    }, [assemblies, takeoffs, manualItems, materials, priceMap]);

    // Financial Totals
    const financials = useMemo(() => {
        const sub = proposalData.subtotal || 0;
        const tax = sub * ((config.taxRate || 0) / 100);
        const overhead = sub * ((config.overhead || 0) / 100);
        const profitBase = sub + overhead + tax;
        const profit = profitBase * ((config.markup || 0) / 100);
        const total = profitBase + profit;
        return { sub, tax, overhead, profit, total };
    }, [proposalData, config]);

    // Bidding Data
    const biddingData = useMemo(() => {
        const rows: any[] = [];
        const levels = new Set<string>(['All']);
        const safeAssemblies = assemblies || [];
        const safeTakeoffs: Record<string, TakeoffInstance[]> = takeoffs || {};

        Object.entries(safeTakeoffs).forEach(([aid, insts]) => {
            const asm = safeAssemblies.find(a => a.id === aid);
            if (!asm) return;

            (insts as TakeoffInstance[]).forEach(inst => {
                const lvl = inst.level || '1';
                levels.add(lvl);
                if (floorFilter !== 'All' && lvl !== floorFilter) return;

                const qty = inst.quantity || 1;
                const isCeiling = asm.assemblyType === 'Ceiling';
                const len = (inst.length || 0) * qty;
                const h = inst.height || 0;

                rows.push({
                    level: lvl,
                    code: asm.code,
                    desc: asm.description,
                    type: asm.assemblyType || 'Wall',
                    length: len,
                    height: h,
                    area: len * h,
                    ceilArea: (inst.ceilingArea || 0) * qty,
                    perimeter: isCeiling ? ((inst.perimeter || inst.length || 0) * qty) : 0
                });
            });
        });

        // Simple aggregation
        const aggregated: Record<string, any> = {};
        rows.forEach(r => {
            const key = `${r.level}-${r.code}`;
            if (!aggregated[key]) {
                aggregated[key] = { ...r };
            } else {
                aggregated[key].length += r.length;
                aggregated[key].area += r.area;
                aggregated[key].ceilArea += r.ceilArea;
                aggregated[key].perimeter += r.perimeter;
            }
        });

        return {
            rows: Object.values(aggregated).sort((a: any, b: any) => a.level.localeCompare(b.level) || a.code.localeCompare(b.code)),
            levels: Array.from(levels).sort()
        };
    }, [assemblies, takeoffs, floorFilter]);

    // Detailed Report Data Generation (Preserving Area/Level)
    const reportLineItems: ExtendedLineItem[] = useMemo(() => {
        let items: ExtendedLineItem[] = [];
        const safeAssemblies = assemblies || [];
        const safeTakeoffs: Record<string, TakeoffInstance[]> = takeoffs || {};

        // Iterate Assemblies
        safeAssemblies.forEach(asm => {
            const insts = safeTakeoffs[asm.id] || [];

            // Group Instances by Level to preserve "Area" context
            // doing calculation per level group to maintain some efficiency while allowing filtering
            const levelGroups: Record<string, TakeoffInstance[]> = {};
            insts.forEach(i => {
                const lvl = i.level || 'Unknown';
                if (!levelGroups[lvl]) levelGroups[lvl] = [];
                levelGroups[lvl].push(i);
            });

            // Calculate for each level
            Object.entries(levelGroups).forEach(([lvl, levelInsts]) => {
                try {
                    const mats = calculateMaterials(asm, levelInsts, materials || []);
                    mats.forEach(m => {
                        items.push({
                            ...m,
                            area: lvl,
                            section: getCSISection(m.category, m.item),
                            costCode: m.laborCode || m.category, // Fallback
                            conditionType: asm.description,
                            supplier: 'Generic' // Helper to lookup if needed, but 'Generic' for now
                        });
                    });
                } catch (e) {
                    console.error("Report Calc Error", e);
                }
            });
        });

        // Add Manual Items (Default Area to 'Manual')
        if (manualItems) {
            manualItems.forEach(m => {
                items.push({
                    ...m,
                    area: 'Manual',
                    section: getCSISection(m.category, m.item),
                    costCode: m.laborCode || m.category,
                    conditionType: 'Manual Entry',
                    supplier: 'Generic'
                });
            });
        }

        return items;
    }, [assemblies, takeoffs, manualItems, materials]);

    // Dynamic Header Logic
    const getHeaderInfo = () => {
        switch (activeReport) {
            case 'materials': return { title: 'Materials', icon: null };
            case 'labor': return { title: 'Labor', icon: null };
            case 'markups': return { title: 'Markups', icon: null };
            case 'proposal':
            case 'bidding':
            default: return { title: 'Project Reports', icon: <FileText className="w-5 h-5 text-blue-600" /> };
        }
    };

    const headerInfo = getHeaderInfo();
    const showReportToggles = activeReport === 'proposal' || activeReport === 'bidding';

    return (
        <div className="h-full bg-slate-100 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm z-10 print:hidden">
                <div className="flex items-center gap-4">
                    <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                        {headerInfo.icon} {headerInfo.title}
                    </h2>

                    {showReportToggles && (
                        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                            <button onClick={() => handleReportChange('proposal')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeReport === 'proposal' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                Proposal
                            </button>
                            <button onClick={() => handleReportChange('bidding')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeReport === 'bidding' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                Bidding Summary
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    {onCloseReport && (
                        <button
                            onClick={onCloseReport}
                            className="px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-md flex items-center gap-2 text-sm font-medium transition-colors"
                        >
                            Back to Project
                        </button>
                    )}
                    <div className="w-px h-8 bg-slate-200 mx-2"></div>
                    {activeReport === 'proposal' ? (
                        <button onClick={() => setShowConfig(!showConfig)} className={`px-3 py-2 rounded-md border flex items-center gap-2 text-sm font-medium transition-colors ${showConfig ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <Settings className="w-4 h-4" /> Configuration
                        </button>
                    ) : (activeReport === 'bidding' || activeReport === 'materials' || activeReport === 'labor' ? (
                        // Show Floor Filter for Bidding, Materials and Labor views if desired, or just Bidding
                        // The user requested explicit separation.
                        // Let's keep specific controls per view.
                        // Reverting to specific logic:
                        null
                    ) : null)}

                    {activeReport === 'bidding' && (
                        <Select
                            containerClassName="w-auto"
                            options={biddingData.levels.map((level) => ({ value: level, label: `Floor: ${level}` }))}
                            size="sm"
                            value={floorFilter}
                            variant="filter"
                            onValueChange={setFloorFilter}
                            aria-label="Filter bidding summary by floor"
                        />
                    )}

                    <button onClick={() => window.print()} className="px-3 py-2 bg-slate-800 text-white rounded-md flex items-center gap-2 text-sm font-medium hover:bg-slate-900 shadow-sm">
                        <Printer className="w-4 h-4" /> Print
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {activeReport === 'bidding' ? (
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex justify-center">
                        <div className="w-[210mm] min-h-[297mm] bg-white shadow-lg p-[15mm] flex flex-col gap-6 print:w-full print:shadow-none print:p-0">
                            <header className="border-b-2 border-slate-800 pb-4 mb-4">
                                <h1 className="text-2xl font-bold text-slate-800">BIDDING SUMMARY</h1>
                                <p className="text-slate-500 text-sm">Quantities by Floor & Assembly</p>
                            </header>

                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-2 py-2">Floor</th>
                                        <th className="text-left px-2 py-2">Assembly</th>
                                        <th className="text-left px-2 py-2">Type</th>
                                        <th className="text-right px-2 py-2">Height</th>
                                        <th className="text-right px-2 py-2">Length (LF)</th>
                                        <th className="text-right px-2 py-2">Wall Area (SF)</th>
                                        <th className="text-right px-2 py-2">Ceiling (SF)</th>
                                        <th className="text-right px-2 py-2">Perimeter (LF)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/50">
                                    {biddingData.rows.map((row: any, i: number) => (
                                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                            <td className="px-2 py-1.5 font-medium text-slate-900">{row.level}</td>
                                            <td className="px-2 py-1.5">
                                                <div className="font-bold text-slate-700">{row.code}</div>
                                                <div className="text-xs text-slate-500 truncate max-w-[200px]">{row.desc}</div>
                                            </td>
                                            <td className="px-2 py-1.5 text-slate-500 text-xs uppercase">{row.type}</td>
                                            <td className="px-2 py-1.5 text-right font-mono text-slate-600">{row.height > 0 ? `${row.height}'` : '-'}</td>
                                            <td className="px-2 py-1.5 text-right font-mono">{row.length > 0 ? row.length.toFixed(1) : '-'}</td>
                                            <td className="px-2 py-1.5 text-right font-mono">{row.area > 0 ? Math.round(row.area) : '-'}</td>
                                            <td className="px-2 py-1.5 text-right font-mono font-medium text-blue-700">{row.ceilArea > 0 ? Math.round(row.ceilArea) : '-'}</td>
                                            <td className="px-2 py-1.5 text-right font-mono">{row.perimeter > 0 ? Math.round(row.perimeter) : '-'}</td>
                                        </tr>
                                    ))}
                                    {biddingData.rows.length === 0 && (
                                        <tr><td colSpan={8} className="text-center py-8 text-slate-400">No data found matching filter.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : activeReport === 'materials' ? (
                    <MaterialsView items={reportLineItems.filter(i => i.category !== 'Labor')} priceMap={priceMap} />
                ) : activeReport === 'labor' ? (
                    <LaborView items={reportLineItems.filter(i => i.category === 'Labor')} priceMap={priceMap} />
                ) : activeReport === 'markups' ? (
                    <MarkupsView
                        calculatedMaterials={proposalData.allMats}
                        priceMap={priceMap}
                    />
                ) : (
                    <div className="flex h-full">
                        {/* Config Sidebar */}
                        {showConfig && (
                            <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto p-4 flex flex-col gap-6 shadow-inner print:hidden">
                                <div>
                                    <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wide">Project Details</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Client Name</label>
                                            <input type="text" value={config.clientName} onChange={e => setConfig({ ...config, clientName: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Client Address</label>
                                            <input type="text" value={config.clientAddress} onChange={e => setConfig({ ...config, clientAddress: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Prepared By</label>
                                            <input type="text" value={config.preparedBy} onChange={e => setConfig({ ...config, preparedBy: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Proposal Preview */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex justify-center">
                            <div className="w-[210mm] min-h-[297mm] bg-white shadow-lg p-[15mm] flex flex-col gap-8 print:w-full print:shadow-none print:p-0">
                                {/* Header */}
                                <header className="border-b-4 border-slate-800 pb-6 flex justify-between items-start">
                                    <div>
                                        <h1 className="text-3xl font-bold text-slate-800">PROPOSAL</h1>
                                    </div>
                                    <div className="text-right">
                                        <h2 className="font-bold text-lg text-slate-700">{config.preparedBy}</h2>
                                        <p className="text-sm text-slate-500">{new Date().toLocaleDateString()}</p>
                                    </div>
                                </header>

                                {/* Detailed Pricing */}
                                <div className="flex-1">
                                    <h3 className="bg-slate-100 px-3 py-1.5 font-bold text-slate-700 text-sm border-l-4 border-emerald-500 mb-4 uppercase tracking-wide">Detailed Cost Breakdown</h3>
                                    <div className="space-y-6">
                                        {Object.entries(proposalData.csiGroups).sort().map(([csi, itemsAny]) => {
                                            const items = itemsAny as { material: CalculatedMaterial, cost: number }[];
                                            return (
                                                <div key={csi}>
                                                    <h4 className="font-bold text-slate-600 text-sm mb-2 pb-1 border-b border-slate-200">{csi}</h4>
                                                    <table className="w-full text-xs">
                                                        <tbody>
                                                            {items.map((x, i) => (
                                                                <tr key={i}>
                                                                    <td className="py-1 text-slate-700 pl-2">{x.material.item}</td>
                                                                    <td className="py-1 text-right text-slate-500 w-24">
                                                                        {(x.material.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} {x.material.unit}
                                                                    </td>
                                                                    <td className="py-1 text-right font-medium text-slate-800 w-24">
                                                                        ${x.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Financial Summary */}
                                <div className="border-t-2 border-slate-800 pt-4 flex justify-end">
                                    <div className="w-64 space-y-2 text-sm">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Subtotal</span>
                                            <span>${financials.sub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-800 font-bold text-lg border-t border-slate-300 pt-2 mt-2">
                                            <span>Total Price</span>
                                            <span>${financials.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <footer className="text-center text-[10px] text-slate-400 mt-8 pt-8 border-t border-slate-100">
                                    All Prices are Estimates Subject to Verification
                                </footer>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
