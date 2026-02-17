import { NextRequest, NextResponse } from 'next/server';
import { parseOSTSheet } from '@/services/takeoff/parseOSTSheet';
import { parseRawTakeoffSheet } from '@/services/takeoff/parseRawTakeoff';
import { saveTakeoffOutput } from '@/lib/db/pipelineOutputs';

export async function POST(request: NextRequest) {
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
    
    // Parse for preview (OST format)
    const result = parseOSTSheet(buffer);
    
    // Strategy 1: Save to DB if projectId provided (use raw format for finalize compatibility)
    let takeoffOutputId: string | undefined;
    if (projectId) {
      const takeoffTs = Date.now();
      const takeoffFilename = `takeoff-${takeoffTs}.json`;
      
      // Parse again with raw parser for DB storage (matches process-pipeline format)
      const rawRecords = parseRawTakeoffSheet(buffer);
      
      const { data: takeoffSaved, error: takeoffError } = await saveTakeoffOutput(
        rawRecords,
        takeoffFilename,
        projectId,
      );
      if (takeoffError) {
        console.error("[parse-takeoff] Failed to save to DB:", takeoffError);
        // Continue even if DB save fails - return parsed data
      } else {
        takeoffOutputId = takeoffSaved?.id;
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      fileName: file.name,
      takeoffOutputId, // Return ID if saved
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse Excel file';
    return NextResponse.json(
      { error: message },
      { status: 422 }
    );
  }
}
