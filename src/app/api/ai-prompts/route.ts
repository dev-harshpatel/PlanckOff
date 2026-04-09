import { NextRequest, NextResponse } from "next/server";
import {
  AI_PROMPT_KEYS,
  getResolvedAIPrompts,
  upsertAIPrompt,
} from "@/lib/db/aiPrompts";
import { withAuth } from "@/lib/auth/api-helpers";

export const GET = withAuth(async () => {
  try {
    const prompts = await getResolvedAIPrompts();

    return NextResponse.json({
      success: true,
      ...prompts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI prompts";
    console.error("[ai-prompts] GET error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const PUT = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();
    const updates: Promise<unknown>[] = [];

    if (typeof body.pdfExtractionPrompt === "string") {
      updates.push(
        upsertAIPrompt(
          AI_PROMPT_KEYS.PDF_EXTRACTION,
          body.pdfExtractionPrompt,
          user.id,
        ),
      );
    }

    if (typeof body.materialMatchPrompt === "string") {
      updates.push(
        upsertAIPrompt(
          AI_PROMPT_KEYS.MATERIAL_MATCH,
          body.materialMatchPrompt,
          user.id,
        ),
      );
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: "No prompt updates provided" },
        { status: 400 },
      );
    }

    await Promise.all(updates);
    const prompts = await getResolvedAIPrompts();

    return NextResponse.json({
      success: true,
      ...prompts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save AI prompts";
    console.error("[ai-prompts] PUT error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
