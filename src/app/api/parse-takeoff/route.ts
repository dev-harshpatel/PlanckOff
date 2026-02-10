import { NextRequest, NextResponse } from 'next/server';
import { parseOSTSheet } from '@/services/takeoff/parseOSTSheet';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

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
    const result = parseOSTSheet(buffer);

    return NextResponse.json({
      success: true,
      data: result,
      fileName: file.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse Excel file';
    return NextResponse.json(
      { error: message },
      { status: 422 }
    );
  }
}
