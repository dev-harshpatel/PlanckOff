import { WallAssembly, TakeoffInstance, AssemblyComponent, CalculationMethod } from '@/types';
import { evaluateMath } from '@/services/gemini/client';
import { FORMULA_DEFINITIONS, getWasteFactor } from '@/constants';

export const parsePer = (per: string): number => {
    if (!per) return 1;
    const match = per.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : 1;
};

export const detectLengthFt = (str: string): number | null => {
    if (!str) return null;
    const match = str.match(/(\d+(\.\d+)?)'/);
    if (match) return parseFloat(match[0]);
    const matchNum = str.match(/(\d+(\.\d+)?)'/);
    if (matchNum) return parseFloat(matchNum[1]);
    const match2 = str.match(/(\d+(\.\d+)?)ft/i);
    if (match2) return parseFloat(match2[1]);
    return null;
};

export const getFilteredFormulas = (category: string | undefined): CalculationMethod[] => {
    if (!category) return Object.keys(FORMULA_DEFINITIONS) as CalculationMethod[];

    const allowed: CalculationMethod[] = ['Fixed Qty', 'Custom Formula'];

    switch (category) {
        case 'Framing':
            allowed.push('Vertical @ 16" OC', 'Vertical @ 24" OC', 'Tracks (Top & Bottom)', 'Structural Studs', 'Backing/Blocking');
            break;
        case 'Drywall':
            allowed.push('Coverage (1 Layer)', 'Coverage (2 Layers)', 'Coverage (Shared Wall)', 'Boxed Column');
            break;
        case 'Insulation':
            allowed.push('Insulation (Cavity)', 'Insulation (Continuous)');
            break;
        case 'Finishing':
            allowed.push('Joint Treatment (per SqFt)', 'Level 5 Finish', 'Fastener (per SqFt)', 'Corner Bead (Vertical)');
            break;
        case 'Ceiling':
            allowed.push('Ceiling - Grid', 'Suspension - Hanger Wire (16sf)', 'Suspension - Main T (4ft)', 'Suspension - Cross T (4ft)', 'Ceiling Tile (2x2)', 'Ceiling Tile (2x4)');
            break;
        case 'Labor':
            allowed.push(
                'Vertical @ 16" OC', 'Coverage (1 Layer)', 'Tracks (Top & Bottom)',
                'Joint Treatment (per SqFt)', 'Insulation (Cavity)', 'Framing Labor (Linear Feet)'
            );
            break;
    }
    return allowed;
};

// Performs a live calculation for a single component row for display purposes.
export const getRowDetails = (comp: AssemblyComponent, assembly: WallAssembly, instances: TakeoffInstance[]) => {
    let totalLinearFeet = 0;
    let totalWallArea = 0;
    let totalCeilingArea = 0;
    let totalPerimeter = 0;
    let avgHeight = 0;
    let validInstanceCount = 0;
    let formulaDescription = comp.usage;

    const hMin = comp.heightCondition?.min ?? 0;
    const hMax = comp.heightCondition?.max ?? Infinity;

    // Calculate totals from instances
    instances.forEach(inst => {
        const quantity = inst.quantity || 1;
        const h = inst.height || 0;

        // Calculate effective height slice
        const effectiveH = Math.max(0, Math.min(hMax, h) - hMin);

        totalCeilingArea += (inst.ceilingArea || 0) * quantity;
        if ((inst.ceilingArea || 0) > 0) totalPerimeter += (inst.perimeter || inst.length || 0) * quantity;

        if (effectiveH > 0) {
            totalLinearFeet += (inst.length || 0) * quantity;
            totalWallArea += ((inst.length || 0) * effectiveH) * quantity;
            validInstanceCount += 1;
        }
    });

    // Prototype Mode Fallback
    if (instances.length === 0) {
        if (assembly.assemblyType === 'Ceiling') {
            totalCeilingArea = assembly.defaultArea || 0;
            totalPerimeter = assembly.defaultPerimeter || 0;
        } else {
            const defH = assembly.defaultHeight || 0;
            const effectiveH = Math.max(0, Math.min(hMax, defH) - hMin);

            if (effectiveH > 0) {
                totalLinearFeet = assembly.defaultLength || 0;
                avgHeight = effectiveH;
                totalWallArea = totalLinearFeet * avgHeight;
                validInstanceCount = 1;
            }
        }
    } else if (totalLinearFeet > 0) {
        avgHeight = totalWallArea / totalLinearFeet;
    } else if (assembly.defaultHeight) {
        // Fallback if no instances match but we have a default? 
        // Actually if instances exist but none match, validInstanceCount is 0, totalLinearFeet is 0.
        // We probably shouldn't use defaultHeight here if we have explicit instances that just don't match.
        avgHeight = 0;
    }

    let quantity = 0;
    let unit = 'ea';
    const altUnits: { lf?: number, m?: number, sf?: number, m2?: number } = { lf: 0, sf: 0, m: 0, m2: 0 };
    const materialName = comp.materialName;

    // Effective instance count for 'ends' calculation
    const effectiveCount = Math.max(instances.length > 0 ? 0 : 1, validInstanceCount);

    const getWaste = (c: AssemblyComponent, defaultCategory: string) => getWasteFactor(defaultCategory, c.wasteFactor);

    // Overrides
    const calcHeight = comp.overrideHeight ?? avgHeight;

    // Generic Parsing
    const ocMatch = comp.usage.match(/(\d+)"? OC/i);
    const spacingFtMatch = comp.usage.match(/(\d+)'? OC/i);
    const spacingSfMatch = comp.usage.match(/(\d+)sf/i);
    const oc = ocMatch ? parseInt(ocMatch[1]) : 16;
    const spacingFt = spacingFtMatch ? parseInt(spacingFtMatch[1]) : 4;
    const spacingSf = spacingSfMatch ? parseInt(spacingSfMatch[1]) : 16;

    // Usage Classification & Calculation
    const u = comp.usage.toLowerCase();

    if (u.includes('custom formula')) {
        const vars = {
            length: totalLinearFeet, l: totalLinearFeet,
            height: calcHeight, h: calcHeight,
            area: totalWallArea || totalCeilingArea, a: totalWallArea || totalCeilingArea,
            count: effectiveCount, c: effectiveCount,
            perimeter: totalPerimeter, p: totalPerimeter,
            ceilingarea: totalCeilingArea, ca: totalCeilingArea
        };
        quantity = evaluateMath(comp.customFormula || '0', vars) * (1 + getWaste(comp, 'Other'));
        unit = 'calc';

    } else if (u.includes('structural')) {
        // Structural
        if (u.includes('joist') || u.includes('span')) {
            const span = assembly.spanLength || 20;
            const spacing = assembly.baffleSpacing || 16;
            const runLength = totalCeilingArea / span;
            quantity = (Math.ceil((runLength * 12) / spacing) + 1) * (1 + getWaste(comp, 'Framing'));
            unit = `${span}' pcs`;
            altUnits.lf = quantity * span;
            altUnits.m = altUnits.lf * 0.3048;
        } else if (u.includes('deep leg') || u.includes('track')) {
            const runL2 = totalCeilingArea / (assembly.spanLength || 20);
            quantity = (runL2 * 2) * (1 + getWaste(comp, 'Track')) / 10;
            unit = "10' pcs";
            altUnits.lf = quantity * 10;
            altUnits.m = altUnits.lf * 0.3048;
        } else if (u.includes('lateral') || u.includes('bracing')) {
            const spanBrace = assembly.spanLength || 20;
            const rows = Math.max(1, Math.floor(spanBrace / 4));
            quantity = (rows * (totalCeilingArea / spanBrace)) * 1.05 / 10;
            unit = "10' pcs";
            altUnits.lf = quantity * 10;
            altUnits.m = altUnits.lf * 0.3048;
        }

    } else if (u.includes('bead') || u.includes('corner')) {
        // Corner Bead (Robust Logic: Height * Count * 2ish)
        quantity = (effectiveCount * 2 * calcHeight * (1 + getWaste(comp, 'Finishing'))) / 10;
        unit = "10' pcs";
        altUnits.lf = quantity * 10;

    } else if (u.includes('column') || u.includes('boxed')) {
        // Boxed Column (4 sides)
        quantity = ((totalLinearFeet * 4) + (effectiveCount * 4)) * (1 + getWaste(comp, 'Framing'));
        unit = 'pcs';
        if (calcHeight > 0) altUnits.lf = quantity * calcHeight;

    } else if (u.includes('backing') || u.includes('blocking')) {
        // Backing (Linear)
        quantity = (totalLinearFeet * (1 + getWaste(comp, 'Framing'))) / 10;
        unit = "10' pcs";
        altUnits.lf = quantity * 10;

    } else if (u.includes('framing labor') || u.includes('linear feet')) {
        // Framing Labor (Linear Feet)
        quantity = totalLinearFeet;
        unit = 'LF';
        // Height Check > 12ft (User requested adjustment)
        // If avgHeight > 12, we could apply a factor, but effectively the quantity is still the LF of wall.
        // We'll leave it as LF so the user sees the wall length.
        altUnits.m = quantity * 0.3048;

    } else if (u.includes('vertical') || u.includes('stud') || (u.includes('furring') && !u.includes('suspension'))) {
        // Vertical Framing (Studs, Wall Furring)
        if (assembly.assemblyType === 'Ceiling') {
            // Ceiling Logic: Area / Spacing
            // Assuming stud spacing is OC in inches.
            // Formula: (Area / (OC/12)) / Length
            const spacingFt = oc / 12;
            const studLen = comp.heightCondition?.max || assembly.defaultLength || 10; // Use Length for Ceiling Studs? No, typically use 10' or 12' sticks.
            // If user provided overrideHeight, use it.
            const effectiveLen = comp.overrideHeight || studLen;

            const lfNeeded = (totalCeilingArea * (1 + getWaste(comp, 'Framing'))) / spacingFt;
            quantity = lfNeeded / effectiveLen;
            unit = `${effectiveLen}' pcs`;
            formulaDescription = `((Area / ${spacingFt.toFixed(2)}' OC) / ${effectiveLen}') * (1 + Waste)`;
            altUnits.lf = lfNeeded;
            altUnits.m = lfNeeded * 0.3048;
        } else {
            // Wall Logic
            // User requested to remove "Ends" (+2) logic.
            quantity = (totalLinearFeet * 12 / oc) * (1 + getWaste(comp, 'Framing'));
            unit = 'pcs';
            formulaDescription = `(LF * 12 / ${oc}") * (1 + Waste)`;
            if (calcHeight > 0) {
                altUnits.lf = quantity * calcHeight;
                altUnits.m = altUnits.lf * 0.3048;
            }
        }

    } else if (u.includes('track') || u.includes('runner') || u.includes('perimeter')) {
        // Linear Components (Tracks, Angles)
        const multiplier = (u.includes('single') || u.includes('1 track') || u.includes('perimeter')) ? 1 : (u.includes('track') ? 2 : 1);
        const pieceLen = detectLengthFt(materialName) || 10;

        let len = totalLinearFeet;
        if (u.includes('perimeter')) len = totalPerimeter || totalLinearFeet;

        quantity = (len * multiplier * (1 + getWaste(comp, 'Track'))) / pieceLen;
        unit = `${pieceLen}' pcs`;
        formulaDescription = `((LF * ${multiplier}) / ${pieceLen}') * (1 + Waste)`;
        altUnits.lf = quantity * pieceLen;
        altUnits.m = altUnits.lf * 0.3048;

    } else if (u.includes('board') || u.includes('drywall') || u.includes('gypsum') || u.includes('coverage')) {
        // Board Coverage
        const layers = comp.overrideLayers || (u.includes('2 layer') ? 2 : 1);
        const refArea = 48; // 4x12 sheet default ref
        quantity = ((totalWallArea * layers) / refArea) * (1 + getWaste(comp, 'Drywall'));
        unit = '4x12 Sheets';
        formulaDescription = `((Area * ${layers}) / 48) * (1 + Waste)`;
        altUnits.sf = quantity * refArea;
        altUnits.m2 = altUnits.sf * 0.092903;

    } else if (u.includes('insulation')) {
        // Insulation
        quantity = ((totalWallArea || totalCeilingArea) * (1 + getWaste(comp, 'Insulation')));
        unit = 'sf';
        formulaDescription = `Total Area * (1 + Waste)`;
        altUnits.sf = quantity;
        altUnits.m2 = quantity * 0.0929;

    } else if (u.includes('suspension')) {
        // Ceiling Suspension
        if (u.includes('hanger')) {
            quantity = (totalCeilingArea * (1 + getWaste(comp, 'Ceiling'))) / spacingSf;
            unit = 'pcs';
            formulaDescription = `(Area / Spacing(sf)) * (1 + Waste)`;
        } else {
            const lfNeeded = (totalCeilingArea * (1 + getWaste(comp, 'Ceiling'))) / spacingFt;
            const len = detectLengthFt(materialName) || (u.includes('main') ? 12 : 4);
            quantity = lfNeeded / len;
            unit = `${len}' pcs`;
            formulaDescription = `((Area / Spacing(ft)) / Length) * (1 + Waste)`;
            altUnits.lf = lfNeeded;
        }

    } else if (u.includes('tile')) {
        // Ceiling Tile
        const tileSize = u.includes('2x2') ? 4 : 8;
        quantity = (totalCeilingArea * (1 + getWaste(comp, 'Ceiling'))) / tileSize;
        unit = 'tiles';
        formulaDescription = `(Area / TileSize) * (1 + Waste)`;
        altUnits.sf = quantity * tileSize;

    } else if (u.includes('fastener') || u.includes('screw')) {
        // Fasteners
        quantity = ((totalWallArea || totalCeilingArea) * 2.5 * (1 + getWaste(comp, 'Other'))) / 1000;
        unit = 'box';
        formulaDescription = `(Area * 2.5 / 1000) * (1 + Waste)`;

    } else if (u.includes('joint') || u.includes('mud') || u.includes('tape')) {
        // Joint Treatment
        quantity = ((totalWallArea || totalCeilingArea) * (1 + getWaste(comp, 'Finishing'))) / 500;
        unit = 'bucket';
        formulaDescription = `(Area / 500) * (1 + Waste)`;

    } else if (u.includes('baffle')) {
        // Baffle
        const bSpacing = assembly.baffleSpacing || 12;
        const bLength = assembly.baffleLength || 4;
        const roomL = assembly.roomLength || Math.sqrt(totalCeilingArea);
        const rows = roomL / (bSpacing / 12);
        quantity = (rows * (totalCeilingArea / roomL) / bLength) * (1 + getWaste(comp, 'Ceiling'));
        unit = 'pcs';
        formulaDescription = `(Baffle Formula) * (1 + Waste)`;

    } else if (u.includes('fixed') || u.includes('qty')) {
        // Fixed Quantity
        quantity = effectiveCount * (1 + getWaste(comp, 'Other'));
        unit = 'ea';
        formulaDescription = `Count * (1 + Waste)`;

    } else {
        // Default / Fallback
        quantity = 0;
        unit = '-';
    }

    // Manual Override for Quantity
    if (comp.overrideQuantity !== undefined) {
        quantity = comp.overrideQuantity;
        formulaDescription = `Manual Override`;
    }

    if (isNaN(quantity) || !isFinite(quantity)) {
        quantity = 0;
    }

    // UOM Conversion Logic
    let displayQuantity = quantity;
    let displayUnit = unit;
    let displayMaterialCost = comp.materialCost || 0;

    if (comp.selectedUnit) {
        const target = comp.selectedUnit.toLowerCase();
        // SF / m2 / Sheets
        if (target === 'm2' && altUnits.m2) {
            displayQuantity = altUnits.m2;
            displayUnit = 'm²';
        } else if (target === 'sf' && unit.toLowerCase().includes('sheet')) {
            displayQuantity = altUnits.sf || (quantity * 48); // Fallback 48sf/sheet
            displayUnit = 'SF';
        } else if (target === 'sheets' && (unit.includes('sf') || unit.includes('sq'))) {
            displayQuantity = quantity / 48;
            displayUnit = 'Sheets';
        }
        // LF / m / Pcs
        else if (target === 'm' && altUnits.m) {
            displayQuantity = altUnits.m;
            displayUnit = 'm';
        } else if (target === 'lf' && unit.toLowerCase().includes('pcs')) {
            displayQuantity = altUnits.lf || (quantity * (comp.heightCondition?.max || assembly.defaultHeight || 10)); // Fallback height
            displayUnit = 'LF';
        } else if (target === 'pcs' && (unit.includes('lf') || unit.includes('ft'))) {
            // Convert LF to Pcs (Need Height or Length)
            const len = comp.heightCondition?.max || assembly.defaultHeight || 10;
            if (len > 0) displayQuantity = quantity / len;
            displayUnit = 'Pcs';
        }

        // Adjust Unit Price to match Display Unit (Invariant: Total Cost)
        if (displayQuantity > 0 && quantity > 0) {
            const ratio = quantity / displayQuantity;
            displayMaterialCost = (comp.materialCost || 0) * ratio;
        }
    }

    let materialTotal = 0;
    let laborTotal = 0;

    if (quantity > 0) {
        // Material Cost
        const matUnitCost = comp.overrideMatCost !== undefined ? comp.overrideMatCost : (comp.materialCost || 0);
        if (matUnitCost > 0) {
            materialTotal = quantity * matUnitCost;
        }

        // Labor Cost
        if (comp.overrideLaborCost !== undefined) {
            laborTotal = quantity * comp.overrideLaborCost;
        } else {
            const rate = comp.laborHourlyRate || 65;
            const crew = comp.crew || 1;

            if (comp.productionRate && comp.productionRate > 0) {
                const manHours = (quantity / comp.productionRate) * crew;
                laborTotal = manHours * rate;
            } else if (comp.installRate) {
                laborTotal = quantity * comp.installRate * rate;
            }
        }
    }

    const totalCompositeCost = materialTotal + laborTotal;
    const laborUnitPrice = displayQuantity > 0 ? (laborTotal / displayQuantity) : 0;
    const calculationVars = {
        L: totalLinearFeet,
        TotalLF: totalLinearFeet,
        H: calcHeight,
        AvgHeight: avgHeight,
        Area: totalWallArea || totalCeilingArea,
        Count: effectiveCount,
        Perimeter: totalPerimeter,
        CeilingArea: totalCeilingArea,
        Ends: effectiveCount * 2
    };

    return { quantity: displayQuantity, unit: displayUnit, altUnits, materialTotal, laborTotal, totalCompositeCost, unitPrice: displayMaterialCost, laborUnitPrice, formulaDescription, calculationVars };
};
