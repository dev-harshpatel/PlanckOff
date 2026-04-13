/**
 * In-process log store for pipeline run messages.
 * Entries are keyed by runId and streamed to the browser via GET /api/pipeline-logs.
 *
 * Module-level singleton — safe for single Node.js process (dev + single-instance Vercel).
 * On multi-instance deployments, switch this to a Redis pub/sub channel.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  index: number;
  message: string;
  level: LogLevel;
  ts: number;
}

const logStore = new Map<string, LogEntry[]>();

/** Auto-clean after 10 minutes so long-running servers don't leak memory. */
const CLEANUP_DELAY_MS = 10 * 60 * 1000;

/**
 * Append a log message for a pipeline run.
 * Also writes to the server console so the terminal output is unchanged.
 */
export function appendRunLog(
  runId: string,
  message: string,
  level: LogLevel = "info",
): void {
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.log(message);

  if (!logStore.has(runId)) logStore.set(runId, []);
  const entries = logStore.get(runId)!;
  entries.push({ index: entries.length, message, level, ts: Date.now() });
}

/**
 * Return log entries from `fromIndex` onward (non-destructive).
 */
export function getRunLogs(runId: string, fromIndex = 0): LogEntry[] {
  return (logStore.get(runId) ?? []).slice(fromIndex);
}

/**
 * Call when a run ends (success or error).
 * Schedules automatic cleanup so the store stays bounded.
 */
export function markRunComplete(runId: string): void {
  setTimeout(() => {
    logStore.delete(runId);
  }, CLEANUP_DELAY_MS);
}
