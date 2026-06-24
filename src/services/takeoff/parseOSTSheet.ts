import * as XLSX from 'xlsx';
import {
  TakeoffEntry,
  AggregatedTakeoff,
  ParsedTakeoffResult,
} from '@/types/takeoff';

/**
 * Actual OST column structure:
 * Level | Assembly type | No. | Wall Type | wall Length/ Ceiling area | Unit | Area Parameter | Unit | Height
 *                                              (value)                (LF/SF)    (value)       (unit)
 *
 * Key: Two paired columns exist:
 *   - "wall Length/ Ceiling area" + next col "Unit" (LF or SF)
 *   - "Area Parameter" + next col "Unit"
 */

// Column header patterns to match (case-insensitive, fuzzy)
const COLUMN_PATTERNS = {
  level: [
    'level', 'floor', 'storey', 'story'
  ],
  assemblyType: [
    'assembly type', 'assemblytype', 'assembly_type'
  ],
  no: [
    'no.', 'no', '#', 'sr', 'sr.', 'number'
  ],
  wallType: [
    'wall type', 'walltype', 'wall_type',
    'assembly code', 'assembly', 'assemblycode', 'code'
  ],
  wallLengthCeilingArea: [
    'wall length/ ceiling area', 'wall length/ceiling area',
    'wall length / ceiling area', 'wall length',
    'walllength', 'wall_length', 'length',
    'linear feet', 'lf'
  ],
  areaParameter: [
    'area parementer', 'area parameter', 'area paremeter',
    'area paremeneter', 'area',
  ],
};

/**
 * Find the best matching column index from the headers
 */
function findColumnIndex(headers: string[], patterns: string[]): number {
  const normalizedHeaders = headers.map(h => (h || '').toString().toLowerCase().trim());

  // Exact match first
  for (const pattern of patterns) {
    const idx = normalizedHeaders.indexOf(pattern);
    if (idx !== -1) return idx;
  }

  // Partial match fallback
  for (const pattern of patterns) {
    const idx = normalizedHeaders.findIndex(h => h.includes(pattern));
    if (idx !== -1) return idx;
  }

  return -1;
}

/**
 * Parse a numeric value from a cell
 */
function parseNumeric(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse a string cell value
 */
function parseString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Parse an OST Excel sheet buffer and return structured takeoff data
 */
export function parseOSTSheet(buffer: ArrayBuffer): ParsedTakeoffResult {
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file has no sheets');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawData.length < 2) {
    throw new Error('Excel file has no data rows (need at least a header + 1 row)');
  }

  // Find header row - try first 5 rows
  let headerRowIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;

    const rowStrings = row.map(cell => (cell || '').toString().toLowerCase().trim());

    // Check if this row has wall type or height headers
    const hasWallType = rowStrings.some(h =>
      COLUMN_PATTERNS.wallType.some(p => h.includes(p))
    );

    if (hasWallType) {
      headerRowIndex = i;
      headers = row.map(cell => (cell || '').toString().trim());
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    headers = (rawData[0] as unknown[]).map(cell => (cell || '').toString().trim());
  }

  // Match columns by header name
  const colIdx = {
    level: findColumnIndex(headers, COLUMN_PATTERNS.level),
    assemblyType: findColumnIndex(headers, COLUMN_PATTERNS.assemblyType),
    no: findColumnIndex(headers, COLUMN_PATTERNS.no),
    wallType: findColumnIndex(headers, COLUMN_PATTERNS.wallType),
    wallLengthCeilingArea: findColumnIndex(headers, COLUMN_PATTERNS.wallLengthCeilingArea),
    areaParameter: findColumnIndex(headers, COLUMN_PATTERNS.areaParameter),
  };

  // The "Unit" columns are the column RIGHT AFTER the value columns
  const wallLengthUnitIdx = colIdx.wallLengthCeilingArea !== -1 ? colIdx.wallLengthCeilingArea + 1 : -1;
  const areaParameterUnitIdx = colIdx.areaParameter !== -1 ? colIdx.areaParameter + 1 : -1;

  if (colIdx.wallType === -1) {
    throw new Error(
      `Could not find "Wall Type" column. Found headers: [${headers.join(', ')}]`
    );
  }
  if (colIdx.wallLengthCeilingArea === -1) {
    throw new Error(
      `Could not find "wall Length/ Ceiling area" column. Found headers: [${headers.join(', ')}]`
    );
  }

  // Parse data rows
  const entries: TakeoffEntry[] = [];

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;

    const wallType = parseString(row[colIdx.wallType]);
    if (!wallType) continue; // Skip empty rows

    const wallLengthValue = parseNumeric(row[colIdx.wallLengthCeilingArea]);
    const wallLengthUnit = wallLengthUnitIdx >= 0 ? parseString(row[wallLengthUnitIdx]).toUpperCase() : '';
    const areaParameterValue = colIdx.areaParameter >= 0 ? parseNumeric(row[colIdx.areaParameter]) : 0;
    const areaParameterUnit = areaParameterUnitIdx >= 0 ? parseString(row[areaParameterUnitIdx]).toUpperCase() : '';
    const level = colIdx.level >= 0 ? parseString(row[colIdx.level]) : '';
    const assemblyType = colIdx.assemblyType >= 0 ? parseString(row[colIdx.assemblyType]) : '';

    // Skip rows with no usable data
    if (wallLengthValue === 0 && areaParameterValue === 0) continue;

    // Determine what wallLength/ceilingArea means based on the Unit column
    // If Unit is "SF" -> it's ceiling area, wallLength stays 0
    // If Unit is "LF" -> it's wall length (linear feet)
    let wallLength = 0;
    let ceilingArea = 0;

    if (wallLengthUnit === 'SF' || wallLengthUnit === 'M2') {
      ceilingArea = wallLengthValue;
    } else {
      // Default: treat as LF (wall length)
      wallLength = wallLengthValue;
    }

    // Area Parameter is additional area data (e.g., SF for wall area)
    // Store it separately if present
    if (areaParameterValue > 0) {
      if (areaParameterUnit === 'SF' || areaParameterUnit === 'M2') {
        // This is the area of this wall section
        // If we didn't already get a ceiling area, use this
        if (ceilingArea === 0) {
          ceilingArea = areaParameterValue;
        }
      }
    }

    entries.push({
      assemblyCode: wallType,
      wallLength,
      ceilingArea: ceilingArea || undefined,
      level: level || undefined,
      description: assemblyType || undefined,
    });
  }

  if (entries.length === 0) {
    throw new Error('No valid data rows found in the Excel file');
  }

  // Aggregate by assembly code and height
  const aggregated = aggregateEntries(entries);

  return {
    entries,
    aggregated,
    totalAssemblies: aggregated.length,
    columnMapping: {
      assemblyCode: headers[colIdx.wallType] || 'Wall Type',
      wallLength: headers[colIdx.wallLengthCeilingArea] || 'wall Length/ Ceiling area',
      ceilingArea: colIdx.areaParameter >= 0 ? headers[colIdx.areaParameter] : undefined,
      level: colIdx.level >= 0 ? headers[colIdx.level] : undefined,
      assemblyType: colIdx.assemblyType >= 0 ? headers[colIdx.assemblyType] : undefined,
    },
  };
}

/**
 * Group entries by assembly code, summing wall lengths and ceiling areas.
 */
function aggregateEntries(entries: TakeoffEntry[]): AggregatedTakeoff[] {
  const grouped = new Map<string, { totalLF: number; totalCeilingArea: number }>();

  for (const entry of entries) {
    const existing = grouped.get(entry.assemblyCode);
    if (existing) {
      existing.totalLF += entry.wallLength;
      existing.totalCeilingArea += entry.ceilingArea || 0;
    } else {
      grouped.set(entry.assemblyCode, {
        totalLF: entry.wallLength,
        totalCeilingArea: entry.ceilingArea || 0,
      });
    }
  }

  const result: AggregatedTakeoff[] = [];

  for (const [assemblyCode, data] of grouped) {
    const totalLF = Math.round(data.totalLF * 100) / 100;
    const totalSF = Math.round(data.totalCeilingArea * 100) / 100;
    result.push({ assemblyCode, totalLF, totalSF });
  }

  result.sort((a, b) => a.assemblyCode.localeCompare(b.assemblyCode));

  return result;
}
