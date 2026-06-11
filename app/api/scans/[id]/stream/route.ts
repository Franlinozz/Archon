import IORedis from "ioredis";
import { z } from "zod";
import { scanChannel } from "@/lib/scan/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return new Response("Invalid scan id", { status: 400 });

  const encoder = new TextEncoder();
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const subscriber = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const channel = scanChannel(params.data.id);
  let closed = false;
  let heartbeat: NodeJS.Timeout | undefined;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    await subscriber.unsubscribe(channel).catch(() => undefined);
    subscriber.disconnect();
  };

  const close = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    await cleanup();
    try { controller.close(); } catch { /* stream was already closed by the client/runtime */ }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          void close(controller);
        }
      };
      send(`: connected ${new Date().toISOString()}\n\n`);
      await subscriber.subscribe(channel);

      subscriber.on("message", (_channel, message) => {
        send(`event: scan\n`);
        send(`data: ${message}\n\n`);
      });

      heartbeat = setInterval(() => {
        send(`: heartbeat ${new Date().toISOString()}\n\n`);
      }, 15_000);

      _request.signal.addEventListener("abort", () => void close(controller));
    },
    async cancel() {
      await cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
