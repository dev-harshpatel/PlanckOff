import { WallAssembly, CalculatedMaterial, TakeoffInstance, AssemblyComponent, MaterialDefinition } from '@/types';
import { evaluateMath } from './client';
import { computeFormulaQuantities } from '@/lib/utils/formulaEvaluator';
import { getRowDetails } from '@/lib/utils/calculationUtils';

// --- SMART ASSEMBLY RECIPES ---
const RECIPES = {
    framing: {
        metal: {
            labor: { name: 'Journeyman Carpenter (Framing/Drywall)', rate: 0.020, unit: 'HR', per: 'sqft' },
            screw: { name: '7/16" Wafer Head Framing Screws', rate: 0.004, unit: 'box (1000)', per: 'sqft' },
            pin: { name: '1" Drive Pins (Concrete/Steel)', rate: 1.0, unit: 'box (100)', per: 'lf' },
            channel: { name: '1-1/2" Cold Rolled Channel', rate: 0.25, unit: '16\' pcs', per: 'sf' },
            clip: { name: '1-1/2" Bridging Clip', rate: 0.10, unit: 'ea', per: 'sf' },
            track: { name: 'Matching Steel Track', rate: 2.0, unit: '10\' pcs', per: 'lf' }
        },
        wood: {
            labor: { name: 'Journeyman Carpenter (Framing/Drywall)', rate: 0.022, unit: 'HR', per: 'sqft' },
            screw: { name: '3" Coarse Thread Wood Screws', rate: 0.005, unit: 'box (1000)', per: 'sqft' }
        }
    },
    drywall: {
        hanging: { name: 'Journeyman Carpenter (Framing/Drywall)', rate: 0.015, unit: 'HR', per: 'sqft' },
        finishing: { name: 'Drywall Finisher / Taper', rate: 0.018, unit: 'HR', per: 'sqft' }
    },
    ceiling: {
        grid: { name: 'Journeyman Carpenter (Framing/Drywall)', rate: 0.025, unit: 'HR', per: 'sqft' }
    },
    insulation: {
        install: { name: 'Apprentice / General Laborer', rate: 0.010, unit: 'HR', per: 'sqft' }
    }
};

export const calculateMaterials = (
    assembly: WallAssembly,
    instances: TakeoffInstance[],
    availableMaterials: MaterialDefinition[]
): CalculatedMaterial[] => {
    const mats: CalculatedMaterial[] = [];
    const validMaterialNames = new Set(availableMaterials.map(m => m.description));

    const DEFAULT_WASTE_FACTORS: Record<string, number> = {
        'Framing': 0.08, 'Track': 0.05, 'Drywall': 0.10, 'Insulation': 0.05, 'Finishing': 0.05, 'Ceiling': 0.05, 'Other': 0.00
    };

    // 1. Determine Global Framing Type & Board Thickness
    let framingType: 'Wood' | 'Light Metal' | 'Heavy Metal' = assembly.framingType || 'Light Metal';
    let totalBoardThickness = 0;

    // Analyze components to refine framing type and calculate thickness
    assembly.components.forEach(comp => {
        const name = comp.materialName.toLowerCase();

        // Refine Framing Type if not explicitly set
        if (name.includes('wood') || name.includes('spf') || name.includes('timber') || name.includes('lumber')) {
            framingType = 'Wood';
        } else if (name.includes('structural') || name.includes('red iron') || name.includes('18ga') || name.includes('16ga') || name.includes('14ga')) {
            framingType = 'Heavy Metal';
        }

        // Calculate Board Thickness
        if (comp.usage.includes('Coverage')) {
            let layers = comp.usage.includes('2') ? 2 : 1;
            let thickness = 0.625; // Default 5/8"
            if (name.includes('1/2') || name.includes('13mm')) thickness = 0.5;
            else if (name.includes('3/8')) thickness = 0.375;
            else if (name.includes('1/4')) thickness = 0.25;

            totalBoardThickness += (thickness * layers);
        }
    });

    let hasExplicitTrack = false;
    assembly.components.forEach(comp => {
        if (comp.usage === 'Tracks (Top & Bottom)') hasExplicitTrack = true;
    });

    const getWaste = (comp: AssemblyComponent, defaultCategory: string) => comp.wasteFactor !== undefined ? comp.wasteFactor : (DEFAULT_WASTE_FACTORS[defaultCategory] ?? 0.05);

    let totalLinearFeet = 0;
    let totalWallArea = 0;
    let totalCeilingArea = 0;
    let totalPerimeter = 0;
    let avgHeight = 0;

    instances.forEach(inst => {
        const quantity = inst.quantity || 1;
        const length = inst.length || 0;
        const height = inst.height || 0;
        const ceilingArea = inst.ceilingArea || 0;

        totalLinearFeet += length * quantity;
        totalWallArea += (length * height) * quantity;
        totalCeilingArea += (ceilingArea * quantity);
        if (ceilingArea > 0) totalPerimeter += (inst.perimeter || length) * quantity;
    });

    if (totalLinearFeet > 0) avgHeight = totalWallArea / totalLinearFeet;
    else if (assembly.defaultHeight) avgHeight = assembly.defaultHeight;

    // Fallback totals for prototype mode
    if (instances.length === 0) {
        if (assembly.assemblyType === 'Ceiling') {
            totalCeilingArea = assembly.defaultArea || 0;
            totalPerimeter = assembly.defaultPerimeter || 0;
        } else {
            totalLinearFeet = assembly.defaultLength || 0;
            totalWallArea = (assembly.defaultLength || 0) * (assembly.defaultHeight || 0);
            avgHeight = assembly.defaultHeight || 0;
        }
    }

    const addDependencies = (cat: string, qty: number, skipLabor: boolean = false) => {
        if (qty <= 0) return;
        const addIfValid = (category: CalculatedMaterial['category'], itemName: string, quantity: number, unit: string, notes: string, extra: Partial<CalculatedMaterial> = {}) => {
            if (!validMaterialNames.has(itemName) && !itemName.includes('Generic')) return;
            const codeByDescription = availableMaterials.find((m) => m.description === itemName)?.code;
            mats.push({ category, item: itemName, quantity, unit, notes, code: codeByDescription, ...extra });
        };

        if (cat === 'Framing') {
            const recipe = framingType === 'Wood' ? RECIPES.framing.wood : RECIPES.framing.metal;
            if (!skipLabor) addIfValid('Labor', recipe.labor.name, Math.ceil(qty * recipe.labor.rate), recipe.labor.unit, `Calc @ ${recipe.labor.rate} hrs/${recipe.labor.per}`, {
                sect: '05400', crew: '1 Carp', productionRate: recipe.labor.rate
            });

            if (framingType !== 'Wood') {
                addIfValid('Framing', recipe.screw.name, Math.max(1, Math.ceil(qty * recipe.screw.rate)), recipe.screw.unit, `Framing connections`, { sect: '05400' });

                const pinQty = Math.ceil(totalLinearFeet * 2 / 2);
                if (pinQty > 0) addIfValid('Framing', RECIPES.framing.metal.pin.name, Math.ceil(pinQty / 100), 'box (100)', 'Track Fastening (24" OC)', { sect: '05400' });

                const bracingRows = Math.floor(avgHeight / 4);
                if (bracingRows > 0) {
                    const channelLF = Math.ceil(totalLinearFeet * bracingRows * 1.05);
                    addIfValid('Framing', RECIPES.framing.metal.channel.name, Math.ceil(channelLF / 16), '16\' pcs', `Lateral Bracing (${bracingRows} rows)`, { sect: '05400' });

                    const studCountApprox = Math.ceil(totalLinearFeet / 1.33);
                    const clipCount = studCountApprox * bracingRows;
                    addIfValid('Framing', RECIPES.framing.metal.clip.name, clipCount, 'ea', 'Bridging Clips', { sect: '05400' });
                }

                if (!hasExplicitTrack && totalLinearFeet > 0) {
                    const trackQty = Math.ceil((totalLinearFeet * 2 * 1.05) / 10);
                    addIfValid('Framing', RECIPES.framing.metal.track.name, trackQty, "10' pcs", 'Auto-generated Track', { sect: '05400' });
                }
            }
        }
        else if (cat === 'Drywall') addIfValid('Labor', RECIPES.drywall.hanging.name, Math.ceil(qty * RECIPES.drywall.hanging.rate), 'HR', `Hang @ ${RECIPES.drywall.hanging.rate} hrs/sf`, {
            sect: '09250', crew: '2 Hanger', productionRate: RECIPES.drywall.hanging.rate
        });
        else if (cat === 'Finishing') addIfValid('Labor', RECIPES.drywall.finishing.name, Math.ceil(qty * RECIPES.drywall.finishing.rate), 'HR', `Finish @ ${RECIPES.drywall.finishing.rate} hrs/sf`, {
            sect: '09250', crew: '1 Finisher', productionRate: RECIPES.drywall.finishing.rate, grade: 'Level 4'
        });
        else if (cat === 'Ceiling') addIfValid('Labor', RECIPES.ceiling.grid.name, Math.ceil(qty * RECIPES.ceiling.grid.rate), 'HR', 'Grid & Tile Install', { sect: '09510', crew: '2 Grid' });
        else if (cat === 'Insulation') addIfValid('Labor', RECIPES.insulation.install.name, Math.ceil(qty * RECIPES.insulation.install.rate), 'HR', 'Batt/Board Install', { sect: '07210', crew: '1 Installer' });

        if (assembly.ceilingSubtype === 'Hard Lid') {
            addIfValid('Ceiling', 'Tie Wire 18ga 25 lb Bundle', Math.ceil(qty * 0.005), 'Bundle', 'Wire-tying channels', { sect: '09250' });
        }
    };

    assembly.components.forEach(comp => {
        const { materialName, usage } = comp;
        let quantity = 0;
        let unit = 'ea';
        let category: CalculatedMaterial['category'] = 'Other';
        let notes = '';
        let finalItemName = materialName;

        let triggerDependencyCategory = '';
        let dependencyQuantity = 0;
        let compSect = '09250';
        let compHeight: number | undefined = undefined;
        let compOC: number | undefined = undefined;
        let compLayers: number | undefined = undefined;
        let wastePct: number = getWaste(comp, 'Other');

        switch (usage) {
            case 'Custom Formula':
                category = 'Other';
                const vars = {
                    length: totalLinearFeet, l: totalLinearFeet,
                    height: avgHeight, h: avgHeight,
                    area: totalWallArea || totalCeilingArea, a: totalWallArea || totalCeilingArea,
                    count: instances.reduce((s, i) => s + (i.quantity || 1), 0), c: instances.reduce((s, i) => s + (i.quantity || 1), 0),
                    perimeter: totalPerimeter, p: totalPerimeter,
                    ceilingarea: totalCeilingArea, ca: totalCeilingArea
                };
                const res = evaluateMath(comp.customFormula || '0', vars);
                quantity = Math.ceil(res * (1 + getWaste(comp, 'Other')));
                unit = 'calc';
                notes = `Custom: ${comp.customFormula}`;
                break;

            case 'Tracks (Top & Bottom)':
                category = 'Framing';
                quantity = Math.ceil((totalLinearFeet * 2 * (1 + getWaste(comp, 'Track'))) / 10);
                unit = "10' pcs";
                break;
            case 'Vertical @ 16" OC':
                category = 'Framing';
                compSect = '05400';
                compHeight = avgHeight;
                compOC = 16;
                wastePct = getWaste(comp, 'Framing');
                const studs = Math.ceil(totalLinearFeet * 12 / 16) + (Math.max(1, instances.length) * 2);
                quantity = Math.ceil(studs * (1 + wastePct));
                unit = 'pcs';
                triggerDependencyCategory = 'Framing';
                dependencyQuantity = totalWallArea;
                break;
            case 'Vertical @ 12" OC':
                category = 'Framing';
                const studs12 = Math.ceil(totalLinearFeet * 12 / 12) + (Math.max(1, instances.length) * 2);
                quantity = Math.ceil(studs12 * (1 + getWaste(comp, 'Framing')));
                unit = 'pcs';
                triggerDependencyCategory = 'Framing';
                dependencyQuantity = totalWallArea;
                break;
            case 'Vertical @ 24" OC':
                category = 'Framing';
                const studs24 = Math.ceil(totalLinearFeet * 12 / 24) + (Math.max(1, instances.length) * 2);
                quantity = Math.ceil(studs24 * (1 + getWaste(comp, 'Framing')));
                unit = 'pcs';
                triggerDependencyCategory = 'Framing';
                dependencyQuantity = totalWallArea;
                break;
            case 'Coverage (1 Layer)':
                category = 'Drywall';
                compSect = '09250';
                compLayers = 1;
                wastePct = getWaste(comp, 'Drywall');
                quantity = Math.ceil(((totalWallArea || totalCeilingArea) * (1 + wastePct)) / 48);
                unit = 'sheets';
                triggerDependencyCategory = 'Drywall';
                dependencyQuantity = totalWallArea || totalCeilingArea;
                break;
            case 'Coverage (2 Layers)':
                category = 'Drywall';
                quantity = Math.ceil(((totalWallArea || totalCeilingArea) * 2 * (1 + getWaste(comp, 'Drywall'))) / 48);
                unit = 'sheets';
                triggerDependencyCategory = 'Drywall';
                dependencyQuantity = totalWallArea || totalCeilingArea;
                break;

            case 'Structural - Steel Joist (Span)':
                category = 'Framing';
                const wasteJoist = getWaste(comp, 'Framing');
                const span = assembly.spanLength || 20;
                const spacing = assembly.baffleSpacing || 16;
                const runLength = totalCeilingArea / span;
                const joistsPerRun = Math.ceil((runLength * 12) / spacing) + 1;
                quantity = Math.ceil(joistsPerRun * (1 + wasteJoist));
                unit = `${span}' pcs`;
                notes = `Structural Span ${span}'`;
                triggerDependencyCategory = 'Framing';
                dependencyQuantity = totalCeilingArea;
                break;
            case 'Structural - Deep Leg Track':
                category = 'Framing';
                const wasteDLT = getWaste(comp, 'Track');
                const runL2 = totalCeilingArea / (assembly.spanLength || 20);
                const perimCalc = (runL2 * 2);
                quantity = Math.ceil(perimCalc * (1 + wasteDLT) / 10);
                unit = "10' pcs";
                notes = 'Perimeter containment (Span ends)';
                break;
            case 'Structural - Lateral Bracing':
                category = 'Framing';
                const spanBrace = assembly.spanLength || 20;
                const rows = Math.max(1, Math.floor(spanBrace / 4));
                const runLengthBrace = totalCeilingArea / spanBrace;
                const totalBracingLF = rows * runLengthBrace;
                quantity = Math.ceil(totalBracingLF * 1.05 / 10);
                unit = "10' pcs";
                notes = 'Mid-span bridging';
                break;
            case 'Ceiling - Baffle (Linear Calc)':
                category = 'Ceiling';
                const wasteBaffle = getWaste(comp, 'Ceiling');
                const bSpacing = assembly.baffleSpacing || 12;
                const bLength = assembly.baffleLength || 4;
                const roomL = assembly.roomLength || Math.sqrt(totalCeilingArea);
                const roomW = assembly.roomWidth || Math.sqrt(totalCeilingArea);
                const numRows = Math.ceil((roomL * 12) / bSpacing);
                const bafflesPerRow = Math.ceil(roomW / bLength);
                const totalBaffles = numRows * bafflesPerRow;
                quantity = Math.ceil(totalBaffles * (1 + wasteBaffle));
                unit = `${bLength}' Unit`;
                notes = `Rows @ ${bSpacing}" OC`;
                triggerDependencyCategory = 'Ceiling';
                dependencyQuantity = totalCeilingArea;
                break;
            case 'Ceiling - CRC (Primary 4\' OC)':
                category = 'Ceiling';
                const linearCRC = totalCeilingArea / 4;
                quantity = Math.ceil(linearCRC * 1.05 / 12);
                unit = '12\' pcs';
                triggerDependencyCategory = 'Ceiling';
                dependencyQuantity = totalCeilingArea;
                break;
            case 'Ceiling - Hat Channel (Secondary 24" OC)':
                category = 'Ceiling';
                const linearHat = totalCeilingArea / 2;
                quantity = Math.ceil(linearHat * 1.05 / 12);
                unit = '12\' pcs';
                break;
            case 'Suspension - Main Runner (4\' OC)':
                category = 'Ceiling';
                quantity = Math.ceil((totalCeilingArea / 4) * 1.05 / 12);
                unit = '12\' pcs';
                triggerDependencyCategory = 'Ceiling';
                dependencyQuantity = totalCeilingArea;
                break;
            case 'Suspension - Cross Tee (4\' OC)':
                category = 'Ceiling';
                quantity = Math.ceil((totalCeilingArea / 2) * 1.05 / 4);
                unit = '4\' pcs';
                break;
            case 'Ceiling - Perimeter (Linear)':
                category = 'Ceiling';
                quantity = Math.ceil(totalPerimeter * 1.05 / 10);
                unit = '10\' pcs';
                break;
            case 'Suspension - Hanger Wire (16sf)':
                category = 'Ceiling';
                quantity = Math.ceil((totalCeilingArea / 16) * 1.05 / 100);
                unit = 'Bundle';
                break;
            case 'Ceiling - Tile (2x4)':
                category = 'Ceiling';
                quantity = Math.ceil(totalCeilingArea * 1.05);
                unit = 'sqft';
                break;

            case 'Insulation (Cavity)':
                category = 'Insulation';
                quantity = Math.ceil((totalWallArea || totalCeilingArea) * 1.05);
                unit = 'sqft';
                triggerDependencyCategory = 'Insulation';
                dependencyQuantity = quantity;
                break;

            case 'Fastener (per SqFt)':
                category = 'Finishing';
                const screwCount = Math.ceil((totalWallArea || totalCeilingArea) * 2.2);
                quantity = Math.ceil(screwCount / 1000);
                unit = 'box';

                const minPenetration = 0.625;
                const effectiveThickness = totalBoardThickness > 0 ? totalBoardThickness : 0.625;
                const totalDepth = effectiveThickness + minPenetration;

                let screwLengthStr = '1-1/4"';
                if (totalDepth > 1.25) screwLengthStr = '1-5/8"';
                if (totalDepth > 1.625) screwLengthStr = '2"';
                if (totalDepth > 2.125) screwLengthStr = '2-1/2"';
                if (totalDepth > 2.625) screwLengthStr = '3"';

                let screwType = 'Type S (Fine Thread)';
                let screwCode = 'Fine';

                if (framingType === 'Wood') {
                    screwType = 'Type W (Coarse Thread)';
                    screwCode = 'Coarse';
                } else if (framingType === 'Heavy Metal') {
                    screwType = 'Tek (Self-Drilling)';
                    screwCode = 'Tek';
                }

                const bestScrew = availableMaterials.find(m =>
                    m.description.includes(screwLengthStr) &&
                    (m.description.includes(screwCode) || m.description.includes(screwType.split(' ')[0]))
                );

                if (bestScrew) finalItemName = bestScrew.description;

                notes = `Recommended: ${screwLengthStr} ${screwType} for ${effectiveThickness}" board on ${framingType} framing.`;
                break;

            case 'Joint Treatment (per SqFt)':
                category = 'Finishing';
                const finishArea = (totalWallArea || totalCeilingArea);
                if (materialName.toLowerCase().includes('tape')) {
                    quantity = Math.ceil(finishArea / 500);
                    unit = 'roll';
                } else {
                    quantity = Math.ceil(finishArea / 500);
                    unit = 'unit';
                }
                break;
            case 'Fixed Qty':
                category = 'Other';
                quantity = Math.ceil(1 * 1.05);
                unit = 'ea';
                break;
            default:
                const spacingMatch = (typeof usage === 'string' ? usage : '').match(/Vertical.*@\s*(\d+)/i);
                if (spacingMatch) {
                    category = 'Framing';
                    const spacing = parseInt(spacingMatch[1]);
                    const studs = Math.ceil(totalLinearFeet * 12 / (spacing || 16)) + (Math.max(1, instances.length) * 2);
                    quantity = Math.ceil(studs * (1 + getWaste(comp, 'Framing')));
                    unit = 'pcs';
                    triggerDependencyCategory = 'Framing';
                    dependencyQuantity = totalWallArea;
                    notes = `Spacing: ${spacing}" OC`;
                }
                break;
        }

        // Align with assembly modal Code column: LAB- code or material category Labor → Labor tab
        const matchedMaterial = availableMaterials.find(
            (m) => m.code === comp.materialCode || m.description === comp.materialName
        );
        const isLaborComponent =
            (comp.materialCode != null && comp.materialCode.startsWith('LAB-')) ||
            matchedMaterial?.category === 'Labor';
        if (isLaborComponent) category = 'Labor';

        // Sec. Qty / Sec. UOM — same as Assembly modal (formula or altUnits fallback)
        const isCeilingAssembly = assembly.assemblyType === 'Ceiling';
        const fq = computeFormulaQuantities(comp, matchedMaterial, assembly, instances);
        const formulaSeQty = isCeilingAssembly ? fq.ceilSeQty : fq.seQty;
        const details = getRowDetails(comp, assembly, instances);
        const altU = details.altUnits || {};
        const altSeQty = altU.sf ?? altU.lf ?? altU.m2 ?? altU.m ?? null;
        const secQuantity = formulaSeQty ?? (typeof altSeQty === 'number' ? altSeQty : null);
        const secUnit =
            secQuantity != null
                ? formulaSeQty != null
                    ? (isCeilingAssembly ? matchedMaterial?.mouCeilSec : matchedMaterial?.mouWallSec) ?? '—'
                    : (altU.sf ? 'SF' : altU.lf ? 'LF' : altU.m2 ? 'm²' : altU.m ? 'm' : '—')
                : undefined;

        if (quantity > 0) {
            // Labor components: show hours and use DB hourly rate / override for Labor tab
            if (isLaborComponent) {
                let hours = quantity;
                if (comp.installRate != null && comp.installRate > 0) {
                    hours = quantity * comp.installRate;
                } else if (matchedMaterial?.productivity != null && matchedMaterial.productivity > 0) {
                    hours = quantity / matchedMaterial.productivity;
                }
                const rate = comp.overrideLaborCost ?? matchedMaterial?.hourlyRate ?? 65;
                const laborCode = matchedMaterial?.laborCostCode || comp.sectionCode || 'Labor';
                mats.push({
                    category: 'Labor',
                    item: finalItemName,
                    quantity: Math.round(hours * 100) / 100,
                    unit: 'HR',
                    notes: notes || (matchedMaterial?.description ? `${matchedMaterial.description}` : 'Labor'),
                    sect: compSect,
                    height: compHeight,
                    oc: compOC,
                    layers: compLayers,
                    wastePercent: wastePct * 100,
                    grade: 'Labor',
                    laborCode,
                    overridePrice: rate,
                    productionRate: matchedMaterial?.productivity ?? (comp.installRate != null && comp.installRate > 0 ? 1 / comp.installRate : undefined),
                    crew: comp.crew ? `${comp.crew} Crew` : '1',
                    code: comp.materialCode ?? matchedMaterial?.code,
                    ...(secQuantity != null && { secQuantity, secUnit: secUnit ?? undefined }),
                });
            } else {
                mats.push({
                    category,
                    item: finalItemName,
                    quantity,
                    unit,
                    notes,
                    sect: compSect,
                    height: compHeight,
                    oc: compOC,
                    layers: compLayers,
                    wastePercent: wastePct * 100,
                    grade: 'Standard',
                    code: comp.materialCode ?? matchedMaterial?.code,
                    ...(secQuantity != null && { secQuantity, secUnit: secUnit ?? undefined }),
                });

                if (comp.installRate && comp.installRate > 0) {
                    const laborQty = Math.ceil(quantity * comp.installRate);
                    if (laborQty > 0) {
                        const installLaborMat = availableMaterials.find((m) => m.description === 'Journeyman Carpenter (Framing/Drywall)');
                        mats.push({
                            category: 'Labor',
                            item: 'Journeyman Carpenter (Framing/Drywall)',
                            quantity: laborQty,
                            unit: 'HR',
                            notes: `Install ${finalItemName}`,
                            overridePrice: 65,
                            grade: 'Labor',
                            sect: compSect,
                            productionRate: comp.installRate,
                            crew: '1 Carp',
                            code: installLaborMat?.code
                        });
                    }
                }
            }
        }

        if (triggerDependencyCategory && dependencyQuantity > 0) {
            addDependencies(triggerDependencyCategory, dependencyQuantity, !!(comp.installRate && comp.installRate > 0));
        }
    });

    return mats;
};
