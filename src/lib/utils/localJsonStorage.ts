/**
 * Local JSON storage for pipeline outputs
 * Persists extraction, material match, and final JSON to data/output/
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";

export type JsonOutputFolder = "assembly" | "takeoff" | "final_output" | "material_match";

const OUTPUT_BASE = path.join(process.cwd(), "data", "output");

/**
 * Write JSON data to local output folder with timestamp filename
 */
export const writeJsonToLocal = async (
  folder: JsonOutputFolder,
  data: unknown,
): Promise<string> => {
  const dir = path.join(OUTPUT_BASE, folder);
  await mkdir(dir, { recursive: true });

  const timestamp = Date.now();
  const filename = `${folder}-${timestamp}.json`;
  const filePath = path.join(dir, filename);

  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
};
