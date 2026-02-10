/**
 * Test endpoint for PDF parsing
 * GET /api/test-pdf - Returns a simple test response
 */

import { NextRequest, NextResponse } from "next/server";
import { parseWallSpecPDF } from "@/services/openrouter/parseWallSpec";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  console.log("\n🧪 === TEST ENDPOINT CALLED ===");
  
  try {
    // Test with sample wall spec text
    const testWallSpec = `
WALL TYPE P1 - INTERIOR PARTITION WALL
- 5/8" Type X Gypsum Wallboard on each side
- 3-5/8" Metal Studs at 16" O.C.
- R-13 Batt Insulation
- Fire Rating: 1 Hour
- STC Rating: STC 45

WALL TYPE W4 - EXTERIOR WALL
- 5/8" Gypsum Sheathing (exterior)
- Poly Vapour Barrier
- 6" Metal Studs at 16" O.C.
- R-21 Batt Insulation
- 5/8" Type X Gypsum Wallboard (interior)
- Fire Rating: 1 Hour
`;

    console.log("📤 Sending test data to AI...");
    console.log("Test spec length:", testWallSpec.length, "characters");

    const result = await parseWallSpecPDF(testWallSpec);

    console.log("✅ AI Response received!");
    console.log("Wall types found:", result.totalWallTypes);
    console.log("Processing time:", result.processingTime, "ms");

    return NextResponse.json({
      success: true,
      message: "Test successful! AI is working correctly.",
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Test failed:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Test failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
