'use client';

import React from 'react';
import { AssemblyComponent } from '@/types';
import { ComponentField } from './ComponentField';

interface SpecsTabProps {
    localComp: AssemblyComponent;
    onLocalChange: (
        field: keyof AssemblyComponent,
        value: AssemblyComponent[keyof AssemblyComponent],
    ) => void;
    isLabor?: boolean;
}

export const SpecsTab = ({ localComp, onLocalChange, isLabor = false }: SpecsTabProps) => (
    <div className="space-y-5">
        {/* Calculation Parameters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-purple-500 rounded-full" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Calculation Parameters
                </h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
                <ComponentField
                    label='Usage / Calculation Method'
                    value={localComp.usage}
                    onChange={(val) => onLocalChange('usage', val as string)}
                    placeholder='Vertical @ 16" OC'
                />
                <ComponentField
                    label="OC Spacing"
                    value={localComp.ocSpacing}
                    onChange={(val) => onLocalChange('ocSpacing', val as string)}
                    placeholder='16"'
                />
                <ComponentField
                    label={isLabor ? 'Height (ft) — auto from material' : 'Override Height (ft)'}
                    value={localComp.overrideHeight}
                    onChange={(val) => onLocalChange('overrideHeight', val as number)}
                    type="number"
                    placeholder="10"
                    disabled={isLabor}
                />
                <ComponentField
                    label="Override Layers"
                    value={localComp.overrideLayers}
                    onChange={(val) => onLocalChange('overrideLayers', val as number)}
                    type="number"
                    placeholder="1"
                />
                <ComponentField
                    label="Waste Factor (%)"
                    value={
                        localComp.wasteFactor != null
                            ? localComp.wasteFactor * 100
                            : undefined
                    }
                    onChange={(val) =>
                        onLocalChange(
                            'wasteFactor',
                            val != null ? (val as number) / 100 : undefined,
                        )
                    }
                    type="number"
                    placeholder="5"
                />
                <ComponentField
                    label="Crew Size"
                    value={localComp.crew}
                    onChange={(val) => onLocalChange('crew', val as number)}
                    type="number"
                    placeholder="1"
                />
            </div>
        </div>

        {/* Additional Properties */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-blue-500 rounded-full" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Additional Properties
                </h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
                <ComponentField
                    label="R-Value"
                    value={localComp.rValue}
                    onChange={(val) => onLocalChange('rValue', val as number)}
                    type="number"
                    placeholder="0"
                />
                <ComponentField
                    label="Custom Formula"
                    value={localComp.customFormula}
                    onChange={(val) => onLocalChange('customFormula', val as string)}
                    placeholder="Custom formula expression"
                />
                <ComponentField
                    label="Labor Cost Override"
                    value={localComp.overrideLaborCost}
                    onChange={(val) => onLocalChange('overrideLaborCost', val as number)}
                    type="number"
                    placeholder="0.00"
                />
            </div>
        </div>
    </div>
);
