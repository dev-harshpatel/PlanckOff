import { NextRequest, NextResponse } from 'next/server';
import { parseOSTSheet } from '@/services/takeoff/parseOSTSheet';
import {
  parseRawTakeoffSheetDetailed,
  TakeoffRawParseValidationSummary,
  TakeoffRawRecord,
} from '@/services/takeoff/parseRawTakeoff';
import { saveTakeoffOutput } from '@/lib/db/pipelineOutputs';
import { ParsedTakeoffResult, TakeoffEntry } from '@/types/takeoff';
import { withAuth } from '@/lib/auth/api-helpers';

type ParserName = 'ost' | 'raw';

interface ParserCandidate {
  parser: ParserName;
  success: boolean;
  score: number;
  reason: string;
  data?: ParsedTakeoffResult;
  error?: string | null;
  validation?: TakeoffRawParseValidationSummary | null;
}

const aggregateEntries = (entries: TakeoffEntry[]) => {
  const grouped = new Map<string, Map<number, { totalLF: number; totalCeilingArea: number; count: number }>>();

  for (const entry of entries) {
    if (!grouped.has(entry.assemblyCode)) {
      grouped.set(entry.assemblyCode, new Map());
    }

    const heightMap = grouped.get(entry.assemblyCode)!;
    if (!heightMap.has(entry.height)) {
      heightMap.set(entry.height, { totalLF: 0, totalCeilingArea: 0, count: 0 });
    }

    const existing = heightMap.get(entry.height)!;
    existing.totalLF += entry.wallLength;
    existing.totalCeilingArea += entry.ceilingArea || 0;
    existing.count += 1;
  }

  return Array.from(grouped.entries())
    .map(([assemblyCode, heightMap]) => {
      const heightVariants = Array.from(heightMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([height, data]) => {
          const totalSF =
            data.totalCeilingArea > 0 ? data.totalCeilingArea : height * data.totalLF;
          return {
            height,
            totalLF: Math.round(data.totalLF * 100) / 100,
            totalSF: Math.round(totalSF * 100) / 100,
            count: data.count,
          };
        });

      return {
        assemblyCode,
        heightVariants,
        totalLF: Math.round(heightVariants.reduce((sum, variant) => sum + variant.totalLF, 0) * 100) / 100,
        totalSF: Math.round(heightVariants.reduce((sum, variant) => sum + variant.totalSF, 0) * 100) / 100,
      };
    })
    .sort((a, b) => a.assemblyCode.localeCompare(b.assemblyCode));
};

const buildParsedTakeoffFromRawRecords = (rawRecords: TakeoffRawRecord[]): ParsedTakeoffResult => {
  const entries = rawRecords
    .map((record) => {
      const assemblyCode = String(record.wall_type ?? '').trim();
      const height = Number.parseFloat(String(record.height ?? 0));
      if (!assemblyCode || !Number.isFinite(height) || height <= 0) {
        return null;
      }

      const assemblyType = String(record.assembly_type ?? '').trim().toLowerCase();
      const isCeiling = assemblyType === 'ceiling';
      const wallLength = isCeiling ? 0 : Number(record.wall_length ?? 0) || 0;
      const ceilingArea = isCeiling ? Number(record.ceiling_area ?? 0) || 0 : undefined;
      const description = String(record.description ?? record.assembly_type ?? '').trim() || undefined;
      const level = String(record.level ?? '').trim() || undefined;

      if (wallLength === 0 && (ceilingArea ?? 0) === 0) {
        return null;
      }

      const entry: TakeoffEntry = {
        assemblyCode,
        height,
        wallLength,
        ceilingArea,
        level,
        description,
      };

      return entry;
    })
    .filter((entry): entry is TakeoffEntry => entry != null);

  if (entries.length === 0) {
    throw new Error('No valid raw takeoff rows available for preview');
  }

  const aggregated = aggregateEntries(entries);

  return {
    entries,
    aggregated,
    totalAssemblies: aggregated.length,
    columnMapping: {
      assemblyCode: 'Wall Type',
      height: 'Height',
      wallLength: 'wall Length/ Ceiling area',
      level: 'Level',
      assemblyType: 'Assembly Type',
    },
  };
};

const scoreOstCandidate = (result: ParsedTakeoffResult): ParserCandidate => {
  const populatedColumns = Object.values(result.columnMapping).filter(Boolean).length;
  const score =
    300 +
    Math.min(result.entries.length, 120) +
    Math.min(result.aggregated.length * 5, 100) +
    populatedColumns * 5;

  return {
    parser: 'ost',
    success: true,
    score,
    reason: `OST parser produced ${result.entries.length} entries across ${result.aggregated.length} assemblies.`,
    data: result,
  };
};

const scoreRawCandidate = (
  result: ParsedTakeoffResult,
  validation: TakeoffRawParseValidationSummary | null,
): ParserCandidate => {
  const malformedCount = validation?.malformedNumericRowCount ?? 0;
  const skippedCount = validation?.skippedEmptyRowCount ?? 0;
  const score =
    250 +
    Math.min(result.entries.length, 120) +
    Math.min(result.aggregated.length * 5, 100) -
    malformedCount * 15 -
    Math.min(skippedCount, 40);

  return {
    parser: 'raw',
    success: true,
    score,
    reason: `Raw parser produced ${result.entries.length} entries with ${malformedCount} malformed numeric row(s).`,
    data: result,
    validation,
  };
};

const selectBestParser = (candidates: ParserCandidate[]) =>
  [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.parser === 'ost' && b.parser === 'raw') return -1;
    if (a.parser === 'raw' && b.parser === 'ost') return 1;
    return 0;
  })[0];

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();

    let ostResult: ParsedTakeoffResult | null = null;
    let selectedPreview: ParsedTakeoffResult | null = null;
    let rawRecords: ReturnType<typeof parseRawTakeoffSheetDetailed>["records"] = [];
    let rawValidation: ReturnType<typeof parseRawTakeoffSheetDetailed>["validation"] | null = null;
    let previewError: string | null = null;
    let rawError: string | null = null;

    try {
      ostResult = parseOSTSheet(buffer);
    } catch (error) {
      previewError = error instanceof Error ? error.message : "Failed to parse takeoff preview";
    }

    try {
      const rawResult = parseRawTakeoffSheetDetailed(buffer);
      rawRecords = rawResult.records;
      rawValidation = rawResult.validation;
    } catch (error) {
      rawError = error instanceof Error ? error.message : "Failed to parse raw takeoff rows";
    }

    const candidates: ParserCandidate[] = [];
    if (ostResult) {
      candidates.push(scoreOstCandidate(ostResult));
    } else {
      candidates.push({
        parser: 'ost',
        success: false,
        score: -1,
        reason: previewError ?? 'OST parser failed',
        error: previewError,
      });
    }

    if (rawRecords.length > 0) {
      try {
        const rawPreview = buildParsedTakeoffFromRawRecords(rawRecords);
        candidates.push(scoreRawCandidate(rawPreview, rawValidation));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to build raw takeoff preview';
        candidates.push({
          parser: 'raw',
          success: false,
          score: -1,
          reason: message,
          error: message,
          validation: rawValidation,
        });
      }
    } else {
      candidates.push({
        parser: 'raw',
        success: false,
        score: rawError ? -1 : -5,
        reason: rawError ?? 'Raw parser returned no rows',
        error: rawError,
        validation: rawValidation,
      });
    }

    const selectedCandidate = selectBestParser(candidates);
    selectedPreview = selectedCandidate?.data ?? null;

    if (!selectedPreview) {
      return NextResponse.json(
        {
          success: false,
          error: previewError ?? rawError ?? "Failed to parse Excel file",
          diagnostics: {
            selectedParser: null,
            candidates,
          },
        },
        { status: 422 },
      );
    }
    
    // Strategy 1: Save to DB if projectId provided (use raw format for finalize compatibility)
    let takeoffOutputId: string | undefined;
    const warnings: string[] = [];
    if (projectId) {
      const takeoffTs = Date.now();
      const takeoffFilename = `takeoff-${takeoffTs}.json`;

      if (rawRecords.length === 0) {
        warnings.push(
          rawError
            ? `Preview parsed successfully, but raw takeoff rows could not be extracted for persistence: ${rawError}`
            : "Preview parsed successfully, but no raw takeoff rows were extracted for persistence.",
        );
      } else {
        const { data: takeoffSaved, error: takeoffError } = await saveTakeoffOutput(
          rawRecords,
          takeoffFilename,
          projectId,
        );
        if (takeoffError) {
          console.error("[parse-takeoff] Failed to save to DB:", takeoffError);
          warnings.push("Takeoff preview parsed successfully, but saving raw takeoff data failed.");
        } else {
          takeoffOutputId = takeoffSaved?.id;
        }
      }
    }

    if (selectedCandidate.parser === 'raw' && ostResult) {
      warnings.push(
        'Raw parser preview was selected because it scored higher than the OST parser for this file.',
      );
    } else if (selectedCandidate.parser === 'ost' && rawError) {
      warnings.push(
        `Raw parser fallback was unavailable for persistence validation: ${rawError}`,
      );
    }

    if (rawValidation && rawValidation.malformedNumericRowCount > 0) {
      const sampleRows = rawValidation.malformedRows
        .slice(0, 5)
        .map((issue) => `row ${issue.excelRow} (${issue.field}: ${issue.rawValue})`)
        .join(", ");
      warnings.push(
        `Skipped ${rawValidation.malformedNumericRowCount} takeoff row(s) with malformed numeric values${sampleRows ? `: ${sampleRows}` : ""}.`,
      );
    }

    return NextResponse.json({
      success: true,
      data: selectedPreview,
      fileName: file.name,
      takeoffOutputId, // Return ID if saved
      diagnostics: {
        selectedParser: selectedCandidate.parser,
        selectedScore: selectedCandidate.score,
        candidates: candidates.map((candidate) => ({
          parser: candidate.parser,
          success: candidate.success,
          score: candidate.score,
          reason: candidate.reason,
          error: candidate.error ?? null,
          entries: candidate.data?.entries.length ?? 0,
          aggregated: candidate.data?.aggregated.length ?? 0,
          validation: candidate.validation ?? null,
        })),
      },
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse Excel file';
    return NextResponse.json(
      { error: message },
      { status: 422 }
    );
  }
});
