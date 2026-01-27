'use client';

import React, { useState, useMemo } from 'react';
import { CalculatedMaterial, GeneralRequirement, GcCategory } from '@/types';
import { PieChart, DollarSign, Percent, Calculator } from 'lucide-react';

interface MarkupsProps {
    calculatedMaterials: CalculatedMaterial[];
    priceMap: Record<string, { cost: number; per: number }>;
    currencySymbol?: string;
}

interface MarkupConfig {
    escalation: number;
    tax: number;
    laborBurden: number;
    overhead: number;
    profit: number;
}

interface CostCategory {
    name: string;
    value: number;
    color: string;
}

export const MarkupsView: React.FC<MarkupsProps> = ({ calculatedMaterials, priceMap, currencySymbol = '$' }) => {
    const [config, setConfig] = useState<MarkupConfig>({
        escalation: 0,
        tax: 8.25,
        laborBurden: 15,
        overhead: 10,
        profit: 15
    });

    const [generalConditions, setGeneralConditions] = useState<GeneralRequirement[]>([
        // STAFFING
        { id: 'st1', category: 'Staffing', description: 'Site Supervisor', quantity: 20, unit: 'wk', rate: 70 * 40, total: 0 },
        { id: 'st2', category: 'Staffing', description: 'Non-working Foreman', quantity: 0, unit: 'wk', rate: 70 * 40, total: 0 },
        { id: 'st3', category: 'Staffing', description: 'Project Manager', quantity: 15, unit: 'wk', rate: 65 * 10, total: 0 }, // Partial allocation example
        { id: 'st4', category: 'Staffing', description: 'Health & Safety', quantity: 5, unit: 'wk', rate: 45 * 10, total: 0 },

        // SITE GCs
        { id: 'gc1', category: 'Site', description: 'Weekly Cleaning', quantity: 0, unit: 'wk', rate: 600, total: 0 },
        { id: 'gc2', category: 'Site', description: 'Site Safety & Signage', quantity: 1, unit: 'ls', rate: 250, total: 0 },
        { id: 'gc3', category: 'Site', description: 'Small Tools & Supplies', quantity: 1, unit: 'ls', rate: 500, total: 0 },
        { id: 'gc4', category: 'Site', description: 'Scissor Lift', quantity: 1, unit: 'mo', rate: 1500, total: 0 },
        { id: 'gc5', category: 'Site', description: 'Deliveries / Hoisting', quantity: 5, unit: 'ea', rate: 250, total: 0 },
        { id: 'gc6', category: 'Site', description: 'Disposal / Bins', quantity: 5, unit: 'ea', rate: 600, total: 0 },

        // ADMIN
        { id: 'ad1', category: 'Admin', description: 'Project Documentation', quantity: 1, unit: 'ls', rate: 1000, total: 0 },
        { id: 'ad2', category: 'Admin', description: 'Fuel & Oil', quantity: 0, unit: 'wk', rate: 125, total: 0 },
    ]);

    const updateGcItem = (id: string, field: keyof GeneralRequirement, value: string | number) => {
        setGeneralConditions(prev => prev.map(item => {
            if (item.id !== id) return item;
            const updated = { ...item, [field]: value };
            // Recalculate total if qty or rate changes
            if (field === 'quantity' || field === 'rate') {
                updated.total = (typeof updated.quantity === 'number' ? updated.quantity : 0) * (typeof updated.rate === 'number' ? updated.rate : 0);
            }
            return updated;
        }));
    };

    // Calculate initial totals based on default Qty/Rate
    useMemo(() => {
        // This is a side-effect in render, but strictly for initialization correctness if needed. 
        // Better to just calculate derived total on the fly or ensure state is consistent.
        // For now, the state initializes with 0 total but we can compute it.
        // Actually, let's just compute total in render for display/aggregates to avoid sync issues.
    }, []);


    // 1. Calculate Costs by Trade (Material vs Labor)
    const tradeCosts = useMemo(() => {
        const trades: Record<string, { material: number; labor: number }> = {
            'Steel Framing': { material: 0, labor: 0 },
            'Drywall & Insulation': { material: 0, labor: 0 },
            'Acoustical Ceilings': { material: 0, labor: 0 },
            'Rough Carpentry': { material: 0, labor: 0 },
            'Other': { material: 0, labor: 0 }
        };

        calculatedMaterials.forEach(m => {
            // Determine Trade
            let trade = 'Other';
            const cat = m.category || '';
            const sect = m.sect || '';
            const desc = m.item.toLowerCase();

            if (cat.includes('Framing') || sect.includes('Metal') || desc.includes('stud') || desc.includes('track')) trade = 'Steel Framing';
            else if (cat.includes('Drywall') || cat.includes('Finishing') || cat.includes('Insulation') || desc.includes('board') || desc.includes('mud') || desc.includes('tape')) trade = 'Drywall & Insulation';
            else if (cat.includes('Ceiling') || sect.includes('Ceiling') || desc.includes('grid') || desc.includes('tile')) trade = 'Acoustical Ceilings';
            else if (cat.includes('Wood') || sect.includes('Carpentry') || desc.includes('blocking') || desc.includes('wood')) trade = 'Rough Carpentry';

            // Calculate Item Cost
            let pricing = priceMap[m.item];
            if (!pricing && m.item.includes('@')) pricing = priceMap[m.item.split('@')[0].trim()];
            if (m.overridePrice !== undefined) pricing = { cost: m.overridePrice, per: 1 };

            let cost = 0;
            if (pricing) {
                let qty = m.quantity || 0;
                if (m.unit.includes('sheet')) qty = (m.quantity || 0) * 48; // Estimate
                cost = qty * (pricing.cost / (pricing.per || 1));
            }

            // Assign to Material or Labor
            // Rule: If category is strictly 'Labor' OR the item name suggests labor (e.g. 'Install'), it's labor.
            // BUT: m.category is usually reliable if generated by EstimateResult. 
            // However, 'Labor' items need to be assigned to a Trade too.
            // If m.category is 'Labor', we used the string matching above to find the trade.

            const isLabor = cat === 'Labor' || desc.includes('labor') || desc.includes('install');

            if (isLabor) {
                trades[trade].labor += cost;
            } else {
                trades[trade].material += cost;
            }
        });

        return trades;
    }, [calculatedMaterials, priceMap]);

    // 2. Aggregates & Markups
    const totals = useMemo(() => {
        let totalMaterial = 0;
        let totalLabor = 0;

        Object.values(tradeCosts).forEach(val => {
            const t = val as { material: number; labor: number };
            totalMaterial += t.material;
            totalLabor += t.labor;
        });

        // Calculate General Conditions
        const gcTotal = generalConditions.reduce((sum, item) => sum + (item.quantity * item.rate), 0);

        const netDirectCost = totalMaterial + totalLabor;
        const grossCost = netDirectCost + gcTotal; // "Sub Total" before markups

        // Apply Markups
        // Escalation on Gross Cost
        const escalationCost = grossCost * (config.escalation / 100);

        // Tax usually on Material only
        const taxCost = totalMaterial * (config.tax / 100);

        // Burden on Labor only
        const burdenCost = totalLabor * (config.laborBurden / 100);

        // Subtotal before O&P
        const subTotalWithTaxes = grossCost + escalationCost + taxCost + burdenCost;

        const overheadCost = subTotalWithTaxes * (config.overhead / 100);
        const profitBasis = subTotalWithTaxes + overheadCost;
        const profitCost = profitBasis * (config.profit / 100);

        const finalTotal = profitBasis + profitCost;

        return {
            totalMaterial,
            totalLabor,
            gcTotal,
            netDirectCost,
            grossCost,
            escalationCost,
            taxCost,
            burdenCost,
            subTotalWithTaxes,
            overheadCost,
            profitCost,
            finalTotal
        };
    }, [tradeCosts, generalConditions, config]);


    // Pie Data
    const pieData = [
        { name: 'Material', value: totals.totalMaterial, color: '#22c55e' },
        { name: 'Labor', value: totals.totalLabor, color: '#3b82f6' },
        { name: 'Gen. Req.', value: totals.gcTotal, color: '#ef4444' },
        { name: 'Markups', value: totals.finalTotal - totals.grossCost, color: '#a855f7' },
    ].filter(d => d.value > 0);


    const formatCurrency = (val: number) => {
        return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    const renderGcSection = (title: string, category: GcCategory) => (
        <div className="mb-6">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 border-b pb-1">{title}</h4>
            <div className="space-y-1">
                {generalConditions.filter(i => i.category === category).map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-sm hover:bg-slate-50 p-1 rounded group">
                        <input
                            type="text"
                            value={item.description}
                            onChange={e => updateGcItem(item.id, 'description', e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-slate-700 font-medium text-xs focus:ring-0 p-0"
                        />
                        <div className="flex items-center gap-1 w-20">
                            <input
                                type="number"
                                value={item.quantity}
                                onChange={e => updateGcItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-12 text-right border border-slate-200 rounded px-1 text-xs focus:border-blue-400 outline-none"
                            />
                            <span className="text-slate-400 text-[10px] w-6">{item.unit}</span>
                        </div>
                        <div className="w-20 text-right">
                            <input
                                type="number"
                                value={item.rate}
                                onChange={e => updateGcItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                                className="w-full text-right border-none bg-transparent outline-none text-xs text-slate-500"
                            />
                        </div>
                        <div className="w-20 text-right font-medium text-slate-800">
                            {formatCurrency(item.quantity * item.rate)}
                        </div>
                        <button
                            onClick={() => {
                                const newItems = generalConditions.filter(g => g.id !== item.id);
                                setGeneralConditions(newItems);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-1"
                        >
                            &times;
                        </button>
                    </div>
                ))}
                <button
                    onClick={() => setGeneralConditions([...generalConditions, {
                        id: crypto.randomUUID(),
                        category: category,
                        description: 'New Item',
                        quantity: 0,
                        unit: 'ls',
                        rate: 0,
                        total: 0
                    }])}
                    className="text-[10px] text-blue-600 font-medium hover:underline mt-1 pl-1"
                >
                    + Add {title} Item
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex h-full bg-slate-50 overflow-hidden">

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-6 flex-1 overflow-y-auto">
                    <div className="flex gap-8 mb-8">
                        {/* Chart Area */}
                        <div className="w-1/4 bg-white p-4 rounded-lg shadow-sm border border-slate-100 flex flex-col items-center justify-start">
                            <h3 className="text-sm font-medium text-slate-500 mb-4 w-full text-left">Cost Distribution</h3>
                            <div className="relative w-40 h-40 rounded-full" style={{
                                background: `conic-gradient(${(() => {
                                    let currentAngle = 0;
                                    const total = pieData.reduce((s, i) => s + i.value, 0);
                                    return pieData.map(d => {
                                        const start = currentAngle;
                                        const angle = total > 0 ? (d.value / total) * 360 : 0;
                                        currentAngle += angle;
                                        return `${d.color} ${start}deg ${currentAngle}deg`;
                                    }).join(', ')
                                })()
                                    })`
                            }}>
                                <div className="absolute inset-0 m-auto w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-inner">
                                    <span className="text-xs font-bold text-slate-500">Total</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 mt-6 w-full px-2">
                                {pieData.map(d => (
                                    <div key={d.name} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ background: d.color }}></div>
                                            <span className="text-slate-600">{d.name}</span>
                                        </div>
                                        <span className="font-medium text-slate-800">{currencySymbol}{formatCurrency(d.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>


                        {/* Breakdown Table */}
                        <div className="flex-1 bg-white p-6 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-6">

                            {/* Trade Breakdown */}
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 mb-4">Trade Breakdown (Division 05-09)</h2>
                                <table className="w-full text-sm mb-4">
                                    <thead>
                                        <tr className="text-slate-500 border-b border-slate-200">
                                            <th className="text-left font-medium py-2 pl-2">Trade / Category</th>
                                            <th className="text-right font-medium py-2 w-32">Material Cost</th>
                                            <th className="text-right font-medium py-2 w-32">Labor Cost</th>
                                            <th className="text-right font-medium py-2 w-32 font-bold text-slate-700">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {Object.entries(tradeCosts)
                                            .filter(([_, costs]) => (costs as { material: number; labor: number }).material > 0 || (costs as { material: number; labor: number }).labor > 0)
                                            .map(([trade, c]) => {
                                                const costs = c as { material: number; labor: number };
                                                return (
                                                    <tr key={trade} className="hover:bg-slate-50 transition-colors">
                                                        <td className="py-3 pl-2 text-slate-700 font-medium">{trade}</td>
                                                        <td className="py-3 text-right text-slate-600">{formatCurrency(costs.material)}</td>
                                                        <td className="py-3 text-right text-slate-600">{formatCurrency(costs.labor)}</td>
                                                        <td className="py-3 text-right font-bold text-slate-800 bg-slate-50/50">{formatCurrency(costs.material + costs.labor)}</td>
                                                    </tr>
                                                )
                                            })}
                                        <tr className="bg-slate-100 font-bold border-t border-slate-200">
                                            <td className="py-3 pl-2 text-slate-800">Direct Cost Subtotal</td>
                                            <td className="py-3 text-right text-slate-800">{formatCurrency(totals.totalMaterial)}</td>
                                            <td className="py-3 text-right text-slate-800">{formatCurrency(totals.totalLabor)}</td>
                                            <td className="py-3 text-right text-slate-900 bg-slate-200/50">{formatCurrency(totals.netDirectCost)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* General Requirements Section */}
                            <div className="border-t border-dashed border-slate-200 pt-6">
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex justify-between items-center">
                                    <span>General Requirements (Division 01)</span>
                                    <span className="text-sm font-normal text-slate-500">{currencySymbol}{formatCurrency(totals.gcTotal)}</span>
                                </h2>

                                <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                                    {renderGcSection('Staffing / Supervision', 'Staffing')}
                                    {renderGcSection('General Conditions', 'Site')}
                                    {renderGcSection('Administrative', 'Admin')}
                                </div>
                            </div>

                            {/* Final Markups Summary */}
                            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mt-2">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">Final Calculations</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">Net Direct Cost</span>
                                        <span className="font-bold text-slate-800">{formatCurrency(totals.netDirectCost)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-600">General Requirements</span>
                                        <span className="font-bold text-slate-800">{formatCurrency(totals.gcTotal)}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                                        <span className="text-slate-700">Gross Cost (Base)</span>
                                        <span className="text-slate-800">{formatCurrency(totals.grossCost)}</span>
                                    </div>

                                    <div className="flex justify-between items-center pl-4 border-l-2 border-blue-200 mt-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500">Escalation</span>
                                            <input type="number" value={config.escalation} onChange={e => setConfig({ ...config, escalation: parseFloat(e.target.value) || 0 })} className="w-12 text-center text-xs border rounded bg-white px-1" />
                                            <span className="text-xs text-slate-400">%</span>
                                        </div>
                                        <span>{formatCurrency(totals.escalationCost)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pl-4 border-l-2 border-green-200">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500">Tax</span>
                                            <input type="number" value={config.tax} onChange={e => setConfig({ ...config, tax: parseFloat(e.target.value) || 0 })} className="w-12 text-center text-xs border rounded bg-white px-1" />
                                            <span className="text-xs text-slate-400">% (Mat Only)</span>
                                        </div>
                                        <span>{formatCurrency(totals.taxCost)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pl-4 border-l-2 border-red-200">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500">Labor Burden</span>
                                            <input type="number" value={config.laborBurden} onChange={e => setConfig({ ...config, laborBurden: parseFloat(e.target.value) || 0 })} className="w-12 text-center text-xs border rounded bg-white px-1" />
                                            <span className="text-xs text-slate-400">% (Lab Only)</span>
                                        </div>
                                        <span>{formatCurrency(totals.burdenCost)}</span>
                                    </div>

                                    <div className="border-t border-slate-200 my-2"></div>

                                    <div className="flex justify-between font-bold text-slate-700">
                                        <span>Total with Direct Markups</span>
                                        <span>{formatCurrency(totals.subTotalWithTaxes)}</span>
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500">Overhead</span>
                                            <input type="number" value={config.overhead} onChange={e => setConfig({ ...config, overhead: parseFloat(e.target.value) || 0 })} className="w-12 text-center text-xs border rounded bg-white px-1" />
                                            <span className="text-xs text-slate-400">%</span>
                                        </div>
                                        <span>{formatCurrency(totals.overheadCost)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500">Profit</span>
                                            <input type="number" value={config.profit} onChange={e => setConfig({ ...config, profit: parseFloat(e.target.value) || 0 })} className="w-12 text-center text-xs border rounded bg-white px-1" />
                                            <span className="text-xs text-slate-400">%</span>
                                        </div>
                                        <span>{formatCurrency(totals.profitCost)}</span>
                                    </div>

                                    <div className="bg-slate-800 text-white p-3 rounded flex justify-between items-center mt-4">
                                        <span className="font-bold text-lg">Total Bid Price</span>
                                        <span className="font-bold text-xl">{currencySymbol}{formatCurrency(totals.finalTotal)}</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
