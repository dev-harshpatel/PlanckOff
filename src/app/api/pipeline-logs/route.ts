/**
 * API Route: GET /api/pipeline-logs?runId=<id>
 *
 * Server-Sent Events (SSE) stream of log messages for a pipeline run.
 * The browser connects here and receives log lines in real time as the
 * extract → match → finalize steps progress.
 *
 * Auth: required (session cookie — EventSource sends cookies automatically).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-helpers";
import { getRunLogs } from "@/lib/utils/pipelineLogger";

// Required so Next.js doesn't try to statically render this route
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req: NextRequest) => {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let messageIndex = 0;
  let intervalId: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Client already disconnected — ignore
        }
      };

      // Flush any messages already logged before the client connected
      // (handles the race where the run starts before the EventSource opens)
      const existing = getRunLogs(runId, 0);
      for (const entry of existing) {
        send({ type: "log", message: entry.message, level: entry.level });
      }
      messageIndex = existing.length;

      // Poll every 300 ms for new messages
      intervalId = setInterval(() => {
        const newEntries = getRunLogs(runId, messageIndex);
        for (const entry of newEntries) {
          send({ type: "log", message: entry.message, level: entry.level });
          messageIndex++;
        }
      }, 300);
    },
    cancel() {
      // Client closed the connection — stop polling
      clearInterval(intervalId);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      // Disable nginx / Vercel edge buffering so events arrive immediately
      "X-Accel-Buffering": "no",
    },
  });
});
