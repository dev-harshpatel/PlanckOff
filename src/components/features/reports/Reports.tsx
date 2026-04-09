'use client';

import React, { useState, useMemo } from 'react';
import { WallAssembly, TakeoffInstance, CalculatedMaterial, MaterialDefinition, ProposalConfig } from '@/types';
import type { MaterialCosting } from "@/types/assembly";
import { calculateMaterials } from '@/services/gemini/calculateMaterials';
import { FileText, Settings } from 'lucide-react';
import { Select } from '@/components/ui';
import { LaborView } from '@/components/features/reports/LaborView';
import { MarkupsView } from '@/components/features/reports/Markups';
import { MaterialsView, ExtendedLineItem } from '@/components/features/reports/MaterialsView';
import { MatLabView } from '@/components/features/reports/MatLabView';
import { getCSISection } from '@/constants/csiSections';
import { buildProjectPriceMap } from '@/lib/utils/projectPricing';
import { aggregateMaterialsFromCosting } from '@/lib/utils/aggregateMaterialsFromCosting';

// Maps CSI division prefix (first 8 chars) → human-readable section name for the Summary Report
const CSI_SECTION_DISPLAY_NAMES: Record<string, string> = {
    '09 22 16': 'Steel Framing',
    '05 40 00': 'Structural Framing',
    '09 22 00': 'Fasteners & Accessories',
    '09 29 00': 'Drywall Boards',
    '07 21 00': 'Insulation',
    '07 84 00': 'Fire & Acoustic Caulking',
    '07 92 00': 'Fire & Acoustic Caulking',
    '07 26 00': 'Vapor Barrier',
    '06 16 00': 'Exterior Sheathing',
    '09 51 00': 'Ceiling Systems',
};

/** Maps a raw section string (e.g. "09 22 16 - Non-Structural…" or "09 22 16") to a display name. */
const getSectionDisplayName = (section: string): string => {
    const code = section.split(' - ')[0].trim().substring(0, 8);
    return CSI_SECTION_DISPLAY_NAMES[code] || section || 'Other';
};

const fmt = (v: number) =>
    v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ReportsProps {
    assemblies: WallAssembly[];
    takeoffs: Record<string, TakeoffInstance[]>;
    manualItems: CalculatedMaterial[];
    materials: MaterialDefinition[];
    materialCostingData?: MaterialCosting[];
    onUnitCostChange?: (code: string, newCost: number, type: 'material' | 'labor', unit?: string) => void;
    displayUnit: 'imperial' | 'metric';
    reportScopeId?: string | null;
    activeReportTab?: 'proposal' | 'bidding' | 'markups' | 'materials' | 'matlab' | 'labor';
    setActiveReportTab?: (tab: 'proposal' | 'bidding' | 'markups' | 'materials' | 'matlab' | 'labor') => void;
    onCloseReport?: () => void;
}

export const Reports: React.FC<ReportsProps> = ({
    assemblies,
    takeoffs,
    manualItems,
    materials,
    materialCostingData = [],
    onUnitCostChange,
    displayUnit,
    reportScopeId,
    activeReportTab,
    setActiveReportTab,
    onCloseReport
}) => {
    // Configuration
    const [config, setConfig] = useState<ProposalConfig & { escalation: number; laborBurden: number }>({
        clientName: 'Client Name',
        clientAddress: 'Project Address',
        preparedBy: 'Your Company Name',
        validityDays: 30,
        taxRate: 8.25,
        markup: 15.0,
        overhead: 10.0,
        escalation: 0,
        laborBurden: 15,
    });

    const [showConfig, setShowConfig] = useState(false);
    const [localActiveReport, setLocalActiveReport] = useState<'proposal' | 'bidding' | 'markups' | 'materials' | 'matlab' | 'labor'>('proposal');

    const activeReport = activeReportTab || localActiveReport;
    const reportFilterScope = reportScopeId || 'project-report';
    const handleReportChange = (tab: 'proposal' | 'bidding' | 'markups') => {
        if (setActiveReportTab) setActiveReportTab(tab);
        else setLocalActiveReport(tab);
    };
    const [floorFilter, setFloorFilter] = useState<string>('All');

    const safeAssemblies = assemblies || [];
    const safeTakeoffs: Record<string, TakeoffInstance[]> = takeoffs || {};

    const assemblyMap = useMemo(
        () => new Map(safeAssemblies.map((assembly) => [assembly.id, assembly])),
        [safeAssemblies],
    );

    // Price Map Calculation
    const priceMap = useMemo(() => {
        return buildProjectPriceMap(materials || []);
    }, [materials]);

    const reportCalculations = useMemo(() => {
        const proposalItems: CalculatedMaterial[] = [];
        const reportLineItems: ExtendedLineItem[] = [];
        const scopeSummary = safeAssemblies
            .map((assembly) => {
                const insts = safeTakeoffs[assembly.id] || [];
                const totalLF = insts.reduce((sum, instance) => sum + ((instance.length || 0) * (instance.quantity || 1)), 0);
                const totalSF = insts.reduce((sum, instance) => {
                    const quantity = instance.quantity || 1;
                    if (instance.ceilingArea) return sum + (instance.ceilingArea * quantity);
                    return sum + ((instance.length || 0) * (instance.height || 0) * quantity);
                }, 0);
                return { ...assembly, totalLF, totalSF };
            })
            .filter((assembly) => assembly.totalLF > 0 || assembly.totalSF > 0);

        safeAssemblies.forEach((assembly) => {
            const insts = safeTakeoffs[assembly.id] || [];

            if (insts.length > 0) {
                try {
                    proposalItems.push(
                        ...calculateMaterials(assembly, insts, materials || []),
                    );
                } catch (error) {
                    console.error("Error calculating proposal materials:", error);
                }
            }

            const levelGroups: Record<string, TakeoffInstance[]> = {};
            insts.forEach((instance) => {
                const level = instance.level || 'Unknown';
                if (!levelGroups[level]) levelGroups[level] = [];
                levelGroups[level].push(instance);
            });

            Object.entries(levelGroups).forEach(([level, levelInstances]) => {
                try {
                    const levelMaterials = calculateMaterials(
                        assembly,
                        levelInstances,
                        materials || [],
                    );
                    levelMaterials.forEach((material) => {
                        reportLineItems.push({
                            ...material,
                            area: level,
                            section: getCSISection(material.category, material.item),
                            costCode: material.laborCode || material.category,
                            conditionType: assembly.description,
                            supplier: 'Generic',
                            assemblyType: assembly.assemblyType || 'Interior Walls',
                        });
                    });
                } catch (error) {
                    console.error("Report Calc Error", error);
                }
            });
        });

        if (manualItems.length > 0) {
            proposalItems.push(...manualItems);
            manualItems.forEach((material) => {
                reportLineItems.push({
                    ...material,
                    area: 'Manual',
                    section: getCSISection(material.category, material.item),
                    costCode: material.laborCode || material.category,
                    conditionType: 'Manual Entry',
                    supplier: 'Generic',
                    assemblyType: 'Manual',
                });
            });
        }

        return {
            proposalItems,
            reportLineItems,
            scopeSummary,
        };
    }, [manualItems, materials, safeAssemblies, safeTakeoffs]);

    // Data Processing
    const proposalData = useMemo(() => {
        // 2. Group by CSI and Cost
        const csiGroups: Record<string, { material: CalculatedMaterial, cost: number }[]> = {};

        reportCalculations.proposalItems.forEach(m => {
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

        const subtotal = Object.values(csiGroups).flat().reduce((s, i) => s + i.cost, 0);

        return {
            csiGroups,
            scopeSummary: reportCalculations.scopeSummary,
            subtotal,
            allMats: reportCalculations.proposalItems,
        };
    }, [priceMap, reportCalculations]);

    // ─── Pipeline-driven proposal data (Summary Report format) ─────────────────
    const pipelineProposalData = useMemo(() => {
        if (!materialCostingData.length) return null;

        // Aggregate materials by section display name
        const materialRows = aggregateMaterialsFromCosting(materialCostingData, materials || [], priceMap);

        // Aggregate labor by code+description+unit across all assemblies
        const laborMap = new Map<string, {
            code: string; item: string; section: string;
            quantity: number; unit: string; unitCost: number; totalCost: number;
        }>();
        materialCostingData.forEach((asm) => {
            (asm.materials_costing ?? []).forEach((ci) => {
                (ci.matched_labor ?? []).forEach((lab) => {
                    const qty = (lab.quantity != null && typeof lab.quantity === 'number') ? lab.quantity : 0;
                    const key = `${lab.code}|${lab.description}|${lab.unit}`;
                    if (laborMap.has(key)) {
                        const existing = laborMap.get(key)!;
                        existing.quantity += qty;
                        existing.totalCost += qty * lab.unit_cost;
                    } else {
                        laborMap.set(key, {
                            code: lab.code,
                            item: lab.description,
                            section: lab.section ?? '—',
                            quantity: qty,
                            unit: lab.unit === 'EA' ? 'Hrs' : lab.unit,
                            unitCost: lab.unit_cost,
                            totalCost: qty * lab.unit_cost,
                        });
                    }
                });
            });
        });
        const laborRows = Array.from(laborMap.values());

        // Group materials by display section name
        const sectionMap = new Map<string, typeof materialRows>();
        materialRows.forEach((row) => {
            const name = getSectionDisplayName(row.section);
            if (!sectionMap.has(name)) sectionMap.set(name, []);
            sectionMap.get(name)!.push(row);
        });

        const materialTotal = materialRows.reduce((s, r) => s + r.totalCost, 0);
        const laborTotal = laborRows.reduce((s, r) => s + r.totalCost, 0);

        return {
            sectionMap,
            laborRows,
            materialTotal,
            laborTotal,
            grandTotal: materialTotal + laborTotal,
        };
    }, [materialCostingData, materials, priceMap]);

    // Financial Totals — uses pipeline data (materialTotal + laborTotal) when available.
    // Applies the same markup chain as the Markups tab:
    //   escalation (on direct costs) → tax (material only) → burden (labour only) → overhead → profit
    const financials = useMemo(() => {
        const materialTotal = pipelineProposalData
            ? pipelineProposalData.materialTotal
            : proposalData.subtotal || 0;
        const laborTotal = pipelineProposalData ? pipelineProposalData.laborTotal : 0;
        const netDirectCost = materialTotal + laborTotal;
        const escalationCost = netDirectCost * ((config.escalation || 0) / 100);
        const taxCost = materialTotal * ((config.taxRate || 0) / 100);
        const burdenCost = laborTotal * ((config.laborBurden || 0) / 100);
        const subWithMarkups = netDirectCost + escalationCost + taxCost + burdenCost;
        const overheadCost = subWithMarkups * ((config.overhead || 0) / 100);
        const profitBasis = subWithMarkups + overheadCost;
        const profit = profitBasis * ((config.markup || 0) / 100);
        const total = profitBasis + profit;
        return { sub: netDirectCost, materialTotal, laborTotal, escalationCost, taxCost, burdenCost, overhead: overheadCost, profit, total };
    }, [proposalData, pipelineProposalData, config]);

    // Bidding Data
    const biddingData = useMemo(() => {
        const rows: any[] = [];
        const levels = new Set<string>(['All']);

        Object.entries(safeTakeoffs).forEach(([aid, insts]) => {
            const asm = assemblyMap.get(aid);
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
    }, [assemblyMap, floorFilter, safeTakeoffs]);

    const reportLineItems = reportCalculations.reportLineItems;
    const materialReportLineItems = useMemo(
        () => reportLineItems.filter((item) => item.category !== 'Labor'),
        [reportLineItems],
    );
    const laborReportLineItems = useMemo(
        () => reportLineItems.filter((item) => item.category === 'Labor'),
        [reportLineItems],
    );

    // Dynamic Header Logic
    const getHeaderInfo = () => {
        switch (activeReport) {
            case 'materials': return { title: 'Materials', icon: null };
            case 'matlab': return { title: 'Mat+Lab', icon: null };
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
                    ) : (activeReport === 'bidding' || activeReport === 'materials' || activeReport === 'matlab' || activeReport === 'labor' ? (
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

                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {activeReport === 'bidding' ? (
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex justify-center items-start">
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
                    <MaterialsView
                        items={materialReportLineItems}
                        materialCostingData={materialCostingData}
                        materials={materials}
                        priceMap={priceMap}
                        filterStorageKey={`${reportFilterScope}:materials`}
                        onUnitCostChange={onUnitCostChange ? (code, newCost, unit) => onUnitCostChange(code, newCost, 'material', unit) : undefined}
                    />
                ) : activeReport === 'matlab' ? (
                    <MatLabView
                        materialCostingData={materialCostingData}
                        priceMap={priceMap}
                        filterStorageKey={`${reportFilterScope}:matlab`}
                    />
                ) : activeReport === 'labor' ? (
                    <LaborView
                        items={laborReportLineItems}
                        materialCostingData={materialCostingData}
                        priceMap={priceMap}
                        materials={materials}
                        filterStorageKey={`${reportFilterScope}:labor`}
                        onUnitCostChange={onUnitCostChange ? (code, newCost) => onUnitCostChange(code, newCost, 'labor') : undefined}
                    />
                ) : activeReport === 'markups' ? (
                    <MarkupsView
                        markupItems={reportLineItems}
                        materialCostingData={materialCostingData}
                        priceMap={priceMap}
                        filterStorageKey={`${reportFilterScope}:markups`}
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
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Project Name</label>
                                            <input type="text" value={config.clientName} onChange={e => setConfig({ ...config, clientName: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Project Location</label>
                                            <input type="text" value={config.clientAddress} onChange={e => setConfig({ ...config, clientAddress: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Summary Report Preview */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex justify-center items-start">
                            <div className="w-[210mm] min-h-[297mm] bg-white shadow-lg p-[15mm] flex flex-col gap-6 print:w-full print:shadow-none print:p-0">

                                {/* Report Header */}
                                <header className="border-b-2 border-slate-800 pb-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">Summary Report</h1>
                                            <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                                                <p><span className="font-semibold">Project:</span> {config.clientName}</p>
                                                <p><span className="font-semibold">Project Location:</span> {config.clientAddress}</p>
                                                <p><span className="font-semibold">Scope of Work:</span> Metal Stud, Insulation &amp; Drywall</p>
                                            </div>
                                        </div>
                                        <div className="text-right text-sm text-slate-500">
                                            <p className="font-semibold text-slate-700">{config.preparedBy}</p>
                                            <p>{new Date().toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                </header>

                                {pipelineProposalData ? (
                                    <>
                                        {/* Material Sections */}
                                        {Array.from(pipelineProposalData.sectionMap.entries()).map(([sectionName, rows]) => {
                                            const sectionTotal = rows.reduce((s, r) => s + r.totalCost, 0);
                                            return (
                                                <div key={sectionName}>
                                                    <h3 className="text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 mb-0 uppercase tracking-wide">
                                                        {sectionName}
                                                    </h3>
                                                    <table className="w-full text-xs border border-slate-200 border-t-0 table-fixed">
                                                        <colgroup>
                                                            <col />
                                                            <col className="w-20" />
                                                            <col className="w-10" />
                                                            <col className="w-24" />
                                                            <col className="w-32" />
                                                        </colgroup>
                                                        <thead className="bg-slate-100 text-slate-600">
                                                            <tr>
                                                                <th className="text-left px-3 py-2 font-semibold">Description</th>
                                                                <th className="text-right px-3 py-2 font-semibold">Quantity</th>
                                                                <th className="text-center px-3 py-2 font-semibold">Unit</th>
                                                                <th className="text-right px-3 py-2 font-semibold">Unit Price</th>
                                                                <th className="text-right px-3 py-2 font-semibold">Total</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {rows.map((row, i) => (
                                                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                                    <td className="px-3 py-1.5 text-slate-800">{row.item}</td>
                                                                    <td className="px-3 py-1.5 text-right font-mono text-slate-700 whitespace-nowrap">
                                                                        {row.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-center text-slate-500 whitespace-nowrap">{row.unit}</td>
                                                                    <td className="px-3 py-1.5 text-right font-mono text-slate-600 whitespace-nowrap">
                                                                        ${row.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-right font-semibold font-mono text-slate-800 whitespace-nowrap">
                                                                        ${fmt(row.totalCost)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        <tfoot className="bg-slate-100 border-t border-slate-300">
                                                            <tr>
                                                                <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-bold text-slate-700 uppercase tracking-wide whitespace-nowrap">
                                                                    {sectionName} Total
                                                                </td>
                                                                <td className="px-3 py-1.5 text-right font-bold text-slate-900 font-mono whitespace-nowrap">
                                                                    ${fmt(sectionTotal)}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            );
                                        })}

                                        {/* Labour Cost */}
                                        {pipelineProposalData.laborRows.length > 0 && (
                                            <div>
                                                <h3 className="text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 mb-0 uppercase tracking-wide">
                                                    Labour Cost
                                                </h3>
                                                <table className="w-full text-xs border border-slate-200 border-t-0 table-fixed">
                                                    <colgroup>
                                                        <col />
                                                        <col className="w-20" />
                                                        <col className="w-10" />
                                                        <col className="w-24" />
                                                        <col className="w-32" />
                                                    </colgroup>
                                                    <thead className="bg-slate-100 text-slate-600">
                                                        <tr>
                                                            <th className="text-left px-3 py-2 font-semibold">Description</th>
                                                            <th className="text-right px-3 py-2 font-semibold">Quantity</th>
                                                            <th className="text-center px-3 py-2 font-semibold">Unit</th>
                                                            <th className="text-right px-3 py-2 font-semibold">Unit Price</th>
                                                            <th className="text-right px-3 py-2 font-semibold">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {pipelineProposalData.laborRows.map((row, i) => (
                                                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                                <td className="px-3 py-1.5 text-slate-800">{row.item}</td>
                                                                <td className="px-3 py-1.5 text-right font-mono text-slate-700 whitespace-nowrap">
                                                                    {row.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-center text-slate-500 whitespace-nowrap">{row.unit}</td>
                                                                <td className="px-3 py-1.5 text-right font-mono text-slate-600 whitespace-nowrap">
                                                                    ${fmt(row.unitCost)}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-right font-semibold font-mono text-slate-800 whitespace-nowrap">
                                                                    {row.totalCost > 0 ? `$${fmt(row.totalCost)}` : <span className="text-slate-300">—</span>}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot className="bg-slate-100 border-t border-slate-300">
                                                        <tr>
                                                            <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-bold text-slate-700 uppercase tracking-wide whitespace-nowrap">
                                                                Labour Total
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right font-bold text-slate-900 font-mono whitespace-nowrap">
                                                                ${fmt(pipelineProposalData.laborTotal)}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        )}

                                        {/* Grand Total Summary */}
                                        <div className="border-t-2 border-slate-800 pt-4">
                                            <table className="w-full text-xs mb-4">
                                                <thead className="bg-slate-800 text-white">
                                                    <tr>
                                                        <th className="text-left px-3 py-2">Cost Category</th>
                                                        <th className="text-right px-3 py-2 w-36">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {Array.from(pipelineProposalData.sectionMap.entries()).map(([name, rows]) => (
                                                        <tr key={name} className="bg-white">
                                                            <td className="px-3 py-1.5 text-slate-700">{name} Material Cost</td>
                                                            <td className="px-3 py-1.5 text-right font-mono text-slate-800">
                                                                ${fmt(rows.reduce((s, r) => s + r.totalCost, 0))}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {pipelineProposalData.laborRows.length > 0 && (
                                                        <tr className="bg-white">
                                                            <td className="px-3 py-1.5 text-slate-700">Total Labour Cost</td>
                                                            <td className="px-3 py-1.5 text-right font-mono text-slate-800">
                                                                ${fmt(pipelineProposalData.laborTotal)}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-slate-800 text-white">
                                                        <td className="px-3 py-2 font-bold text-sm">Grand Total (without markups)</td>
                                                        <td className="px-3 py-2 text-right font-bold text-sm font-mono">
                                                            ${fmt(pipelineProposalData.grandTotal)}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                            <p className="text-[10px] text-slate-400 mt-2">
                                                A 5% consideration has been included in the estimate to account for general project variations.
                                                All wall heights have been rounded up to the nearest full foot to align with standard stud lengths.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Fallback: calculateMaterials-based view (no pipeline data) */}
                                        <div className="flex-1">
                                            <h3 className="bg-slate-100 px-3 py-1.5 font-bold text-slate-700 text-sm border-l-4 border-emerald-500 mb-4 uppercase tracking-wide">Detailed Cost Breakdown</h3>
                                            {Object.keys(proposalData.csiGroups).length === 0 ? (
                                                <p className="text-sm text-slate-500 py-8 text-center">
                                                    No data available. Run the pipeline to generate cost estimates.
                                                </p>
                                            ) : (
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
                                                                                <td className="py-1 text-right text-slate-500 w-32 whitespace-nowrap">
                                                                                    {(x.material.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} {x.material.unit}
                                                                                </td>
                                                                                <td className="py-1 text-right font-medium text-slate-800 w-36 whitespace-nowrap">
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
                                            )}
                                        </div>
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
                                    </>
                                )}

                                {/* Footer */}
                                <footer className="text-center text-[10px] text-slate-400 mt-4 pt-4 border-t border-slate-100">
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
