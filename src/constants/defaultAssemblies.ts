import { AssemblyComponent } from '../types';

export interface AssemblyTemplate {
    name: string;
    category: 'Wall' | 'Ceiling' | 'Soffit';
    description: string;
    components: Omit<AssemblyComponent, 'id'>[];
}

export const DEFAULT_TEMPLATES: AssemblyTemplate[] = [
    {
        name: 'Standard Interior Partition (3-5/8")',
        category: 'Wall',
        description: '3-5/8" Metal Studs @ 16" OC, 1 Layer 5/8" Type X GWB each side, R-13 Insulation',
        components: [
            // Framing
            { materialName: '3-5/8" 20ga Steel Stud (12\')', usage: 'Vertical @ 16" OC', materialCost: 0, overrideLaborCost: 0 },
            { materialName: '3-5/8" 20ga Track', usage: 'Tracks (Top & Bottom)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Framing Labor', usage: 'Framing Labor (Linear Feet)', materialCost: 0, overrideLaborCost: 0.85 }, // Added Labor

            // Board
            { materialName: '5/8" Type X Gypsum Board', usage: 'Coverage (2 Layers)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Unload & Stock', usage: 'Coverage (2 Layers)', materialCost: 0, overrideLaborCost: 0.15 }, // Added Labor
            { materialName: 'Hang Drywall', usage: 'Coverage (2 Layers)', materialCost: 0, overrideLaborCost: 0.45 }, // Added Labor

            // Insulation
            { materialName: 'R-13 Batt Insulation', usage: 'Insulation (Cavity)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Install Insulation', usage: 'Insulation (Cavity)', materialCost: 0, overrideLaborCost: 0.12 }, // Added Labor

            // Fasteners
            { materialName: 'Drywall Screws (1-1/4")', usage: 'Fastener (per SqFt)', materialCost: 0, overrideLaborCost: 0 },

            // Finishing
            { materialName: 'Joint Tape & Mud', usage: 'Joint Treatment (per SqFt)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Tape & Finish (Lvl 4)', usage: 'Joint Treatment (per SqFt)', materialCost: 0, overrideLaborCost: 0.55 } // Added Labor
        ]
    },
    {
        name: 'Chase Wall (Double 3-5/8")',
        category: 'Wall',
        description: 'Double Row 3-5/8" Studs, Plumbing Chase, 2 Layers GWB',
        components: [
            { materialName: '3-5/8" 20ga Steel Stud (12\')', usage: 'Vertical @ 16" OC', materialCost: 0, overrideLaborCost: 0 },
            { materialName: '3-5/8" 20ga Steel Stud (12\')', usage: 'Vertical @ 16" OC', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Chase Wall Framing Labor', usage: 'Framing Labor (Linear Feet)', materialCost: 0, overrideLaborCost: 1.50 }, // Added Labor

            { materialName: '3-5/8" 20ga Track', usage: 'Tracks (Top & Bottom)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: '3-5/8" 20ga Track', usage: 'Tracks (Top & Bottom)', materialCost: 0, overrideLaborCost: 0 },

            { materialName: '5/8" Type X Gypsum Board', usage: 'Coverage (2 Layers)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Hang Drywall', usage: 'Coverage (2 Layers)', materialCost: 0, overrideLaborCost: 0.45 },

            { materialName: 'Drywall Screws (1-1/4")', usage: 'Fastener (per SqFt)', materialCost: 0, overrideLaborCost: 0 }
        ]
    },
    {
        name: 'Suspended Ceiling (2x4 Grid)',
        category: 'Ceiling',
        description: '2x4 Acoustic Tile, 15/16" Grid System',
        components: [
            { materialName: 'Main Runner (12\')', usage: 'Suspension - Main Runner (4\' OC)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Cross Tee (4\')', usage: 'Suspension - Cross Tee (4\' OC)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Wall Angle (12\')', usage: 'Ceiling - Perimeter (Linear)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Hanger Wire (12ga)', usage: 'Suspension - Hanger Wire (16sf)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Install Grid System', usage: 'Suspension - Main Runner (4\' OC)', materialCost: 0, overrideLaborCost: 1.25 }, // Uses Main Runner logic for area approx? Or manually.

            { materialName: 'Acoustic Tile (2x4)', usage: 'Ceiling - Tile (2x4)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Install Tiles', usage: 'Ceiling - Tile (2x4)', materialCost: 0, overrideLaborCost: 0.35 }
        ]
    },
    {
        name: 'Drywall Grid Ceiling',
        category: 'Ceiling',
        description: 'Drywall Suspension Grid, 5/8" GWB',
        components: [
            { materialName: 'Main Runner (HD)', usage: 'Suspension - Main Runner (4\' OC)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Cross Tee (4\')', usage: 'Suspension - Cross Tee (4\' OC)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Furring Channel (7/8")', usage: 'Suspension - Furring (16" OC)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Install Grid & Furring', usage: 'Suspension - Furring (16" OC)', materialCost: 0, overrideLaborCost: 1.80 },

            { materialName: 'Hanger Wire (12ga)', usage: 'Suspension - Hanger Wire (16sf)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: '5/8" Gypsum Board', usage: 'Coverage (1 Layer)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Hang Ceiling Board', usage: 'Coverage (1 Layer)', materialCost: 0, overrideLaborCost: 0.65 }
        ]
    },
    {
        name: 'Soffit (Framed)',
        category: 'Soffit',
        description: 'Metal Framed Soffit with Vertical Drops',
        components: [
            { materialName: '3-5/8" 20ga Track', usage: 'Tracks (Top & Bottom)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: '3-5/8" 20ga Steel Stud', usage: 'Soffit - Vertical Framing', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Soffit Framing Labor', usage: 'Framing Labor (Linear Feet)', materialCost: 0, overrideLaborCost: 2.50 },

            { materialName: '5/8" Type X Gypsum Board', usage: 'Coverage (1 Layer)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Hang Soffit Board', usage: 'Coverage (1 Layer)', materialCost: 0, overrideLaborCost: 0.80 },

            { materialName: 'Corner Bead', usage: 'Corner Bead (Vertical)', materialCost: 0, overrideLaborCost: 0 }
        ]
    },
    {
        name: 'ACT Ceiling (2x2) - Commercial',
        category: 'Ceiling',
        description: '2x2 Suspended Acoustic Ceiling Tile System',
        components: [
            { materialName: 'Main Runner (12\')', usage: 'Suspension - Main Runner (4\' OC)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Cross Tee (4\')', usage: 'Suspension - Cross Tee (4\' OC)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Cross Tee (2\')', usage: 'Suspension - Cross Tee (2\' OC)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Wall Angle (12\')', usage: 'Ceiling - Perimeter (Linear)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Hanger Wire (12ga)', usage: 'Suspension - Hanger Wire (16sf)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Acoustic Tile (2x2)', usage: 'Ceiling - Tile (2x2)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Ceiling Install Labor', usage: 'Suspension - Main Runner (4\' OC)', materialCost: 0, overrideLaborCost: 1.35 }
        ]
    },
    {
        name: 'Acoustic Baffles (Linear)',
        category: 'Ceiling',
        description: 'Linear Felt/Acoustic Baffles hung from structure',
        components: [
            { materialName: 'Linear Baffle (8\')', usage: 'Ceiling - Baffle (Linear Calc)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Aircraft Cable Kit', usage: 'Fixed Qty', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Unistrut Channel', usage: 'Structural - Lateral Bracing', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Install Baffles', usage: 'Ceiling - Baffle (Linear Calc)', materialCost: 0, overrideLaborCost: 0.75 }
        ]
    },
    {
        name: 'Steel Joist Framed Ceiling',
        category: 'Ceiling',
        description: 'Heavy gauge steel joists spanning room width',
        components: [
            { materialName: '600S162-54 (6" 16ga Joist)', usage: 'Structural - Steel Joist (Span)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: '600T125-54 (6" Track)', usage: 'Structural - Deep Leg Track', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Cold Rolled Channel (1-1/2")', usage: 'Structural - Lateral Bracing', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Joist Framing Labor', usage: 'Structural - Steel Joist (Span)', materialCost: 0, overrideLaborCost: 2.10 },
            { materialName: '5/8" Type X Gypsum Board', usage: 'Coverage (1 Layer)', materialCost: 0, overrideLaborCost: 0 }
        ]
    },
    {
        name: 'Exterior Soffit (Framed)',
        category: 'Soffit',
        description: 'Heavy gauge framing for exterior wind-load',
        components: [
            { materialName: '600S162-54 (6" 16ga Stud)', usage: 'Soffit - Vertical Framing', materialCost: 0, overrideLaborCost: 0 },
            { materialName: '600T125-54 (6" Track)', usage: 'Tracks (Top & Bottom)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Exterior Sheathing (5/8")', usage: 'Coverage (1 Layer)', materialCost: 0, overrideLaborCost: 0 },
            { materialName: 'Exterior Soffit Labor', usage: 'Framing Labor (Linear Feet)', materialCost: 0, overrideLaborCost: 3.25 },
            { materialName: 'Tyvek Wrap', usage: 'Coverage (1 Layer)', materialCost: 0, overrideLaborCost: 0.15 }
        ]
    }
];
