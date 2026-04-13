import { readFile } from "fs/promises";
import path from "path";
import { supabaseAdmin } from "@/lib/supabase/server";

export const AI_PROMPT_KEYS = {
  PDF_EXTRACTION:           "pdf_extraction",
  MATERIAL_MATCH:           "material_match",   // kept — legacy mode still uses it
  EXTRACT_SKELETON:         "extract_skeleton",
  EXTRACT_GYPSUM:           "extract_gypsum",
  EXTRACT_STEEL_FRAMING:    "extract_steel_framing",
  EXTRACT_INSULATION:       "extract_insulation",
  EXTRACT_MOISTURE_CONTROL: "extract_moisture_control",
  EXTRACT_WOOD_SUBSTRATES:  "extract_wood_substrates",
  EXTRACT_SPECIALTY:        "extract_specialty",
} as const;

export type AIPromptKey = (typeof AI_PROMPT_KEYS)[keyof typeof AI_PROMPT_KEYS];

export interface AIPromptRecord {
  id: string;
  prompt_key: AIPromptKey;
  prompt_text: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const PROMPT_FILE_BY_KEY: Record<AIPromptKey, string> = {
  [AI_PROMPT_KEYS.PDF_EXTRACTION]:           path.join(process.cwd(), "prompt", "extractAssemblies.txt"),
  [AI_PROMPT_KEYS.MATERIAL_MATCH]:           path.join(process.cwd(), "prompt", "matchMaterials.txt"),
  [AI_PROMPT_KEYS.EXTRACT_SKELETON]:         path.join(process.cwd(), "prompt", "extract_skeleton.txt"),
  [AI_PROMPT_KEYS.EXTRACT_GYPSUM]:           path.join(process.cwd(), "prompt", "extract_gypsum.txt"),
  [AI_PROMPT_KEYS.EXTRACT_STEEL_FRAMING]:    path.join(process.cwd(), "prompt", "extract_steel_framing.txt"),
  [AI_PROMPT_KEYS.EXTRACT_INSULATION]:       path.join(process.cwd(), "prompt", "extract_insulation.txt"),
  [AI_PROMPT_KEYS.EXTRACT_MOISTURE_CONTROL]: path.join(process.cwd(), "prompt", "extract_moisture_control.txt"),
  [AI_PROMPT_KEYS.EXTRACT_WOOD_SUBSTRATES]:  path.join(process.cwd(), "prompt", "extract_wood_substrates.txt"),
  [AI_PROMPT_KEYS.EXTRACT_SPECIALTY]:        path.join(process.cwd(), "prompt", "extract_specialty.txt"),
};

async function readDefaultPromptFile(promptKey: AIPromptKey) {
  return readFile(PROMPT_FILE_BY_KEY[promptKey], "utf-8");
}

export async function getAIPromptByKey(promptKey: AIPromptKey) {
  const { data, error } = await supabaseAdmin
    .from("ai_prompts")
    .select("*")
    .eq("prompt_key", promptKey)
    .maybeSingle();

  if (error) {
    console.error("[aiPrompts] getAIPromptByKey error:", error.code, error.message);
    throw error;
  }

  return (data ?? null) as AIPromptRecord | null;
}

export async function getAllAIPrompts() {
  const { data, error } = await supabaseAdmin
    .from("ai_prompts")
    .select("*")
    .in("prompt_key", Object.values(AI_PROMPT_KEYS))
    .order("prompt_key", { ascending: true });

  if (error) {
    console.error("[aiPrompts] getAllAIPrompts error:", error.code, error.message);
    throw error;
  }

  return (data ?? []) as AIPromptRecord[];
}

export async function upsertAIPrompt(
  promptKey: AIPromptKey,
  promptText: string,
  updatedBy?: string,
) {
  const { data, error } = await supabaseAdmin
    .from("ai_prompts")
    .upsert(
      {
        prompt_key: promptKey,
        prompt_text: promptText,
        updated_by: updatedBy ?? null,
      },
      { onConflict: "prompt_key" },
    )
    .select("*")
    .single();

  if (error) {
    console.error("[aiPrompts] upsertAIPrompt error:", error.code, error.message);
    throw error;
  }

  return data as AIPromptRecord;
}

export async function getResolvedAIPrompt(promptKey: AIPromptKey) {
  try {
    const existing = await getAIPromptByKey(promptKey);
    if (existing?.prompt_text != null) {
      return existing.prompt_text;
    }
  } catch (error) {
    console.warn(`[aiPrompts] Falling back to file for ${promptKey}:`, error);
    return readDefaultPromptFile(promptKey);
  }

  const defaultPrompt = await readDefaultPromptFile(promptKey);

  try {
    await upsertAIPrompt(promptKey, defaultPrompt);
  } catch (error) {
    console.warn(`[aiPrompts] Failed to backfill ${promptKey} from file:`, error);
  }

  return defaultPrompt;
}

export async function getResolvedAIPrompts() {
  const [pdfExtractionPrompt, materialMatchPrompt] = await Promise.all([
    getResolvedAIPrompt(AI_PROMPT_KEYS.PDF_EXTRACTION),
    getResolvedAIPrompt(AI_PROMPT_KEYS.MATERIAL_MATCH),
  ]);

  return {
    pdfExtractionPrompt,
    materialMatchPrompt,
  };
}
