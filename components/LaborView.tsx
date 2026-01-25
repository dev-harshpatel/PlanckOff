import React, { useState, useMemo } from 'react';
import { ExtendedLineItem } from './MaterialsView';
import { Filter, Download } from 'lucide-react';

interface LaborViewProps {
    items: ExtendedLineItem[];
    priceMap: Record<string, { cost: number, per: number }>;
}

export const LaborView: React.FC<LaborViewProps> = ({ items, priceMap }) => {
    // Filters State
    const [filters, setFilters] = useState({
        area: 'All',
        costCode: 'All',
        condition: 'All'
    });

    // Extract Unique Values
    const options = useMemo(() => {
        const getOpts = (field: keyof ExtendedLineItem) => Array.from(new Set(items.map(i => i[field] || 'Unknown'))).sort();
        return {
            areas: getOpts('area'),
            costCodes: getOpts('costCode'),
            conditions: getOpts('conditionType')
        };
    }, [items]);

    // Filter Items
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            if (filters.area !== 'All' && item.area !== filters.area) return false;
            if (filters.costCode !== 'All' && item.costCode !== filters.costCode) return false;
            if (filters.condition !== 'All' && item.conditionType !== filters.condition) return false;
            return true;
        });
    }, [items, filters]);

    const formatCurrency = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const totalLaborCost = filteredItems.reduce((acc, item) => {
        const price = priceMap[item.item] || { cost: 0, per: 1 };
        return acc + (item.quantity * (price.cost / price.per));
    }, 0);


    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Toolbar / Filters */}
            <div className="bg-white p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-3 items-center">
                    <Filter className="w-4 h-4 text-slate-400" />

                    {/* Area Filter */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Area</label>
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

                    {/* Condition Filter */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Condition</label>
                        <select
                            value={filters.condition}
                            onChange={e => setFilters({ ...filters, condition: e.target.value })}
                            className="text-xs border border-slate-300 rounded px-2 py-1 min-w-[200px]"
                        >
                            <option value="All">All Conditions</option>
                            {options.conditions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                </div>

                <div className="flex items-center gap-4">
                    <div className="text-sm font-bold text-slate-700">
                        Total Labor: ${formatCurrency(totalLaborCost)}
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
                            <th className="p-3 border-b">Cost Code</th>
                            <th className="p-3 border-b">Description</th>
                            <th className="p-3 border-b">Condition Name</th>
                            <th className="p-3 border-b text-right">Quantity / Hrs</th>
                            <th className="p-3 border-b text-center">UOM</th>
                            <th className="p-3 border-b text-right">Wage Type</th>
                            <th className="p-3 border-b text-right">Rate</th>
                            <th className="p-3 border-b text-right">Total Cost</th>
                            <th className="p-3 border-b text-right">Area</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredItems.map((item, idx) => {
                            const price = priceMap[item.item] || { cost: 0, per: 1 };
                            const unitCost = price.cost / price.per;
                            const total = item.quantity * unitCost;

                            return (
                                <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                                    <td className="p-2 pl-3 font-mono text-slate-500">{item.costCode}</td>
                                    <td className="p-2 font-medium text-slate-800">{item.item}</td>
                                    <td className="p-2 text-slate-600">{item.conditionType}</td>
                                    <td className="p-2 text-right font-medium">{item.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                    <td className="p-2 text-center text-slate-500">{item.unit === 'EA' ? 'Hrs' : item.unit}</td>
                                    <td className="p-2 text-right text-slate-500">Open Shop</td>
                                    <td className="p-2 text-right text-slate-600">${formatCurrency(unitCost)}</td>
                                    <td className="p-2 text-right font-bold text-slate-800">${formatCurrency(total)}</td>
                                    <td className="p-2 text-right text-slate-500">{item.area}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
