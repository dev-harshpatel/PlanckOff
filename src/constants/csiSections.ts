// CSI MasterFormat Section Mappings for Construction Materials

export const CSI_SECTIONS = {
    // Framing Sections
    NON_STRUCTURAL_FRAMING: '09 22 16 - Non-Structural Metal Framing',
    COLD_FORMED_METAL_FRAMING: '05 40 00 - Cold-Formed Metal Framing',
    METAL_SUPPORT: '09 22 00 - Metal Support Assemblies',

    // Drywall & Finishing
    GYPSUM_BOARD: '09 29 00 - Gypsum Board',
    GYPSUM_BOARD_FINISHING: '09 29 00 - Gypsum Board (Finishing)',

    // Insulation
    THERMAL_INSULATION: '07 21 00 - Thermal Insulation',

    // Ceilings
    ACOUSTICAL_CEILINGS: '09 51 00 - Acoustical Ceilings',

    // General
    GENERAL_REQUIREMENTS: '01 00 00 - General Requirements',
    MISCELLANEOUS: '00 00 00 - Miscellaneous',
} as const;

export type CSISectionKey = keyof typeof CSI_SECTIONS;

/**
 * Get CSI section code based on material category and item description
 */
export const getCSISection = (category: string, item: string): string => {
    const i = (item || '').toLowerCase();
    const cat = (category || '').toLowerCase();

    if (cat.includes('framing')) {
        if (i.includes('25ga') || i.includes('20ga')) return CSI_SECTIONS.NON_STRUCTURAL_FRAMING;
        if (i.includes('18ga') || i.includes('16ga') || i.includes('structural')) return CSI_SECTIONS.COLD_FORMED_METAL_FRAMING;
        return CSI_SECTIONS.METAL_SUPPORT;
    }
    if (cat.includes('drywall')) return CSI_SECTIONS.GYPSUM_BOARD;
    if (cat.includes('insulation')) return CSI_SECTIONS.THERMAL_INSULATION;
    if (cat.includes('ceiling')) return CSI_SECTIONS.ACOUSTICAL_CEILINGS;
    if (cat.includes('finishing')) return CSI_SECTIONS.GYPSUM_BOARD_FINISHING;
    if (cat.includes('labor')) return CSI_SECTIONS.GENERAL_REQUIREMENTS;
    return CSI_SECTIONS.MISCELLANEOUS;
};
