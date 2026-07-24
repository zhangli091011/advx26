export type PitControlCommand =
  | { action: "power"; target: string; on: boolean }
  | { action: "locate"; target: string }
  | { action: "locate-unit"; target: string };

export type PitControlInventory = {
  channels: string[];
  locations: string[];
  units: string[];
};

export function parsePitControl(
  body: unknown,
  inventory: PitControlInventory,
): { command: PitControlCommand } | { error: string } {
  if (!isRecord(body)) return { error: "请求格式错误" };

  const { action, target } = body;
  if (typeof action !== "string" || typeof target !== "string") {
    return { error: "缺少有效的 action 或 target" };
  }

  if (action === "power") {
    if (!/^CH[1-8]$/.test(target) || !inventory.channels.includes(target)) {
      return { error: "无效的电源通道" };
    }
    if (typeof body.on !== "boolean") return { error: "电源状态必须是布尔值" };
    return { command: { action, target, on: body.on } };
  }

  if (action === "locate") {
    if (!isSafeTarget(target) || !inventory.locations.includes(target)) {
      return { error: "无效的工具或格位" };
    }
    return { command: { action, target } };
  }

  if (action === "locate-unit") {
    if (!/^U(?:[1-9]|1[0-6])$/.test(target) || !inventory.units.includes(target)) {
      return { error: "无效的储物单元" };
    }
    return { command: { action, target } };
  }

  return { error: "未知指令" };
}

export function isRecentlySeen(timestamp: number | null, now = Date.now()) {
  return timestamp !== null && now - timestamp >= 0 && now - timestamp < 15_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeTarget(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}
