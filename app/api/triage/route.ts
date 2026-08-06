import { NextRequest } from "next/server";
import { runPipeline, PipelineAbortedError, type PipelineEvent } from "@/lib/pipeline";

export const runtime = "nodejs";

type SseEvent = PipelineEvent | { type: "error"; message: string };

function sseEncode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const request_text = (body as { request_text?: unknown })?.request_text;
  if (typeof request_text !== "string" || request_text.trim().length === 0) {
    return new Response(JSON.stringify({ error: "request_text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const onEvent = (event: PipelineEvent) => {
        controller.enqueue(sseEncode(event));
      };

      try {
        // The pipeline itself emits a well-formed "error" event and throws
        // PipelineAbortedError when a step fails validation twice — never
        // crash the server. Anything else is an unexpected failure we still
        // want to surface cleanly to the client instead of dropping the
        // connection silently.
        await runPipeline(request_text, { onEvent });
      } catch (err) {
        if (!(err instanceof PipelineAbortedError)) {
          controller.enqueue(
            sseEncode({
              type: "error",
              message: err instanceof Error ? err.message : String(err),
            })
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
