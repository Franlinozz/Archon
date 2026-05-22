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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      send(`: connected ${new Date().toISOString()}\n\n`);
      await subscriber.subscribe(channel);

      subscriber.on("message", (_channel, message) => {
        send(`event: scan\n`);
        send(`data: ${message}\n\n`);
      });

      const heartbeat = setInterval(() => {
        send(`: heartbeat ${new Date().toISOString()}\n\n`);
      }, 15_000);

      _request.signal.addEventListener("abort", async () => {
        clearInterval(heartbeat);
        await subscriber.unsubscribe(channel).catch(() => undefined);
        subscriber.disconnect();
        controller.close();
      });
    },
    async cancel() {
      await subscriber.unsubscribe(channel).catch(() => undefined);
      subscriber.disconnect();
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
