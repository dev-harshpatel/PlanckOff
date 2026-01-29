'use client';

import React, { useState, useMemo } from 'react';
import { MaterialDefinition, CalculatedMaterial } from '@/types';
import { Filter, Download } from 'lucide-react';

interface MaterialsViewProps {
    items: ExtendedLineItem[];
    priceMap: Record<string, { cost: number, per: number }>;
}

export interface ExtendedLineItem extends CalculatedMaterial {
    area: string; // Level/Floor
    costCode: string;
    section: string;
    conditionType: string; // Assembly Name
    supplier: string;
}

export const MaterialsView: React.FC<MaterialsViewProps> = ({ items, priceMap }) => {
    // Filters State
    const [filters, setFilters] = useState({
        section: 'All',
        area: 'All',
        costCode: 'All',
        supplier: 'All'
    });

    // Extract Unique Values for Dropdowns
    const options = useMemo(() => {
        const getOpts = (field: keyof ExtendedLineItem) => Array.from(new Set(items.map(i => i[field] || 'Unknown'))).sort();
        return {
            sections: getOpts('section'),
            areas: getOpts('area'),
            costCodes: getOpts('costCode'),
            suppliers: getOpts('supplier')
        };
    }, [items]);

    // Filter Items
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            if (filters.section !== 'All' && item.section !== filters.section) return false;
            if (filters.area !== 'All' && item.area !== filters.area) return false;
            if (filters.costCode !== 'All' && item.costCode !== filters.costCode) return false;
            if (filters.supplier !== 'All' && item.supplier !== filters.supplier) return false;
            return true;
        });
    }, [items, filters]);

    const formatCurrency = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Grouping for Totals (Optional? Usually Material list is flat or grouped by Section)
    // The screenshot suggests a flat list with totals.

    const totalCost = filteredItems.reduce((acc, item) => {
        const pricing = priceMap[item.item] || { cost: 0, per: 1 };
        let qty = item.quantity;
        if (item.unit.includes('sheet') || item.unit.includes('board')) qty = item.quantity * 48; // Crude Approx if needed, but priceMap usually aligns
        // Better: Use calculated cost if available in item (we might need to ensure cost is calculated)
        // For now, simple calc:
        return acc + (item.quantity * (pricing.cost / pricing.per));
    }, 0);


    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Toolbar / Filters */}
            <div className="bg-white p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-3 items-center">
                    <Filter className="w-4 h-4 text-slate-400" />

                    {/* Section Filter */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Section</label>
                        <select
                            value={filters.section}
                            onChange={e => setFilters({ ...filters, section: e.target.value })}
                            className="text-xs border border-slate-300 rounded px-2 py-1 min-w-[150px]"
                        >
                            <option value="All">All Sections</option>
                            {options.sections.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* Area Filter */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Area / Floor</label>
                        <select
                            value={filters.area}
                            onChange={e => setFilters({ ...filters, area: e.target.value })}
                            className="text-xs border border-slate-300 rounded px-2 py-1 min-w-[120px]"
                        >
                            <option value="All">All Areas</option>
                            {options.areas.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* Cost Code Filter */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Cost Code</label>
                        <select
                            value={filters.costCode}
                            onChange={e => setFilters({ ...filters, costCode: e.target.value })}
                            className="text-xs border border-slate-300 rounded px-2 py-1 min-w-[120px]"
                        >
                            <option value="All">All Codes</option>
                            {options.costCodes.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* Supplier Filter */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Supplier</label>
                        <select
                            value={filters.supplier}
                            onChange={e => setFilters({ ...filters, supplier: e.target.value })}
                            className="text-xs border border-slate-300 rounded px-2 py-1 min-w-[120px]"
                        >
                            <option value="All">All Suppliers</option>
                            {options.suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-sm font-bold text-slate-700">
                        Total: ${formatCurrency(totalCost)}
                    </div>
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors">
                        <Download className="w-4 h-4" /> Export
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-3 border-b">Item Code</th>
                            <th className="p-3 border-b">Description</th>
                            <th className="p-3 border-b">Section / Area</th>
                            <th className="p-3 border-b">Cost Code</th>
                            <th className="p-3 border-b text-right">Quantity</th>
                            <th className="p-3 border-b text-center">UOM</th>
                            <th className="p-3 border-b text-right">Unit Cost</th>
                            <th className="p-3 border-b text-right">Waste</th>
                            <th className="p-3 border-b text-right">Total Cost</th>
                            <th className="p-3 border-b text-right">Supplier</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredItems.map((item, idx) => {
                            const price = priceMap[item.item] || { cost: 0, per: 1 };
                            const unitCost = price.cost / price.per;
                            const total = item.quantity * unitCost;

                            return (
                                <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                                    <td className="p-2 pl-3 font-mono text-slate-500">{item.item.substring(0, 8)}</td>
                                    <td className="p-2 font-medium text-slate-800">{item.item}</td>
                                    <td className="p-2 text-slate-500">
                                        <div className="flex flex-col">
                                            <span>{item.section}</span>
                                            <span className="text-[10px] text-slate-400">{item.area}</span>
                                        </div>
                                    </td>
                                    <td className="p-2 text-slate-600">{item.costCode}</td>
                                    <td className="p-2 text-right font-medium">{item.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                    <td className="p-2 text-center text-slate-500">{item.unit}</td>
                                    <td className="p-2 text-right text-slate-600">${formatCurrency(unitCost)}</td>
                                    <td className="p-2 text-right text-slate-500">{(item.wastePercent ? item.wastePercent * 100 : 0).toFixed(0)}%</td>
                                    <td className="p-2 text-right font-bold text-slate-800">${formatCurrency(total)}</td>
                                    <td className="p-2 text-right text-slate-500">{item.supplier}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
