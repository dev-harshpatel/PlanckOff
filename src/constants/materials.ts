import { MaterialDefinition } from '../types';

// Comprehensive Construction Database matching Master Items List Schema
// NOTE: This should contain the complete DEFAULT_CATALOG array from App.tsx
// Preserve all existing entries when migrating
export const DEFAULT_CATALOG: MaterialDefinition[] = [
  // --- LABOR ROLES (HOURLY RATES) ---
  { code: 'LAB-GEN-01', section: '01 00 00', matCostCode: 'LABOR', laborCostCode: 'GEN', type: 'Labor', manufacturer: 'Role', description: 'Project Foreman / Superintendent', matCost: 85.00, per: '1 HR', priceUpdated: '1/24/2024', category: 'Labor' },
  { code: 'LAB-GEN-02', section: '01 00 00', matCostCode: 'LABOR', laborCostCode: 'GEN', type: 'Labor', manufacturer: 'Role', description: 'Journeyman Carpenter (Framing/Drywall)', matCost: 65.00, per: '1 HR', priceUpdated: '1/24/2024', category: 'Labor' },
  { code: 'LAB-GEN-03', section: '01 00 00', matCostCode: 'LABOR', laborCostCode: 'GEN', type: 'Labor', manufacturer: 'Role', description: 'Drywall Finisher / Taper', matCost: 62.00, per: '1 HR', priceUpdated: '1/24/2024', category: 'Labor' },
  { code: 'LAB-GEN-04', section: '01 00 00', matCostCode: 'LABOR', laborCostCode: 'GEN', type: 'Labor', manufacturer: 'Role', description: 'Apprentice / General Laborer', matCost: 45.00, per: '1 HR', priceUpdated: '1/24/2024', category: 'Labor' },
  // --- LABOR ACTIVITIES (For Templates) ---
  { code: 'LAB-ACT-01', section: '09 22 16', matCostCode: 'LABOR', laborCostCode: 'FRM', type: 'Labor', manufacturer: 'Activity', description: 'Framing Labor', matCost: 0.85, per: '1 LF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-02', section: '09 29 00', matCostCode: 'LABOR', laborCostCode: 'DRY', type: 'Labor', manufacturer: 'Activity', description: 'Hang Drywall', matCost: 0.45, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-03', section: '09 29 00', matCostCode: 'LABOR', laborCostCode: 'FIN', type: 'Labor', manufacturer: 'Activity', description: 'Tape & Finish', matCost: 0.55, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-04', section: '09 29 00', matCostCode: 'LABOR', laborCostCode: 'FIN', type: 'Labor', manufacturer: 'Activity', description: 'Tape & Finish (Lvl 4)', matCost: 0.65, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-05', section: '07 21 00', matCostCode: 'LABOR', laborCostCode: 'INS', type: 'Labor', manufacturer: 'Activity', description: 'Install Insulation', matCost: 0.15, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-06', section: '01 00 00', matCostCode: 'LABOR', laborCostCode: 'GEN', type: 'Labor', manufacturer: 'Activity', description: 'Unload & Stock', matCost: 0.15, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-07', section: '09 22 16', matCostCode: 'LABOR', laborCostCode: 'FRM', type: 'Labor', manufacturer: 'Activity', description: 'Chase Wall Framing Labor', matCost: 1.50, per: '1 LF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-08', section: '09 51 00', matCostCode: 'LABOR', laborCostCode: 'ACT', type: 'Labor', manufacturer: 'Activity', description: 'Install Grid System', matCost: 1.25, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-09', section: '09 51 00', matCostCode: 'LABOR', laborCostCode: 'ACT', type: 'Labor', manufacturer: 'Activity', description: 'Install Tiles', matCost: 0.35, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-10', section: '09 51 00', matCostCode: 'LABOR', laborCostCode: 'ACT', type: 'Labor', manufacturer: 'Activity', description: 'Install Grid & Furring', matCost: 1.80, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-11', section: '09 29 00', matCostCode: 'LABOR', laborCostCode: 'DRY', type: 'Labor', manufacturer: 'Activity', description: 'Hang Ceiling Board', matCost: 0.65, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-12', section: '09 22 16', matCostCode: 'LABOR', laborCostCode: 'FRM', type: 'Labor', manufacturer: 'Activity', description: 'Soffit Framing Labor', matCost: 2.50, per: '1 LF', priceUpdated: '1/1/2024', category: 'Labor' },
  { code: 'LAB-ACT-13', section: '09 29 00', matCostCode: 'LABOR', laborCostCode: 'DRY', type: 'Labor', manufacturer: 'Activity', description: 'Hang Soffit Board', matCost: 0.80, per: '1 SF', priceUpdated: '1/1/2024', category: 'Labor' },
  
  // --- STEEL FRAMING (09 22 16) - EXPANDED ---
  // 1-5/8" System
  { code: 'ST-158-25', section: '09 22 16', matCostCode: 'METAL FRAMING', laborCostCode: '103', type: 'Division 09', manufacturer: 'ClarkDietrich', description: '1-5/8" Metal Stud 25ga (18mil) 1-1/4" Flange', width: '1-5/8"', gauge: '25ga', flange: '1-1/4"', matCost: 450.00, per: '1,000 LF', priceUpdated: '11/16/2023', category: 'Framing' },
  
  // TODO: Add all remaining material entries from the original DEFAULT_CATALOG in App.tsx
  // This should include all steel framing, drywall, insulation, finishing, ceiling, and tool items
  
  { code: 'TOOL-CUT', section: '01 54 00', matCostCode: 'TOOLS', laborCostCode: '', type: 'Division 01', manufacturer: 'Generic', description: '4-1/2" Metal Cut-off Wheels (10 Pack)', matCost: 25.00, per: '1 Pack', priceUpdated: '4/1/2024', category: 'Other' }
];
