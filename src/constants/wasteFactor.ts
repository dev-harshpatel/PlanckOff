// Default waste factors by material category

export const DEFAULT_WASTE_FACTORS: Record<string, number> = {
    'Framing': 0.08,      // 8% waste for framing materials
    'Track': 0.05,        // 5% waste for tracks
    'Drywall': 0.10,      // 10% waste for drywall
    'Insulation': 0.05,   // 5% waste for insulation
    'Finishing': 0.05,    // 5% waste for finishing materials
    'Ceiling': 0.05,      // 5% waste for ceiling materials
    'Labor': 0.00,        // No waste for labor
    'Other': 0.00,        // No waste for other items
} as const;

/**
 * Get waste factor for a material category
 * @param category - Material category
 * @param override - Optional override value
 * @returns Waste factor as decimal (e.g., 0.08 = 8%)
 */
export const getWasteFactor = (category: string, override?: number | null): number => {
    if (override !== undefined && override !== null) {
        return override;
    }
    return DEFAULT_WASTE_FACTORS[category] ?? 0.05;
};
