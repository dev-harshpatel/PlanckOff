
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { WallAssembly, TakeoffInstance, CalculatedMaterial, MaterialDefinition, AssemblyComponent, CalculationMethod } from '../types';
import { calculateMaterials, evaluateMath } from '../services/geminiService';
import { Download, Plus, Calculator, FileSpreadsheet, Search, Database, Upload, Layers, Ruler, Filter, X, ChevronLeft, ChevronRight, ArrowLeftRight, Trash2, Edit2, MoreVertical, Beaker, HelpCircle, Check, RefreshCw, FlaskConical, LayoutTemplate } from 'lucide-react';
import { read, utils, writeFile } from 'xlsx';
import { DatabaseManager } from './DatabaseManager';
import { Reports } from './Reports';
import { ConditionDetailModal } from './ConditionDetailModal';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_TEMPLATES, AssemblyTemplate } from './defaultAssemblies';
import { AssemblyEditorModal } from './AssemblyEditorModal';
import { TakeoffScheduleView } from './TakeoffScheduleView';
import { AssemblySummaryGrid } from './AssemblySummaryGrid';
import { FORMULA_DEFINITIONS } from '../constants/formulas';
import { detectLengthFt, getFilteredFormulas, getRowDetails, parsePer } from '../utils/calculationUtils';

interface EstimateResultProps {
    assemblies: WallAssembly[];
    onReset: () => void;
    materials: MaterialDefinition[];
    onUpdateMaterials: (materials: MaterialDefinition[]) => void;
    onAnalyze: (file: File) => void;
    isAnalyzing: boolean;
    viewMode?: 'project' | 'report';
    displayUnit: 'imperial' | 'metric';
    activeReportTab?: 'proposal' | 'bidding' | 'markups' | 'materials' | 'labor';
    setActiveReportTab?: (tab: 'proposal' | 'bidding' | 'markups' | 'materials' | 'labor') => void;
    onCloseReport?: () => void;
    templates?: AssemblyTemplate[];
}


// Local definitions moved to calculationUtils.ts

export const EstimateResult: React.FC<EstimateResultProps> = ({
    assemblies: initialAssemblies,
    onReset,
    materials,
    onUpdateMaterials,
    onAnalyze,
    isAnalyzing,
    viewMode = 'project',
    displayUnit,
    activeReportTab,
    setActiveReportTab,
    onCloseReport,
    templates = DEFAULT_TEMPLATES
}) => {
    const [assemblies, setAssemblies] = useState<WallAssembly[]>(initialAssemblies);
    const [takeoffs, setTakeoffs] = useState<Record<string, TakeoffInstance[]>>({});
    // viewMode state removed to use prop directly
    const [editingAssemblyId, setEditingAssemblyId] = useState<string | null>(null);
    const [activeAssemblyId, setActiveAssemblyId] = useState<string | null>(null); // For sidebar selection
    const [isDatabaseOpen, setIsDatabaseOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'schedule' | 'materials'>('schedule');
    const [assemblySearch, setAssemblySearch] = useState('');

    const [manualItems, setManualItems] = useState<CalculatedMaterial[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const [filterLevel, setFilterLevel] = useState<string>('All');

    const [filterTag, setFilterTag] = useState<string>('All');

    // Alternative Pricing State
    const [pricingScopes, setPricingScopes] = useState<string[]>(['Base Bid', 'Alternate 1', 'Alternate 2']);
    const [isManageScopesOpen, setIsManageScopesOpen] = useState(false);
    const [newScopeName, setNewScopeName] = useState('');

    const [rowSearchOpen, setRowSearchOpen] = useState<string | null>(null);
    const [rowSearchQuery, setRowSearchQuery] = useState('');
    const [formulaDropdownOpen, setFormulaDropdownOpen] = useState<string | null>(null);
    const [prodCalcOpen, setProdCalcOpen] = useState<string | null>(null); // Component ID for calc popup
    const [prodValues, setProdValues] = useState({ dailyOutput: 100, crewSize: 1, hoursPerDay: 8 });
    const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);

    const handleAddFromTemplate = (template: AssemblyTemplate) => {
        const newAssembly: WallAssembly = {
            id: uuidv4(),
            code: `${template.category.substring(0, 1)}A-${assemblies.length + 1}`,
            description: template.name,
            assemblyType: template.category,
            framingType: 'Light Metal',
            components: template.components.map(c => ({
                id: uuidv4(),
                ...c,
                usage: c.usage || 'Fixed Qty' // Fallback
            })),
            defaultLength: 100,
            defaultHeight: 10
        };
        setAssemblies(prev => [...prev, newAssembly]);
        setEditingAssemblyId(newAssembly.id);
        setIsTemplateMenuOpen(false);
    };

    const handleLoadTemplate = (template: AssemblyTemplate) => {
        if (!editingAssemblyId) return;
        setAssemblies(prev => prev.map(a => {
            if (a.id !== editingAssemblyId) return a;
            return {
                ...a,
                description: a.description || template.name,
                assemblyType: template.category,
                components: template.components.map(c => ({
                    id: uuidv4(),
                    ...c,
                    usage: c.usage || 'Fixed Qty'
                }))
            };
        }));
    };

    const handleAddScope = () => {
        if (newScopeName && !pricingScopes.includes(newScopeName)) {
            setPricingScopes([...pricingScopes, newScopeName]);
            setNewScopeName('');
        }
    };

    const handleDeleteScope = (scope: string) => {
        if (scope === 'Base Bid') return; // Protect Base Bid
        if (confirm(`Remove scope "${scope}"? Assemblies in this scope will default to Base Bid.`)) {
            setPricingScopes(prev => prev.filter(s => s !== scope));
            // Reset assemblies in deleted scope
            setAssemblies(prev => prev.map(a => a.scope === scope ? { ...a, scope: 'Base Bid' } : a));
        }
    };

    const [sidebarWidth, setSidebarWidth] = useState(40);
    const [lastSidebarWidth, setLastSidebarWidth] = useState(40);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isConditionDetailOpen, setIsConditionDetailOpen] = useState(false);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }
            const target = event.target as HTMLElement;
            if (!target.closest('.row-search-container')) {
                setRowSearchOpen(null);
            }
            if (!target.closest('.formula-dropdown-container')) {
                setFormulaDropdownOpen(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (initialAssemblies.length > assemblies.length) {
            const newOnes = initialAssemblies.slice(assemblies.length);
            setAssemblies(prev => [...prev, ...newOnes]);
            const newTakeoffs: Record<string, TakeoffInstance[]> = { ...takeoffs };
            newOnes.forEach(a => {
                if (!newTakeoffs[a.id]) {
                    newTakeoffs[a.id] = [];
                }
            });
            setTakeoffs(newTakeoffs);
        }
    }, [initialAssemblies]);

    useEffect(() => {
        const initial: Record<string, TakeoffInstance[]> = {};
        assemblies.forEach(a => {
            if (!takeoffs[a.id]) {
                initial[a.id] = [];
            }
        });
        if (Object.keys(initial).length > 0) {
            setTakeoffs(prev => ({ ...prev, ...initial }));
        }
    }, [assemblies]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing && containerRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const newWidth = ((mouseMoveEvent.clientX - containerRect.left) / containerRect.width) * 100;
                if (newWidth >= 15 && newWidth <= 85) {
                    setSidebarWidth(newWidth);
                    setLastSidebarWidth(newWidth);
                }
            }
        },
        [isResizing]
    );

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    const toggleSidebar = () => {
        if (sidebarWidth < 5) {
            setSidebarWidth(lastSidebarWidth > 15 ? lastSidebarWidth : 40);
        } else {
            setLastSidebarWidth(sidebarWidth);
            setSidebarWidth(0);
        }
    };



    const updateInstance = (assemblyId: string, instanceId: string, field: string, value: any) => {
        if (field === 'assemblyType') {
            // Update Assembly Definition
            setAssemblies(prev => prev.map(a => a.id === assemblyId ? { ...a, assemblyType: value } : a));
            return;
        }

        // Update Instance
        setTakeoffs(prev => ({
            ...prev,
            [assemblyId]: prev[assemblyId].map(inst =>
                inst.id === instanceId ? { ...inst, [field]: value } : inst
            )
        }));
    };

    const deleteInstance = (assemblyId: string, instanceId: string) => {
        setTakeoffs(prev => ({
            ...prev,
            [assemblyId]: prev[assemblyId].filter(i => i.id !== instanceId)
        }));
    };

    const addInstance = (assemblyId: string | null) => {
        let targetId = assemblyId;

        // If no assembly selected, create a new "Manual" assembly on the fly
        if (!targetId) {
            targetId = `manual-${Date.now()}`;
            const newAssembly: WallAssembly = {
                id: targetId,
                code: `M-${assemblies.length + 1}`,
                description: 'Manual Internal Wall',
                framingType: 'Light Metal',
                assemblyType: 'Interior Wall',
                defaultLength: 10,
                defaultHeight: 10,
                components: [
                    // Default components for a standard wall so cost isn't zero
                    { id: `c1-${targetId}`, materialName: '3 5/8" Metal Stud 25ga', usage: 'Vertical @ 16" OC', wasteFactor: 0.08, installRate: 0.15 },
                    { id: `c2-${targetId}`, materialName: '5/8" Type X Gypsum Board', usage: 'Coverage (1 Layer)', wasteFactor: 0.10, installRate: 0.009 }
                ]
            };
            setAssemblies(prev => [...prev, newAssembly]);
            // Initialize takeoff array for this new assembly
            setTakeoffs(prev => ({ ...prev, [targetId]: [] }));
        }

        const newId = `inst-${Date.now()}`;
        setTakeoffs(prev => ({
            ...prev,
            [targetId!]: [...(prev[targetId!] || []), {
                id: newId,
                level: '1',
                description: assemblyId ? 'New Item' : 'New Manual Item',
                quantity: 1,
                length: 10,
                height: 10,
                ceilingArea: 0,
                perimeter: 0
            }]
        }));
    };

    const moveInstance = (instanceId: string, fromAssemblyId: string, toAssemblyId: string) => {
        if (fromAssemblyId === toAssemblyId) return;
        const instance = takeoffs[fromAssemblyId].find(i => i.id === instanceId);
        if (!instance) return;
        setTakeoffs(prev => ({
            ...prev,
            [fromAssemblyId]: prev[fromAssemblyId].filter(i => i.id !== instanceId),
            [toAssemblyId]: [...(prev[toAssemblyId] || []), instance]
        }));
    };

    const updateAssemblyInfo = (id: string, field: keyof WallAssembly, value: any) => {
        setAssemblies(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
    };

    const applyTemplate = (assemblyId: string, type: 'Wall' | 'Ceiling', subtype: string) => {
        const newComponents: AssemblyComponent[] = [];

        if (type === 'Ceiling') {
            if (subtype === 'Suspended') {
                newComponents.push(
                    { id: `t-${Date.now()}-1`, materialName: '12ga Hanger Wire', usage: 'Suspension - Hanger Wire (16sf)', wasteFactor: 0.05, installRate: 0.01 },
                    { id: `t-${Date.now()}-2`, materialName: 'Main Runner 12\' HD', usage: 'Suspension - Main Runner (4\' OC)', wasteFactor: 0.05, installRate: 0.004 }, // ~5000sf/wk
                    { id: `t-${Date.now()}-3`, materialName: 'Cross Tee 4\'', usage: 'Suspension - Cross Tee (4\' OC)', wasteFactor: 0.05, installRate: 0.004 },
                    { id: `t-${Date.now()}-4`, materialName: 'Wall Angle 12\'', usage: 'Ceiling - Perimeter (Linear)', wasteFactor: 0.05, installRate: 0.01 },
                    { id: `t-${Date.now()}-5`, materialName: 'Acoustic Tile 2x4', usage: 'Ceiling - Tile (2x4)', wasteFactor: 0.05, installRate: 0.004 } // ~10000sf/wk
                );
            } else if (subtype === 'Hard Lid') {
                newComponents.push(
                    { id: `t-${Date.now()}-1`, materialName: '12ga Hanger Wire', usage: 'Suspension - Hanger Wire (16sf)', wasteFactor: 0.05, installRate: 0.01 },
                    { id: `t-${Date.now()}-2`, materialName: '1-1/2" Cold Rolled Channel', usage: 'Ceiling - CRC (Primary 4\' OC)', wasteFactor: 0.05, installRate: 0.01 },
                    { id: `t-${Date.now()}-3`, materialName: '7/8" Furring Channel', usage: 'Ceiling - Hat Channel (Secondary 24" OC)', wasteFactor: 0.05, installRate: 0.015 },
                    { id: `t-${Date.now()}-4`, materialName: '5/8" Type X Gypsum Board', usage: 'Coverage (1 Layer)', wasteFactor: 0.10, installRate: 0.02 },
                    { id: `t-${Date.now()}-5`, materialName: 'Tie Wire 18ga 25 lb Bundle', usage: 'Fixed Qty', wasteFactor: 0.05 }
                );
            } else if (subtype === 'Baffles') {
                newComponents.push(
                    { id: `t-${Date.now()}-1`, materialName: 'Linear Baffle (4\' Unit)', usage: 'Ceiling - Baffle (Linear Calc)', wasteFactor: 0.05 },
                    { id: `t-${Date.now()}-2`, materialName: 'Cable Suspension Kit', usage: 'Fixed Qty', wasteFactor: 0.00 }
                );
            } else if (subtype === 'Steel Joist') {
                newComponents.push(
                    { id: `t-${Date.now()}-1`, materialName: '600S162-54 (6" 18ga Stud)', usage: 'Structural - Steel Joist (Span)', wasteFactor: 0.05, installRate: 0.015 },
                    { id: `t-${Date.now()}-2`, materialName: '600T200-54 (6" Deep Leg Track)', usage: 'Structural - Deep Leg Track', wasteFactor: 0.05, installRate: 0.01 },
                    { id: `t-${Date.now()}-3`, materialName: '1-1/2" Flat Strap (Bracing)', usage: 'Structural - Lateral Bracing', wasteFactor: 0.05, installRate: 0.005 }
                );
            }
        } else {
            // Wall Default
            newComponents.push(
                { id: `t-${Date.now()}-1`, materialName: '3 5/8" Metal Stud 25ga', usage: 'Vertical @ 16" OC', wasteFactor: 0.08, installRate: 0.15 }, // ~60LF/Day (Interior)
                { id: `t-${Date.now()}-2`, materialName: '3 5/8" Track 25ga', usage: 'Tracks (Top & Bottom)', wasteFactor: 0.05, installRate: 0.01 }, // Linear Feet
                { id: `t-${Date.now()}-3`, materialName: '5/8" Type X Gypsum Board', usage: 'Coverage (1 Layer)', wasteFactor: 0.10, installRate: 0.009 } // ~960SF/Day
            );
        }

        setAssemblies(prev => prev.map(a => {
            if (a.id !== assemblyId) return a;
            return { ...a, components: newComponents };
        }));
    };

    const updateComponent = (assemblyId: string, componentId: string, field: keyof AssemblyComponent, value: any) => {
        setAssemblies(prev => prev.map(a => {
            if (a.id !== assemblyId) return a;
            return {
                ...a,
                components: a.components.map(c => c.id === componentId ? { ...c, [field]: value } : c)
            };
        }));
    };

    const handleFormulaChange = (assemblyId: string, componentId: string, val: string) => {
        // Check if user input matches a known formula label exactly
        const matchedMethod = Object.keys(FORMULA_DEFINITIONS).find(key =>
            (FORMULA_DEFINITIONS[key as CalculationMethod].label || '').toLowerCase() === val.toLowerCase()
        ) as CalculationMethod | undefined;

        setAssemblies(prev => prev.map(a => {
            if (a.id !== assemblyId) return a;
            return {
                ...a,
                components: a.components.map(c => {
                    if (c.id !== componentId) return c;
                    if (matchedMethod) {
                        return { ...c, usage: matchedMethod, customFormula: undefined };
                    } else if (val.match(/Vertical.*@/i)) {
                        return { ...c, usage: val, customFormula: undefined };
                    } else {
                        return { ...c, usage: 'Custom Formula', customFormula: val };
                    }
                })
            };
        }));
    };

    const handleMaterialSelect = (assemblyId: string, componentId: string, material: MaterialDefinition) => {
        let usage: CalculationMethod = 'Fixed Qty';
        const name = material.description.toLowerCase();
        const cat = material.category;

        if (cat === 'Framing') {
            if (name.includes('track') || name.includes('runner') || name.includes('angle')) {
                usage = 'Tracks (Top & Bottom)';
            } else {
                usage = 'Vertical @ 16" OC';
            }
        } else if (cat === 'Drywall') {
            usage = 'Coverage (1 Layer)';
        } else if (cat === 'Insulation') {
            usage = 'Insulation (Cavity)';
        } else if (cat === 'Finishing') {
            if (name.includes('screw') || name.includes('fastener')) {
                usage = 'Fastener (per SqFt)';
            } else {
                usage = 'Joint Treatment (per SqFt)';
            }
        } else if (cat === 'Ceiling') {
            if (name.includes('wire')) usage = 'Suspension - Hanger Wire (16sf)';
            else if (name.includes('main')) usage = 'Suspension - Main Runner (4\' OC)';
            else if (name.includes('tee') || name.includes('cross')) usage = 'Suspension - Cross Tee (4\' OC)';
            else if (name.includes('tile') || name.includes('panel')) usage = 'Ceiling - Tile (2x4)';
            else if (name.includes('angle') || name.includes('trim')) usage = 'Ceiling - Perimeter (Linear)';
            else usage = 'Coverage (1 Layer)';
        }

        // Check for linked Labor item
        let laborItem: MaterialDefinition | undefined;
        if (material.laborCostCode) {
            // Updated Logic: Match where Labor Item's laborCostCode equals Material's laborCostCode
            // This assumes laborCostCode is a "Grouping ID" (e.g. 'GEN', '103')
            laborItem = materials.find(m => m.category === 'Labor' && m.laborCostCode === material.laborCostCode);

            // Fallback: If no match found, try to match by Code directly (legacy behavior)
            if (!laborItem) {
                laborItem = materials.find(m => m.category === 'Labor' && m.code === material.laborCostCode);
            }
        }

        setAssemblies(prev => prev.map(a => {
            if (a.id !== assemblyId) return a;

            let updatedComponents = a.components.map(c => {
                if (c.id !== componentId) return c;

                // If Labor Item selected, put cost in Labor Column
                if (cat === 'Labor') {
                    return {
                        ...c,
                        materialName: material.description,
                        usage: usage,
                        materialCost: 0,
                        overrideLaborCost: material.matCost, // Assign to Labor
                        overrideMatCost: undefined
                    };
                }

                // Standard Material
                return {
                    ...c,
                    materialName: material.description,
                    usage: usage,
                    materialCost: material.matCost,
                    overrideLaborCost: undefined, // Clear any previous labor override
                    overrideMatCost: undefined
                };
            });

            // Auto-Add Labor if found and not already present (checking by name loosely to avoid duplicates if possible, or just append)
            // Simplified: Just append for now, user can delete if unwanted.
            if (laborItem) {
                const parentComp = a.components.find(c => c.id === componentId);
                const currentHeightCondition = parentComp?.heightCondition ? { ...parentComp.heightCondition } : undefined;

                updatedComponents.push({
                    id: `auto-labor-${Date.now()}`,
                    materialName: laborItem.description,
                    usage: usage, // Inherit usage from parent material
                    wasteFactor: 0.00, // Labor usually has no waste in terms of material, but maybe time inefficiency? Default 0.
                    installRate: laborItem.productivity ? (1 / laborItem.productivity) : undefined, // prod is Units/Hr, installRate is Hrs/Unit
                    laborHourlyRate: laborItem.hourlyRate || 65,
                    heightCondition: currentHeightCondition
                });
            }

            return {
                ...a,
                components: updatedComponents
            };
        }));
        setRowSearchOpen(null);
        setRowSearchQuery('');
    };

    const addComponent = (assemblyId: string) => {
        setAssemblies(prev => prev.map(a => {
            if (a.id !== assemblyId) return a;
            return {
                ...a,
                components: [...a.components, { id: `new-${Date.now()}`, materialName: 'Select Material', usage: 'Fixed Qty', wasteFactor: 0.05 }]
            };
        }));
    };

    const removeComponent = (assemblyId: string, componentId: string) => {
        setAssemblies(prev => prev.map(a => {
            if (a.id !== assemblyId) return a;
            return {
                ...a,
                components: a.components.filter(c => c.id !== componentId)
            };
        }));
    };

    const handleAddAssembly = () => {
        const newId = `manual-${Date.now()}`;
        const newAssembly: WallAssembly = {
            id: newId,
            code: `W${assemblies.length + 1}`,
            description: 'New Wall Assembly',
            framingType: 'Light Metal',
            assemblyType: 'Interior Wall',
            defaultLength: 100,
            defaultHeight: 10,
            components: [
                { id: `c1-${newId}`, materialName: '3 5/8" Metal Stud 25ga', usage: 'Vertical @ 16" OC', wasteFactor: 0.08, installRate: 0.15 },
                { id: 'c2-' + newId, materialName: '16mm (5/8") TYPE X Gypsum Board', usage: 'Coverage (1 Layer)', wasteFactor: 0.10, installRate: 0.009 }
            ]
        };
        setAssemblies(prev => [...prev, newAssembly]);
        setTakeoffs(prev => ({ ...prev, [newId]: [] }));
        setEditingAssemblyId(newId);
    };

    const deleteAssembly = (id: string) => {
        // Instant deletion as requested
        setAssemblies(prev => prev.filter(a => a.id !== id));
        const newTakeoffs = { ...takeoffs };
        delete newTakeoffs[id];
        setTakeoffs(newTakeoffs);
        if (editingAssemblyId === id) setEditingAssemblyId(null);
    };

    const handleScheduleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await file.arrayBuffer();
            const workbook = read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = utils.sheet_to_json(worksheet, { header: 1 });
            const rows: any[] = (Array.isArray(jsonData) ? jsonData : []) as any[];

            if (rows.length < 2) throw new Error("Empty file");

            // Dynamic Column Mapping
            const headers = rows[0] as string[];
            const colMap = {
                code: headers.findIndex(h => h?.match(/code|mark/i)),
                desc: headers.findIndex(h => h?.match(/description|name/i)),
                type: headers.findIndex(h => h?.match(/assembly type|type/i)),
                level: headers.findIndex(h => h?.match(/level|floor/i)),
                length: headers.findIndex(h => h?.match(/length/i)),
                height: headers.findIndex(h => h?.match(/height|wall height/i)),
                area: headers.findIndex(h => h?.match(/area|net area/i)),
                perimeter: headers.findIndex(h => h?.match(/perimeter|area perimeter|zone perimeter/i))
            };

            // Fallbacks for standard QB export if headers didn't match
            if (colMap.code === -1) colMap.code = 3;
            if (colMap.desc === -1) colMap.desc = 1;

            const currentAssemblies = [...assemblies];
            const newTakeoffs: Record<string, TakeoffInstance[]> = { ...takeoffs };

            (rows.slice(1) as any[]).forEach((row: any, idx: number) => {
                const code = String(row[colMap.code] || '').trim();
                if (!code) return;

                // Determine Assembly Type from Excel
                let detectedType: any = 'Wall';
                if (colMap.type !== -1 && row[colMap.type]) {
                    const val = String(row[colMap.type]).trim();
                    // Map common variations to internal types
                    if (val.match(/ceiling/i)) detectedType = 'Ceiling';
                    else if (val.match(/soffit/i)) detectedType = 'Soffit';
                    else if (val.match(/bulkhead/i)) detectedType = 'Bulkhead';
                    else if (val.match(/exterior/i)) detectedType = 'Exterior Wall';
                    else if (val.match(/interior/i)) detectedType = 'Interior Wall';
                    else if (val.match(/frame/i)) detectedType = 'Hollow Metal Frame';
                    else if (val.match(/access/i)) detectedType = 'Access Panel';
                    else detectedType = 'Wall'; // Default fallback
                } else {
                    // Fallback logic by description if Type column missing
                    const desc = String(row[colMap.desc] || '').toLowerCase();
                    if (desc.includes('ceiling')) detectedType = 'Ceiling';
                    else if (desc.includes('soffit')) detectedType = 'Soffit';
                }

                let assembly = currentAssemblies.find(a => a.code.toLowerCase() === code.toLowerCase());
                if (!assembly) {
                    const newId = `auto-${code}-${Date.now()}-${idx}`;
                    assembly = {
                        id: newId,
                        code,
                        description: String(row[colMap.desc] || `Imported ${code}`),
                        framingType: 'Light Metal',
                        assemblyType: detectedType, // Use detected type
                        components: []
                    };
                    currentAssemblies.push(assembly);
                } else if (assembly.assemblyType === 'Wall' && detectedType !== 'Wall') {
                    // Update existing assembly type if it was generic and we found a better one
                    assembly.assemblyType = detectedType;
                }

                if (!newTakeoffs[assembly.id]) newTakeoffs[assembly.id] = [];

                // Parse Metrics
                let len = 0, ht = 0, area = 0, perim = 0;

                if (colMap.length !== -1) len = parseFloat(row[colMap.length]) || 0;
                if (colMap.height !== -1) ht = parseFloat(row[colMap.height]) || 0;
                if (colMap.area !== -1) area = parseFloat(row[colMap.area]) || 0;
                if (colMap.perimeter !== -1) perim = parseFloat(row[colMap.perimeter]) || 0;

                // User Request: If Ceiling -> Col E (4) is Area, Col G (6) is Perm, Length strictly 0
                if (detectedType === 'Ceiling') {
                    // E is index 4, G is index 6
                    const colE = parseFloat(row[4]) || 0;
                    const colG = parseFloat(row[6]) || 0;
                    if (colE > 0) area = colE; // Override Area if present
                    if (colG > 0) perim = colG; // Override Perim if present
                    len = 0; // Force Length to 0 as requested
                } else if (colMap.length === -1 && colMap.height === -1) {
                    len = parseFloat(row[4]) || 0;
                    ht = parseFloat(row[14]) || 0;
                }

                newTakeoffs[assembly.id].push({
                    id: `imp-${Date.now()}-${idx}`,
                    level: colMap.level !== -1 ? String(row[colMap.level]) : '1',
                    description: String(row[colMap.desc] || row[1] || 'Imported'),
                    quantity: 1,
                    length: len,
                    height: ht,
                    ceilingArea: area,
                    perimeter: perim // Mapped Perimeter
                });
            });

            setAssemblies(currentAssemblies);
            setTakeoffs(newTakeoffs);
            e.target.value = '';
        } catch (err) {
            alert("Error parsing schedule");
        }
    };

    const uniqueLevels = useMemo(() => {
        const levels = new Set<string>();
        const allInstanceLists = Object.values(takeoffs) as TakeoffInstance[][];
        allInstanceLists.forEach((instances: TakeoffInstance[]) => {
            instances.forEach(t => levels.add(t.level || '1'));
        });
        return Array.from(levels).sort();
    }, [takeoffs]);

    const allMaterials = useMemo(() => {
        let combined: CalculatedMaterial[] = [];
        Object.entries(takeoffs).forEach(([assemblyId, instances]: [string, any]) => {
            const typedInstances = instances as TakeoffInstance[];
            const assembly = assemblies.find(a => a.id === assemblyId);
            if (!assembly) return;

            if (filterTag !== 'All') {
                const descLower = assembly.description.toLowerCase();
                if (filterTag === 'Interior Wall' && !descLower.includes('interior')) return;
                if (filterTag === 'Exterior Wall' && !descLower.includes('exterior')) return;
                if (filterTag === 'Ceiling' && !descLower.includes('ceiling') && !descLower.includes('bulkhead')) return;
            }

            const filteredInstances = typedInstances.filter(inst => {
                if (filterLevel === 'All') return true;
                return inst.level === filterLevel;
            });

            if (filteredInstances.length > 0) {
                combined = [...combined, ...calculateMaterials(assembly, filteredInstances, materials)];
            }
        });

        const consolidated: CalculatedMaterial[] = [];
        [...combined, ...manualItems].forEach(mat => {
            const existing = consolidated.find(c => c.item === mat.item && c.unit === mat.unit);
            if (existing) existing.quantity += mat.quantity;
            else consolidated.push({ ...mat });
        });
        return consolidated.sort((a, b) => a.category.localeCompare(b.category));
    }, [takeoffs, assemblies, manualItems, filterLevel, filterTag, materials]);

    const priceMap = useMemo(() => {
        const map: Record<string, { cost: number, per: number }> = {};
        materials.forEach(m => {
            map[m.description] = { cost: m.matCost, per: parsePer(m.per) };
        });
        return map;
    }, [materials]);

    const convertMat = (mat: CalculatedMaterial) => {
        if (displayUnit === 'imperial') {
            let pricing = priceMap[mat.item];
            if (!pricing && mat.item.includes('@')) pricing = priceMap[mat.item.split('@')[0].trim()];

            let totalCost = 0;
            if (pricing) {
                let pricingQty = mat.quantity;
                const dbUnit = materials.find(m => m.description === mat.item || (mat.item.includes('@') && m.description === mat.item.split('@')[0].trim()))?.per?.toLowerCase() || '';

                if ((dbUnit.includes('lf') || dbUnit.includes('ft')) && (mat.unit.includes('pcs') || mat.unit.includes('ea'))) {
                    const len = detectLengthFt(mat.item) || detectLengthFt(mat.unit) || 0;
                    if (len > 0) pricingQty = mat.quantity * len;
                } else if ((dbUnit.includes('sf') || dbUnit.includes('sq')) && mat.unit.includes('sheet')) {
                    pricingQty = mat.quantity * 48;
                }
                totalCost = pricingQty * (pricing.cost / pricing.per);
            }

            return { ...mat, totalCost };
        }
        else {
            let finalQty = mat.quantity;
            let finalUnit = mat.unit;

            const lowerU = mat.unit.toLowerCase();

            if (lowerU.includes('sf') || lowerU.includes('sq')) {
                finalQty = mat.quantity * 0.092903;
                finalUnit = 'm²';
            }
            else if (lowerU.includes('ft') || lowerU.includes('lf') || lowerU.includes('lnft')) {
                finalQty = mat.quantity * 0.3048;
                finalUnit = 'm';
            }

            let pricing = priceMap[mat.item];
            if (!pricing && mat.item.includes('@')) pricing = priceMap[mat.item.split('@')[0].trim()];

            let totalCost = 0;
            if (pricing) {
                let pricingQty = mat.quantity;
                const dbUnit = materials.find(m => m.description === mat.item || (mat.item.includes('@') && m.description === mat.item.split('@')[0].trim()))?.per?.toLowerCase() || '';

                if ((dbUnit.includes('lf') || dbUnit.includes('ft')) && (mat.unit.includes('pcs') || mat.unit.includes('ea'))) {
                    const len = detectLengthFt(mat.item) || detectLengthFt(mat.unit) || 0;
                    if (len > 0) pricingQty = mat.quantity * len;
                } else if ((dbUnit.includes('sf') || dbUnit.includes('sq')) && mat.unit.includes('sheet')) {
                    pricingQty = mat.quantity * 48;
                }
                totalCost = pricingQty * (pricing.cost / pricing.per);
            }

            return { ...mat, quantity: finalQty, unit: finalUnit, totalCost };
        }
    };

    const grandTotal = allMaterials.reduce((acc, curr) => {
        const converted = convertMat(curr);
        return acc + (converted.totalCost || 0);
    }, 0);

    const flatSchedule = useMemo(() => {
        const list: { assemblyId: string; instance: TakeoffInstance }[] = [];
        Object.entries(takeoffs).forEach(([aid, insts]) => {
            (insts as TakeoffInstance[]).forEach(i => list.push({ assemblyId: aid, instance: i }));
        });
        return list;
    }, [takeoffs]);

    const filteredAssemblies = assemblies.filter(a =>
        a.code.toLowerCase().includes(assemblySearch.toLowerCase()) ||
        a.description.toLowerCase().includes(assemblySearch.toLowerCase())
    );

    const handleExportMaterials = () => {
        const exportData = allMaterials.map(mat => {
            const converted = convertMat(mat);
            return {
                Category: converted.category,
                Item: converted.item,
                Quantity: converted.quantity,
                Unit: converted.unit,
                Notes: converted.notes,
                'Total Cost': converted.totalCost
            };
        });

        const ws = utils.json_to_sheet(exportData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Material Report");
        writeFile(wb, `Project_Materials_${new Date().toISOString().split('T')[0]}.xlsx`);
    };



    const currentEditingAssembly = assemblies.find(a => a.id === editingAssemblyId);

    let statsByHeight: Record<number, { len: number, area: number, count: number }> = {};
    let totalAggLength = 0;

    if (currentEditingAssembly) {
        const assemblyInstances = takeoffs[currentEditingAssembly.id] || [];
        statsByHeight = assemblyInstances.reduce((acc, inst) => {
            const h = inst.height || 0;
            const l = (inst.length || 0) * (inst.quantity || 1);

            if (!acc[h]) acc[h] = { len: 0, area: 0, count: 0, perim: 0 };

            if (currentEditingAssembly.assemblyType === 'Ceiling') {
                // For Ceiling, accumulated area is from ceilingArea
                acc[h].area += (inst.ceilingArea || 0);
                acc[h].perim = (acc[h].perim || 0) + (inst.perimeter || 0);
            } else {
                acc[h].len += l;
                acc[h].area += (l * h);
            }

            acc[h].count += (inst.quantity || 1);
            return acc;
        }, {} as Record<number, { len: number, area: number, count: number, perim?: number }>);

        if (assemblyInstances.length > 0) {
            totalAggLength = Object.values(statsByHeight).reduce((a: number, b: any) => a + (b.len || 0), 0) as number;
        } else {
            totalAggLength = currentEditingAssembly.defaultLength || 0;
        }
    }

    // Calculate details for modal
    const modalDetails = useMemo(() => {
        if (!currentEditingAssembly) return { materials: [], totalCost: 0, totalSqFt: 0 };

        const instances = takeoffs[currentEditingAssembly.id] || [];
        const calculated = calculateMaterials(currentEditingAssembly, instances, materials);

        // Enrich calculated with cost
        const priceMapLocal = priceMap;
        const enriched = calculated.map(c => {
            // Try to find Unit Cost if override not present
            let unitPrice = c.overridePrice || 0;
            if (!unitPrice && priceMapLocal[c.item]) {
                unitPrice = priceMapLocal[c.item].cost;
                if (c.unit.toLowerCase().includes('pcs') && priceMapLocal[c.item].per) {
                    // Check cost per 1000 etc?
                    // Usually priceMap stores unit cost directly or per 1000? 
                    // Logic in code: const cost = m.matCost. 
                    // Here we assume simple unit cost for now.
                }
            }
            // For labor overridePrice is usually filled in geminiService
            if (c.category === 'Labor' && !unitPrice) unitPrice = 65; // Fallback

            return { ...c, overridePrice: unitPrice };
        });

        // Calculate Totals
        const total = enriched.reduce((sum, item) => sum + (item.quantity * (item.overridePrice || 0)), 0);

        // Calculate Area (SqFt)
        let area = 0;
        instances.forEach(i => area += (i.ceilingArea || (i.length * i.height)));
        if (instances.length === 0) area = (currentEditingAssembly.defaultLength || 0) * (currentEditingAssembly.defaultHeight || 0);

        return { materials: enriched, totalCost: total, totalSqFt: area };
    }, [currentEditingAssembly, takeoffs, materials, priceMap]);

    // Force strict render of Reports as conditional overlay to avoid Hook Violations
    return (
        <div className="relative z-0 flex h-full bg-slate-100 overflow-hidden" ref={containerRef} onMouseMove={isResizing ? () => { } : undefined}>
            {viewMode === 'report' && (
                <div className="absolute inset-0 z-50 bg-white overflow-auto flex flex-col">
                    <Reports
                        assemblies={assemblies}
                        takeoffs={takeoffs}
                        manualItems={manualItems}
                        materials={materials}
                        displayUnit={displayUnit}
                        activeReportTab={activeReportTab}
                        setActiveReportTab={setActiveReportTab}
                        onCloseReport={onCloseReport}
                    />
                </div>
            )}
            {/* LEFT PANEL: ASSEMBLY LIBRARY */}
            <div style={{ width: `${sidebarWidth}%` }} className={`h-full flex flex-col border-r border-slate-200 bg-white relative shrink-0 ${sidebarWidth === 0 ? 'overflow-hidden' : ''}`}>
                {sidebarWidth > 0 && (
                    <>
                        {/* ... [Left Panel Content remains same] ... */}
                        <div className="p-5 border-b border-slate-200 bg-white sticky top-0 z-20 shadow-[0_4px_20px_-12px_rgba(0,0,0,0.05)]">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate tracking-tight">
                                    <Layers className="w-5 h-5 text-blue-600 shrink-0" />
                                    {sidebarWidth > 20 && "Wall Assemblies"}
                                </h2>
                                <div className="flex gap-1.5">
                                    <div className="relative">
                                        <button onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)} className="p-2 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-blue-600 transition-colors hover:shadow-sm" title="Add from Template">
                                            <LayoutTemplate className="w-4 h-4" />
                                        </button>
                                        {isTemplateMenuOpen && (
                                            <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                                <div className="p-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                    Select Template
                                                </div>
                                                <div className="max-h-[300px] overflow-y-auto">
                                                    {templates.map((tpl, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleAddFromTemplate(tpl)}
                                                            className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                                                        >
                                                            <div className="text-sm font-semibold text-slate-800">{tpl.name}</div>
                                                            <div className="text-xs text-slate-500 truncate" title={tpl.description}>{tpl.description}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setIsDatabaseOpen(true)} className="p-2 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-blue-600 transition-colors hover:shadow-sm" title="Database">
                                        <Database className="w-4 h-4" />
                                    </button>
                                    <div className="relative">
                                        <input
                                            type="file" accept="image/*,application/pdf"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={(e) => e.target.files?.[0] && onAnalyze(e.target.files[0])}
                                            disabled={isAnalyzing}
                                        />
                                        <button disabled={isAnalyzing} className="p-2 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-blue-600 transition-colors hover:shadow-sm" title="Upload Drawing">
                                            {isAnalyzing ? <span className="animate-spin block w-4 h-4 border-2 border-current border-t-transparent rounded-full" /> : <Upload className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <button onClick={handleAddAssembly} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5" title="Create Assembly">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text" placeholder={sidebarWidth > 25 ? "Search assemblies..." : ""}
                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all shadow-sm"
                                    value={assemblySearch}
                                    onChange={(e) => setAssemblySearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col">
                            {/* NEW SIDEBAR GRID */}
                            <AssemblySummaryGrid
                                assemblies={filteredAssemblies}
                                takeoffs={takeoffs}
                                materials={materials}
                                priceMap={priceMap}
                                onSelectAssembly={(id) => setActiveAssemblyId(id)}
                                onEditAssembly={(id) => setEditingAssemblyId(id)}
                                selectedAssemblyId={activeAssemblyId}
                                onDeleteAssembly={deleteAssembly}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* ... [Resizer] ... */}
            <div
                className="w-1.5 bg-slate-100 hover:bg-blue-400 cursor-col-resize transition-colors z-20 flex items-center justify-center group relative -ml-[3px] border-l border-slate-200 hover:w-2"
                onMouseDown={startResizing}
            >
                <div className={`w-0.5 h-8 bg-slate-300 rounded group-hover:bg-white transition-colors ${isResizing ? 'bg-white' : ''}`} />
                <button
                    onClick={(e) => { e.stopPropagation(); toggleSidebar(); }}
                    className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 bg-white border border-slate-300 rounded-full p-0.5 shadow-sm hover:bg-slate-50 hover:text-blue-600 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={sidebarWidth === 0 ? "Expand Sidebar" : "Collapse Sidebar"}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {sidebarWidth === 0 ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                </button>
            </div>

            {/* RIGHT PANEL */}
            <div className="flex-1 h-full flex flex-col bg-slate-50 min-w-0">
                {/* ... [Right Panel Header & Content] ... */}
                <div className="p-4 border-b border-slate-200 bg-white flex-none">
                    {/* ... */}
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-green-600" />
                            Takeoff Schedule
                        </h2>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <input type="file" accept=".xlsx" onChange={handleScheduleUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <button className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-lg shadow-green-900/10 transition-all duration-200 hover:-translate-y-0.5">
                                    <Upload className="w-4 h-4" /> Upload Schedule
                                </button>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="flex-1 overflow-hidden relative flex flex-col">
                    {/* Pass props to new View */}
                    {/* Pass props to new View (Simplified for simple list) */}
                    <TakeoffScheduleView
                        assemblies={filteredAssemblies}
                        takeoffs={takeoffs}
                        onAddInstance={addInstance}
                        selectedAssemblyId={activeAssemblyId}
                        onUpdateInstance={updateInstance}
                        onDeleteInstance={deleteInstance}
                    />
                </div>

            </div>

            {/* --- ASSEMBLY EDIT MODAL --- */}
            <AssemblyEditorModal
                isOpen={!!currentEditingAssembly}
                onClose={() => setEditingAssemblyId(null)}
                assembly={currentEditingAssembly || { id: '', code: '', description: '', components: [], assemblyType: 'Wall' }}
                updateAssemblyInfo={updateAssemblyInfo}
                totalAggLength={totalAggLength}
                materials={materials}
                handleMaterialSelect={handleMaterialSelect}
                handleUpdateComponent={updateComponent}
                handleAddComponent={addComponent}
                handleDeleteComponent={removeComponent}
                getRowDetails={getRowDetails}
                takeoffInstances={currentEditingAssembly ? (takeoffs[currentEditingAssembly.id] || []) : []}
                statsByHeight={statsByHeight}
                onLoadTemplate={handleLoadTemplate}
                templates={templates}
            />


            {/* ... Database Modal ... */}
            {
                isDatabaseOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[90vw] h-[85vh] flex flex-col overflow-hidden relative">
                            <button onClick={() => setIsDatabaseOpen(false)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full text-slate-500 z-50">
                                <X className="w-5 h-5" />
                            </button>
                            <DatabaseManager materials={materials} onUpdateMaterials={onUpdateMaterials} />
                        </div>
                    </div>
                )
            }

            {
                isResizing && (
                    <div className="fixed inset-0 z-50 cursor-col-resize" />
                )
            }
        </div >
    );
};
