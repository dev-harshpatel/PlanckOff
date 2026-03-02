/**
 * Local JSON storage for pipeline outputs
 * DISABLED — Vercel's filesystem is read-only; all writes go to the database instead.
 * Re-enable locally by uncommenting the body below.
 */

// import { mkdir, writeFile } from "fs/promises";
// import path from "path";

export type JsonOutputFolder = "assembly" | "takeoff" | "final_output" | "material_match";

// const OUTPUT_BASE = path.join(process.cwd(), "data", "output");

/**
 * No-op in production. Uncomment the body below for local development only.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const writeJsonToLocal = async (
  _folder: JsonOutputFolder,
  _data: unknown,
): Promise<string> => {
  // Disabled — local FS writes break on Vercel. Data is saved to DB instead.
  return "";
  // ── Local-only implementation ──────────────────────────────────────────
  // const dir = path.join(OUTPUT_BASE, _folder);
  // await mkdir(dir, { recursive: true });
  // const timestamp = Date.now();
  // const filename = `${_folder}-${timestamp}.json`;
  // const filePath = path.join(dir, filename);
  // await writeFile(filePath, JSON.stringify(_data, null, 2), "utf-8");
  // return filePath;
};
