import { apiError, apiSuccess, isSameOrigin } from "@/lib/api";
import { isRecentlySeen, parsePitControl } from "@/lib/pit-control";
import { getPitHub } from "@/lib/pit-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return apiSuccess(getPitHub().state);
}

/** 下行控制：电源开关 / 指示灯寻物 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("禁止跨站控制请求", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求格式错误", 400);
  }
  const hub = getPitHub();
  const parsed = parsePitControl(body, {
    channels: hub.state.channels.map((channel) => channel.id),
    locations: [
      ...hub.state.tools.map((tool) => tool.slot),
      ...hub.state.compartments.map((compartment) => compartment.id),
    ],
    units: hub.state.units.map((unit) => unit.u),
  });
  if ("error" in parsed) return apiError(parsed.error, 400);

  const { action, target } = parsed.command;
  let sent = false;
  if (action === "power") {
    if (hub.hasMiotChannel(target)) {
      try {
        const transport = await hub.setMiotPower(target, parsed.command.on);
        return apiSuccess({ sent: true, transport });
      } catch (error) {
        return apiError(error instanceof Error ? error.message : "米家插座控制失败", 503);
      }
    }
    if (!hub.state.connection.brokerConnected) {
      return apiError("MQTT Broker 未连接，指令未发送", 503);
    }
    if (!isRecentlySeen(hub.state.connection.deviceLastSeen.power)) {
      return apiError("电源分控离线或数据已过期，禁止远程控制", 503);
    }
    sent = await hub.publishControl(`power/${target}`, { on: parsed.command.on });
  } else if (action === "locate") {
    if (!hub.state.connection.brokerConnected) {
      return apiError("MQTT Broker 未连接，指令未发送", 503);
    }
    if (!isRecentlySeen(hub.state.connection.deviceLastSeen.cabinet)) {
      return apiError("储物柜分控离线或数据已过期，指令未发送", 503);
    }
    sent = await hub.publishControl(`locate/${target}`, { blink: true });
  } else if (action === "locate-unit") {
    if (!hub.state.connection.brokerConnected) {
      return apiError("MQTT Broker 未连接，指令未发送", 503);
    }
    if (!isRecentlySeen(hub.state.connection.deviceLastSeen.cabinet)) {
      return apiError("储物柜分控离线或数据已过期，指令未发送", 503);
    }
    sent = await hub.publishControl(`locate-unit/${target}`, { blink: true });
  }

  return sent ? apiSuccess({ sent: true }) : apiError("MQTT 指令发送失败", 503);
}
