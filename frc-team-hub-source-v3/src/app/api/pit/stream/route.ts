import { getPitHub } from "@/lib/pit-hub";
import { getPitState } from "@/lib/pit-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE 实时推送：树莓派收到 MQTT 更新即推给面板 */
export async function GET(request: Request) {
  const hub = getPitHub();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(getPitState())}\n\n`));
        } catch {
          cleanup();
        }
      };
      send();
      const onUpdate = () => send();
      hub.on("update", onUpdate);
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        hub.off("update", onUpdate);
        clearInterval(keepalive);
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel: () => cleanup(),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
