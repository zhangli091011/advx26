import { getPitHub } from "@/lib/pit-hub";
import { seedPitStateIfEmpty } from "@/lib/pit-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE 实时推送：树莓派收到 MQTT 更新即推给面板 */
export async function GET() {
  const hub = getPitHub();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const state = seedPitStateIfEmpty();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
      };
      send(); // 立即推一帧
      const onUpdate = () => send();
      hub.on("update", onUpdate);
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          /* closed */
        }
      }, 15000);
      // 客户端断开时清理
      return () => {
        hub.off("update", onUpdate);
        clearInterval(keepalive);
      };
    },
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
