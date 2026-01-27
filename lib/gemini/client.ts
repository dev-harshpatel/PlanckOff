import { WallAssembly, MaterialDefinition, AssemblyComponent, CalculationMethod } from '@/types';

/**
 * Client-side function to identify wall assemblies via the API route
 * This keeps the Gemini API key secure on the server
 */
export async function identifyWallAssemblies(
  base64Image: string,
  mimeType: string,
  availableMaterials: MaterialDefinition[]
): Promise<WallAssembly[]> {
  const materialContext = availableMaterials.map(m => `- ${m.description}`).join('\n');

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base64Image,
      mimeType,
      materialContext,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to analyze image');
  }

  const data = await response.json();

  // Process the response and create WallAssembly objects
  return data.assemblies.map((a: any, index: number) => {
    const finalComponents: AssemblyComponent[] = [];
    let hasStuds = false;
    let studDepth = '';
    let framingType: 'Metal Light' | 'Metal Heavy' | 'Wood' = 'Metal Light';
    let hasDrywall = false;

    if (a.components && Array.isArray(a.components)) {
      for (let i = 0; i < a.components.length; i++) {
        const comp = a.components[i];
        const matName = comp.material || 'Unknown Material';
        const matNameLower = matName.toLowerCase();
        const details = (comp.details || '').toLowerCase();
        let usage: CalculationMethod = 'Fixed Qty';
        let rValue: number | undefined = undefined;

        if (comp.category === 'Framing') {
          hasStuds = true;
          const depthMatch = matName.match(/(\d+[\s-]?\d*\/\d+|\d+(\.\d+)?)/);
          if (depthMatch) studDepth = depthMatch[0];

          if (matNameLower.includes('wood')) framingType = 'Wood';
          else if (matNameLower.includes('structural') || matNameLower.includes('16ga') || matNameLower.includes('red iron')) framingType = 'Metal Heavy';

          if (details.includes('12')) usage = 'Vertical @ 12" OC';
          else if (details.includes('24')) usage = 'Vertical @ 24" OC';
          else usage = 'Vertical @ 16" OC';
        } else if (comp.category === 'Cladding') {
          hasDrywall = true;
          usage = (details.includes('2 layer') || details.includes('double')) ? 'Coverage (2 Layers)' : 'Coverage (1 Layer)';
        } else if (comp.category === 'Insulation') {
          usage = 'Insulation (Cavity)';
          const rMatch = (matName + ' ' + details).match(/r-?(\d+)/i);
          if (rMatch) rValue = parseInt(rMatch[1]);
        }

        finalComponents.push({
          id: `comp-${Date.now()}-${i}`,
          materialName: matName,
          usage: usage,
          rValue: rValue
        });
      }
    }

    if (hasStuds && framingType !== 'Wood') {
      const trackName = studDepth ? `${studDepth}" Track` : 'Matching Steel Track';
      const bestTrack = availableMaterials.find(m => m.description.includes('Track') && m.description.includes(studDepth || '3-5/8'));
      finalComponents.push({
        id: `comp-${Date.now()}-track`,
        materialName: bestTrack ? bestTrack.description : trackName,
        usage: 'Tracks (Top & Bottom)'
      });
    }

    if (hasDrywall) {
      let screwName = '1-1/4" Fine Thread Drywall Screws (Type S)';
      if (framingType === 'Wood') screwName = '1-1/4" Coarse Thread Drywall Screws (Type W)';
      else if (framingType === 'Metal Heavy') screwName = '1-1/4" Self-Drilling Drywall Screws (Tek)';

      finalComponents.push({
        id: `comp-${Date.now()}-screw`,
        materialName: screwName,
        usage: 'Fastener (per SqFt)'
      });
    }

    return {
      id: `assembly-${index}-${Date.now()}`,
      code: a.code,
      description: a.description,
      components: finalComponents,
      framingType: framingType === 'Metal Heavy' ? 'Heavy Metal' : framingType === 'Wood' ? 'Wood' : 'Light Metal'
    };
  });
}

/**
 * Safe math evaluator for custom formulas
 * Runs client-side only
 */
export function evaluateMath(expression: string, vars: Record<string, number>): number {
  let cleanExpr = expression;

  // Replace standard vars (case-insensitive)
  Object.entries(vars).forEach(([key, val]) => {
    cleanExpr = cleanExpr.replace(new RegExp(`\\b${key}\\b`, 'gi'), val.toString());
  });

  // Sanitize: Allow letters (for functions), digits, operators, decimal, parens, and spaces.
  cleanExpr = cleanExpr.replace(/[^a-zA-Z0-9+\-*/().\s]/g, '');

  try {
    // Use Function constructor for restricted eval
    const result = new Function(`return ${cleanExpr}`)();
    if (typeof result === 'number' && isFinite(result)) {
      return result;
    }
    console.warn(`Evaluation of formula "${expression}" did not result in a valid number. Got:`, result);
    return 0;
  } catch (e) {
    console.warn('Math Eval Error for expression:', expression, 'Error:', e);
    return 0;
  }
}
