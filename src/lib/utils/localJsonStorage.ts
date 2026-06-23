/**
 * Local JSON storage for pipeline outputs.
 *
 * This is safe for local development (Node filesystem). On Vercel, the FS is
 * effectively read-only, so callers should treat failures here as non-fatal.
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";

export type JsonOutputFolder =
  | "assembly"
  | "takeoff"
  | "final_output"
  | "material_match"
  | "debug";

/**
 * Sub-folders inside data/debug/ — one per pipeline step.
 * Each step writes into data/debug/{type}/{projectId}/ so files are
 * grouped by project and easy to compare across runs.
 */
export type DebugFolder = "extract" | "match" | "final";

const OUTPUT_BASE = path.join(process.cwd(), "data", "output");
const DEBUG_BASE  = path.join(process.cwd(), "data", "debug");

/** Write to the legacy data/output/{folder}/ path (non-debug pipeline outputs). */
export const writeJsonToLocal = async (
  folder: JsonOutputFolder,
  data: unknown,
  filename?: string,
): Promise<string> => {
  try {
    const dir = path.join(OUTPUT_BASE, folder);
    await mkdir(dir, { recursive: true });
    const resolvedFilename = filename ?? `${folder}-${Date.now()}.json`;
    const filePath = path.join(dir, resolvedFilename);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    return filePath;
  } catch (error) {
    console.warn(
      "[localJsonStorage] Failed to write JSON locally. This is non-fatal (DB still has data).",
      error,
    );
    return "";
  }
};

/**
 * Write a debug file to data/debug/{type}/{projectId}/{filename}.
 *
 * Directory structure:
 *   data/debug/extract/{projectId}/  ← AI PDF extraction output
 *   data/debug/match/{projectId}/    ← Rule-based match scoring debug
 *   data/debug/final/{projectId}/    ← Final merged output for review
 *
 * The entire data/ directory is gitignored — these files never get pushed.
 */
export const writeDebugJson = async (
  type: DebugFolder,
  projectId: string,
  filename: string,
  data: unknown,
): Promise<string> => {
  try {
    const safeProjectId = String(projectId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    const dir = path.join(DEBUG_BASE, type, safeProjectId);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    return filePath;
  } catch (error) {
    console.warn(
      `[localJsonStorage] Failed to write debug file (${type}/${projectId}/${filename}). Non-fatal.`,
      error,
    );
    return "";
  }
};
