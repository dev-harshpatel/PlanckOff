'use client';

import React, { useState } from 'react';
import { WallAssembly, MaterialDefinition, AssemblyComponent, TakeoffInstance } from '@/types';
import { Search, Plus, Copy, Trash2, Edit2, LayoutTemplate, Save, X } from 'lucide-react';
import { AssemblyTemplate } from '@/constants/defaultAssemblies';
import { AssemblyEditorModal } from '@/components/features/project/AssemblyEditorModal';
import { getRowDetails } from '@/lib/utils/calculationUtils';
import { v4 as uuidv4 } from 'uuid';
import { Button, IconButton, SearchInput, ConfirmModal, useToast } from '@/components/ui';

interface DefaultAssembliesManagerProps {
    templates: AssemblyTemplate[];
    onUpdateTemplates: (templates: AssemblyTemplate[]) => void;
    materials: MaterialDefinition[];
}

export const DefaultAssembliesManager: React.FC<DefaultAssembliesManagerProps> = ({ templates, onUpdateTemplates, materials }) => {
    const toast = useToast();
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingTemplateIndex, setEditingTemplateIndex] = useState<number | null>(null);

    const [mockAssembly, setMockAssembly] = useState<WallAssembly | null>(null);
    const [mockInstances, setMockInstances] = useState<TakeoffInstance[]>([]);

    // Delete confirmation state
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState<{ index: number; name: string } | null>(null);

    const filteredTemplates = templates.filter(t => {
        const matchSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchCat = selectedCategory === 'All' || t.category === selectedCategory;
        return matchSearch && matchCat;
    });

    const handleEdit = (index: number) => {
        const template = templates[index];
        setEditingTemplateIndex(index);

        const assemblyId = uuidv4();
        const newAssembly: WallAssembly = {
            id: assemblyId,
            code: template.name.substring(0, 10).toUpperCase(),
            description: template.name,
            assemblyType: template.category,
            framingType: 'Light Metal',
            components: template.components.map(c => ({
                id: uuidv4(),
                ...c,
                usage: c.usage || 'Fixed Qty'
            })),
            defaultLength: 100,
            defaultHeight: 10,
            defaultArea: 1000,
            defaultPerimeter: 130
        };
        setMockAssembly(newAssembly);

        setMockInstances([{
            id: 'mock-inst-1',
            level: '1',
            description: 'Standard Example',
            quantity: 1,
            length: 100,
            ceilingArea: 1000,
            perimeter: 130
        }]);
    };

    const handleCloseEditor = () => {
        setEditingTemplateIndex(null);
        setMockAssembly(null);
    };

    const openDeleteModal = (index: number) => {
        setTemplateToDelete({ index, name: templates[index].name });
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (templateToDelete === null) return;
        const newTemplates = [...templates];
        newTemplates.splice(templateToDelete.index, 1);
        onUpdateTemplates(newTemplates);
        toast.success('Template Deleted', `"${templateToDelete.name}" has been removed.`);
        setIsDeleteModalOpen(false);
        setTemplateToDelete(null);
    };

    const handleDelete = (index: number) => {
        openDeleteModal(index);
    };

    const handleDuplicate = (index: number) => {
        const original = templates[index];
        const newTemplate: AssemblyTemplate = {
            ...original,
            name: `${original.name} (Copy)`,
        };
        const newTemplates = [...templates];
        newTemplates.splice(index + 1, 0, newTemplate);
        onUpdateTemplates(newTemplates);
    };

    const handleAddNew = () => {
        const newTemplate: AssemblyTemplate = {
            name: 'New Assembly Template',
            category: selectedCategory === 'All' ? 'Wall' : selectedCategory as any,
            description: 'Description of new assembly',
            components: []
        };
        onUpdateTemplates([newTemplate, ...templates]);
    };

    const updateAssemblyInfo = (id: string, field: keyof WallAssembly, value: any) => {
        if (!mockAssembly) return;
        setMockAssembly({ ...mockAssembly, [field]: value });
    };

    const saveChanges = () => {
        if (editingTemplateIndex !== null && mockAssembly) {
            const updatedTemplate: AssemblyTemplate = {
                name: mockAssembly.description,
                category: mockAssembly.assemblyType as any,
                description: mockAssembly.description,
                components: mockAssembly.components.map(c => {
                    const { id, ...rest } = c;
                    return rest;
                })
            };

            const newTemplates = [...templates];
            newTemplates[editingTemplateIndex] = updatedTemplate;
            onUpdateTemplates(newTemplates);
        }
    };

    const handleUpdateComponent = (assemblyId: string, componentId: string, field: keyof AssemblyComponent, value: any) => {
        if (!mockAssembly) return;
        setMockAssembly(prev => {
            if (!prev) return null;
            return {
                ...prev,
                components: prev.components.map(c => c.id === componentId ? { ...c, [field]: value } : c)
            };
        });
    };

    const handleAddComponent = (assemblyId: string) => {
        if (!mockAssembly) return;
        const newComp: AssemblyComponent = {
            id: uuidv4(),
            materialName: 'New Item',
            usage: 'Fixed Qty',
            wasteFactor: 0.05,
            materialCost: 0,
            overrideLaborCost: 0
        };
        setMockAssembly(prev => prev ? ({ ...prev, components: [...prev.components, newComp] }) : null);
    };

    const handleDeleteComponent = (assemblyId: string, componentId: string) => {
        if (!mockAssembly) return;
        setMockAssembly(prev => prev ? ({ ...prev, components: prev.components.filter(c => c.id !== componentId) }) : null);
    };

    const handleMaterialSelect = (assemblyId: string, componentId: string, material: MaterialDefinition) => {
        if (!mockAssembly) return;
        let usage = 'Fixed Qty';
        const cat = material.category;
        if (cat === 'Framing') usage = 'Vertical @ 16" OC';
        else if (cat === 'Drywall') usage = 'Coverage (1 Layer)';
        else if (cat === 'Insulation') usage = 'Insulation (Cavity)';
        else if (cat === 'Ceiling') usage = 'Coverage (1 Layer)';

        setMockAssembly(prev => {
            if (!prev) return null;
            return {
                ...prev,
                components: prev.components.map(c => c.id === componentId ? {
                    ...c,
                    materialName: material.description,
                    usage: usage,
                    materialCost: material.matCost,
                    overrideMatCost: undefined
                } : c)
            };
        });
    };

    const handleLoadMockTemplate = (template: AssemblyTemplate) => {
        if (!mockAssembly) return;
        setMockAssembly(prev => {
            if (!prev) return null;
            return {
                ...prev,
                assemblyType: template.category,
                components: template.components.map(c => ({
                    id: uuidv4(),
                    ...c,
                    usage: c.usage || 'Fixed Qty'
                }))
            };
        });
    };

    return (
        <div className="flex flex-col h-full bg-white font-sans">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <LayoutTemplate className="w-6 h-6 text-emerald-600" /> Default Assemblies
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Manage standard templates for project creation.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="primary"
                        icon={Plus}
                        onClick={handleAddNew}
                    >
                        New Template
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
                {/* Sidebar Filters */}
                <div className="w-64 border-r border-slate-200 bg-slate-50 p-4 space-y-1">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Categories</div>
                    {['All', 'Wall', 'Ceiling', 'Soffit'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${selectedCategory === cat ? 'bg-emerald-100 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Main List Area */}
                <div className="flex-1 flex flex-col bg-white">
                    {/* Search Bar */}
                    <div className="p-4 border-b border-slate-200">
                        <SearchInput
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                            placeholder="Search templates..."
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 content-start">
                        {filteredTemplates.map((template, idx) => {
                            const originalIndex = templates.indexOf(template);
                            return (
                                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-emerald-300 hover:shadow-md transition-all group relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${template.category === 'Wall' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                template.category === 'Ceiling' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                    'bg-orange-50 text-orange-700 border-orange-200'
                                                }`}>
                                                {template.category}
                                            </span>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <IconButton
                                                icon={Copy}
                                                variant="default"
                                                onClick={(e) => { e.stopPropagation(); handleDuplicate(originalIndex); }}
                                                tooltip="Duplicate"
                                            />
                                            <IconButton
                                                icon={Trash2}
                                                variant="danger"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(originalIndex); }}
                                                tooltip="Delete"
                                            />
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-900 text-lg mb-1">{template.name}</h3>
                                    <p className="text-sm text-slate-500 line-clamp-2 mb-4 h-10">{template.description}</p>

                                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                        <div className="text-xs text-slate-500">
                                            <strong className="text-slate-900">{template.components.length}</strong> Components
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={Edit2}
                                            onClick={() => handleEdit(originalIndex)}
                                        >
                                            Edit Template
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {mockAssembly && (
                <AssemblyEditorModal
                    isOpen={true}
                    onClose={() => {
                        saveChanges();
                        handleCloseEditor();
                    }}
                    assembly={mockAssembly}
                    updateAssemblyInfo={updateAssemblyInfo}
                    totalAggLength={100}
                    materials={materials}
                    handleMaterialSelect={handleMaterialSelect}
                    handleUpdateComponent={handleUpdateComponent}
                    handleAddComponent={handleAddComponent}
                    handleDeleteComponent={handleDeleteComponent}
                    getRowDetails={getRowDetails}
                    takeoffInstances={mockInstances}
                    statsByHeight={{ "10": { len: 100, area: 1000 } }}
                    selectedHeight={null}
                    onSelectHeight={() => {}}
                    templates={templates}
                    onLoadTemplate={handleLoadMockTemplate}
                />
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setTemplateToDelete(null); }}
                onConfirm={confirmDelete}
                title="Delete Template"
                message={`Are you sure you want to delete "${templateToDelete?.name}"? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />
        </div>
    );
};
