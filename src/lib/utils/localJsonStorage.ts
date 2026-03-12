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
  | "material_match";

const OUTPUT_BASE = path.join(process.cwd(), "data", "output");

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
