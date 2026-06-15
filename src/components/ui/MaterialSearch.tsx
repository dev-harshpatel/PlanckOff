'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MaterialDefinition } from '@/types';
import { Search, X } from 'lucide-react';
import { SearchInput } from './SearchInput';

interface MaterialSearchProps {
    materials: MaterialDefinition[];
    onSelect: (material: MaterialDefinition) => void;
    isOpen: boolean;
    onClose: () => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    category?: string;
    className?: string;
}

export const MaterialSearch: React.FC<MaterialSearchProps> = ({
    materials,
    onSelect,
    isOpen,
    onClose,
    searchQuery,
    onSearchChange,
    category,
    className = ''
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const filteredMaterials = useMemo(() => {
        if (!searchQuery.trim()) return materials;

        const query = searchQuery.toLowerCase().trim();
        return materials.filter((m) => {
            const matchesCategory = !category || m.category === category;
            const matchesSearch =
                m.description.toLowerCase().includes(query) ||
                (m.code?.toLowerCase().includes(query) ?? false) ||
                m.category.toLowerCase().includes(query);
            return matchesCategory && matchesSearch;
        });
    }, [materials, searchQuery, category]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div 
            ref={containerRef}
            className={`absolute z-50 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden ${className}`}
        >
            <div className="p-2 border-b border-slate-100">
                <SearchInput
                    value={searchQuery}
                    onValueChange={onSearchChange}
                    placeholder="Search materials..."
                    className="w-full"
                />
            </div>
            <div className="max-h-[300px] overflow-y-auto">
                {filteredMaterials.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500">
                        No materials found
                    </div>
                ) : (
                    filteredMaterials.map((material, index) => (
                        <button
                            key={`${material.code ?? material.description}-${index}`}
                            type="button"
                            onClick={() => {
                                onSelect(material);
                                onClose();
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-slate-800 truncate">
                                        {material.description}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {material.category}
                                        {material.code ? ` • ${material.code}` : ""}
                                    </div>
                                    {(material.per || material.productivity != null) && (
                                        <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                                            {material.per && <span>Per: {material.per}</span>}
                                            {material.productivity != null && (
                                                <span className="text-emerald-600">
                                                    Prod rate: {material.productivity}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="shrink-0 text-right">
                                    {material.matCost != null && material.matCost > 0 && (
                                        <div className="text-sm font-mono text-slate-600">
                                            ${material.matCost.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};
