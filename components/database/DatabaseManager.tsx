'use client';

import React, { useState } from 'react';
import { MaterialDefinition } from '@/types';
import { Search, Plus, Download, Upload, X, Save, Trash2, Database } from 'lucide-react';
import { read, utils, writeFile } from 'xlsx';
import { Button, IconButton, SearchInput } from '@/components/common';

interface DatabaseManagerProps {
    materials: MaterialDefinition[];
    onUpdateMaterials: (materials: MaterialDefinition[]) => void;
}

export const DatabaseManager: React.FC<DatabaseManagerProps> = ({ materials, onUpdateMaterials }) => {
    const [dbCategory, setDbCategory] = useState<string>('All');
    const [dbSearch, setDbSearch] = useState('');
    const [isAddingMat, setIsAddingMat] = useState(false);

    const [newMaterial, setNewMaterial] = useState<Partial<MaterialDefinition>>({
        category: 'Framing',
        per: '1,000 LF',
        matCost: 0,
        section: '09 20 00',
        type: 'Division 09',
        manufacturer: '',
        width: '',
        gauge: '',
        flange: ''
    });

    const handleAddMaterial = () => {
        if (!newMaterial.description) return;
        const newItem: MaterialDefinition = {
            code: `MAT-${Date.now()}`,
            section: newMaterial.section || '00 00 00',
            matCostCode: newMaterial.matCostCode || 'GEN',
            laborCostCode: '',
            type: newMaterial.type || 'Material',
            manufacturer: newMaterial.manufacturer || 'Generic',
            description: newMaterial.description || 'New Material',
            matCost: newMaterial.matCost || 0,
            per: newMaterial.per || (newMaterial.category === 'Drywall' || newMaterial.category === 'Insulation' ? '1,000 SF' : newMaterial.category === 'Framing' ? '1 LF' : '1 EA'),
            priceUpdated: new Date().toLocaleDateString(),
            category: newMaterial.category as any || 'Other',
            width: newMaterial.width,
            gauge: newMaterial.gauge,
            flange: newMaterial.flange,
            productivity: newMaterial.productivity
        };
        onUpdateMaterials([...materials, newItem]);
        const nextCat = dbCategory === 'All' ? 'Framing' : dbCategory;
        setNewMaterial({
            category: nextCat as any,
            per: (nextCat === 'Drywall' || nextCat === 'Insulation') ? '1,000 SF' : nextCat === 'Framing' ? '1 LF' : '1 EA',
            matCost: 0, section: '00 00 00', manufacturer: '', width: '', gauge: '', flange: ''
        });
        setIsAddingMat(false);
    };

    const handleUpdateNewMaterial = (field: keyof MaterialDefinition, value: any) => {
        setNewMaterial(prev => {
            const next = { ...prev, [field]: value };
            if (next.category === 'Labor' && (field === 'hourlyRate' || field === 'productivity')) {
                const r = field === 'hourlyRate' ? value : next.hourlyRate;
                const p = field === 'productivity' ? value : next.productivity;
                if (r && p) {
                    next.matCost = parseFloat((r / p).toFixed(2));
                } else {
                    next.matCost = 0;
                }
            }
            return next;
        });
    };

    const handleUpdateMaterial = (code: string, field: keyof MaterialDefinition, value: any) => {
        const updated = materials.map(m => {
            if (m.code === code) {
                const newItem = { ...m, [field]: value };
                if (m.category === 'Labor') {
                    if (field === 'hourlyRate' || field === 'productivity') {
                        const r = field === 'hourlyRate' ? value : newItem.hourlyRate;
                        const p = field === 'productivity' ? value : newItem.productivity;
                        if (r && p) {
                            newItem.matCost = parseFloat((r / p).toFixed(2));
                        } else {
                            newItem.matCost = 0;
                        }
                    }
                }
                return newItem;
            }
            return m;
        });
        onUpdateMaterials(updated);
    };

    const handleDeleteMaterial = (code: string) => {
        if (confirm('Delete this material?')) {
            onUpdateMaterials(materials.filter(m => m.code !== code));
        }
    };

    const handleExportDatabase = () => {
        try {
            const ws = utils.json_to_sheet(materials);
            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, "Materials");
            writeFile(wb, "DrywallSpec_Database.xlsx");
        } catch (e) {
            console.error("Export failed", e);
            alert("Failed to export database.");
        }
    };

    const handleImportDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await file.arrayBuffer();
            const workbook = read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = utils.sheet_to_json(worksheet) as MaterialDefinition[];

            if (jsonData.length > 0) {
                onUpdateMaterials(jsonData);
                alert(`Successfully imported ${jsonData.length} items.`);
            }
        } catch (err) {
            console.error("Import failed", err);
            alert("Failed to import database. Ensure the file format is correct.");
        }
        e.target.value = '';
    };

    const filteredDbMaterials = materials.filter(m => {
        const matchSearch = m.description.toLowerCase().includes(dbSearch.toLowerCase()) || m.code.toLowerCase().includes(dbSearch.toLowerCase());
        const matchCat = dbCategory === 'All' || m.category === dbCategory;
        return matchSearch && matchCat;
    });

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Database className="w-6 h-6 text-blue-600" /> Material Database
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Master catalog with {materials.length} items.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        icon={Download}
                        onClick={handleExportDatabase}
                    >
                        Export
                    </Button>
                    <label className="cursor-pointer">
                        <Button
                            variant="secondary"
                            icon={Upload}
                        >
                            Import
                        </Button>
                        <input type="file" accept=".xlsx, .csv" className="hidden" onChange={handleImportDatabase} />
                    </label>
                    <Button
                        variant="secondary"
                        icon={Database}
                        onClick={() => {
                            if (confirm('Auto-calculate Productivity from Cost (assuming $65/hr)? This will overwrite existing productivity values for Labor items.')) {
                                const updated = materials.map(m => {
                                    if (m.category === 'Labor' && m.matCost > 0 && !m.productivity) {
                                        return { ...m, productivity: parseFloat((65 / m.matCost).toFixed(2)) };
                                    }
                                    return m;
                                });
                                onUpdateMaterials(updated);
                            }
                        }}
                    >
                        Calc Prod
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
                {/* Sidebar Filters */}
                <div className="w-64 border-r border-slate-200 bg-slate-50 p-4 space-y-1">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Categories</div>
                    {['All', 'Framing', 'Drywall', 'Insulation', 'Finishing', 'Ceiling', 'Labor', 'Other'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => {
                                setDbCategory(cat);
                                setNewMaterial(prev => ({
                                    ...prev,
                                    category: cat === 'All' ? 'Framing' : cat as any,
                                    per: (cat === 'Drywall' || cat === 'Insulation') ? '1,000 SF' : cat === 'Framing' ? '1 LF' : '1 EA'
                                }));
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${dbCategory === cat ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Main Table Area */}
                <div className="flex-1 flex flex-col bg-white">
                    {/* Search Bar */}
                    <div className="p-4 border-b border-slate-200 flex gap-4 items-center">
                        <div className="flex-1">
                            <SearchInput
                                value={dbSearch}
                                onValueChange={setDbSearch}
                                placeholder="Search by code, description, or manufacturer..."
                            />
                        </div>
                        <Button
                            variant="primary"
                            icon={Plus}
                            onClick={() => setIsAddingMat(true)}
                        >
                            Add New Item
                        </Button>
                    </div>

                    {/* Data Table */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[1000px]">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">Code</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">Section</th>
                                    {dbCategory === 'Framing' && <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-20">Width</th>}
                                    {dbCategory === 'Framing' && <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-20">Gauge</th>}
                                    {dbCategory === 'Framing' && <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-20">Flange</th>}
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28">Cost Code</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-32">Vendor</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Description</th>
                                    {dbCategory === 'Labor' ? (
                                        <>
                                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">Prod (U/Hr)</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">Rate ($/Hr)</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28 text-right">Cost ($/U)</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-16">Unit</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-28 text-right">Cost</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-24">Per</th>
                                        </>
                                    )}
                                    <th className="w-16"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isAddingMat && (
                                    <tr className="bg-blue-50 animate-in fade-in duration-300">
                                        <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="Code" disabled value="Auto" /></td>
                                        <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="09 22 16" value={newMaterial.section} onChange={(e) => setNewMaterial({ ...newMaterial, section: e.target.value })} /></td>
                                        {dbCategory === 'Framing' && (
                                            <>
                                                <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder='3-5/8"' value={newMaterial.width || ''} onChange={(e) => setNewMaterial({ ...newMaterial, width: e.target.value })} /></td>
                                                <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="20ga" value={newMaterial.gauge || ''} onChange={(e) => setNewMaterial({ ...newMaterial, gauge: e.target.value })} /></td>
                                                <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder='1-5/8"' value={newMaterial.flange || ''} onChange={(e) => setNewMaterial({ ...newMaterial, flange: e.target.value })} /></td>
                                            </>
                                        )}
                                        <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="COST CODE" value={newMaterial.matCostCode} onChange={(e) => setNewMaterial({ ...newMaterial, matCostCode: e.target.value })} /></td>
                                        <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="Vendor" value={newMaterial.manufacturer || ''} onChange={(e) => setNewMaterial({ ...newMaterial, manufacturer: e.target.value })} /></td>
                                        <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="Description" value={newMaterial.description || ''} onChange={(e) => setNewMaterial({ ...newMaterial, description: e.target.value })} /></td>
                                        {dbCategory === 'Labor' ? (
                                            <>
                                                <td className="px-4 py-2"><input type="number" className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="100" value={newMaterial.productivity || ''} onChange={(e) => handleUpdateNewMaterial('productivity', parseFloat(e.target.value))} /></td>
                                                <td className="px-4 py-2"><input type="number" className="w-full text-sm border border-blue-300 rounded px-2 py-1" placeholder="$65" value={newMaterial.hourlyRate || ''} onChange={(e) => handleUpdateNewMaterial('hourlyRate', parseFloat(e.target.value))} /></td>
                                                <td className="px-4 py-2"><input type="number" className="w-full text-sm border border-blue-300 rounded px-2 py-1 text-right" value={newMaterial.matCost} readOnly title="Calculated" /></td>
                                                <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" value={newMaterial.per} onChange={(e) => handleUpdateNewMaterial('per', e.target.value)} /></td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-2"><input type="number" className="w-full text-sm border border-blue-300 rounded px-2 py-1 text-right" value={newMaterial.matCost} onChange={(e) => handleUpdateNewMaterial('matCost', parseFloat(e.target.value))} /></td>
                                                <td className="px-4 py-2"><input className="w-full text-sm border border-blue-300 rounded px-2 py-1" value={newMaterial.per} onChange={(e) => handleUpdateNewMaterial('per', e.target.value)} /></td>
                                            </>
                                        )}
                                        <td className="px-4 py-2 text-right flex gap-1 justify-end">
                                            <IconButton
                                                icon={Save}
                                                variant="success"
                                                onClick={handleAddMaterial}
                                                tooltip="Save material"
                                            />
                                            <IconButton
                                                icon={X}
                                                variant="default"
                                                onClick={() => setIsAddingMat(false)}
                                                tooltip="Cancel"
                                            />
                                        </td>
                                    </tr>
                                )}
                                {filteredDbMaterials.map(m => (
                                    <tr key={m.code} className="hover:bg-slate-50 group transition-colors">
                                        <td className="px-4 py-3 text-sm font-mono text-slate-500">{m.code}</td>
                                        <td className="px-4 py-3">
                                            <input className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.section} onChange={(e) => handleUpdateMaterial(m.code, 'section', e.target.value)} />
                                        </td>
                                        {dbCategory === 'Framing' && (
                                            <>
                                                <td className="px-4 py-3"><input className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.width || ''} placeholder="-" onChange={(e) => handleUpdateMaterial(m.code, 'width', e.target.value)} /></td>
                                                <td className="px-4 py-3"><input className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.gauge || ''} placeholder="-" onChange={(e) => handleUpdateMaterial(m.code, 'gauge', e.target.value)} /></td>
                                                <td className="px-4 py-3"><input className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.flange || ''} placeholder="-" onChange={(e) => handleUpdateMaterial(m.code, 'flange', e.target.value)} /></td>
                                            </>
                                        )}
                                        <td className="px-4 py-3">
                                            <input className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.matCostCode} onChange={(e) => handleUpdateMaterial(m.code, 'matCostCode', e.target.value)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.manufacturer} onChange={(e) => handleUpdateMaterial(m.code, 'manufacturer', e.target.value)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input className="w-full bg-transparent border-none text-sm text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.description} onChange={(e) => handleUpdateMaterial(m.code, 'description', e.target.value)} />
                                        </td>
                                        {dbCategory === 'Labor' ? (
                                            <>
                                                <td className="px-4 py-3">
                                                    <input type="number" className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.productivity || ''} placeholder="-" onChange={(e) => handleUpdateMaterial(m.code, 'productivity', parseFloat(e.target.value))} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input type="number" className="w-full bg-transparent border-none text-sm text-slate-600 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.hourlyRate || ''} placeholder="$ -" onChange={(e) => handleUpdateMaterial(m.code, 'hourlyRate', parseFloat(e.target.value))} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input type="number" className="w-full bg-transparent border-none text-sm text-slate-800 text-right focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.matCost} readOnly title="Calculated from Rate/Prod" />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input className="w-full bg-transparent border-none text-sm text-slate-500 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.per} onChange={(e) => handleUpdateMaterial(m.code, 'per', e.target.value)} />
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-3">
                                                    <input type="number" className="w-full bg-transparent border-none text-sm text-slate-800 text-right focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.matCost} onChange={(e) => handleUpdateMaterial(m.code, 'matCost', parseFloat(e.target.value))} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input className="w-full bg-transparent border-none text-sm text-slate-500 focus:bg-white focus:ring-1 focus:ring-blue-200 rounded px-1 -ml-1" value={m.per} onChange={(e) => handleUpdateMaterial(m.code, 'per', e.target.value)} />
                                                </td>
                                            </>
                                        )}
                                        <td className="px-4 py-3 text-right">
                                            <IconButton
                                                icon={Trash2}
                                                variant="danger"
                                                size="sm"
                                                onClick={() => handleDeleteMaterial(m.code)}
                                                className="opacity-0 group-hover:opacity-100 transition-all"
                                                tooltip="Delete material"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
