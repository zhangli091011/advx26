export type HomeAssistantOutletConfig = {
  id: string;
  name: string;
  zone: string;
  switchEntityId: string;
  wattsEntityId?: string;
  voltsEntityId?: string;
  ampsEntityId?: string;
};

export function parseHomeAssistantOutlets(value: unknown): HomeAssistantOutletConfig[] {
  if (!Array.isArray(value)) return [];
  const channels = new Set<string>();
  const switches = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Home Assistant 插座 #${index + 1} 无效`);
    const id = text(item.id);
    if (!/^CH[1-8]$/.test(id)) throw new Error(`Home Assistant 插座 #${index + 1} 的通道必须为 CH1-CH8`);
    if (channels.has(id)) throw new Error(`Home Assistant 通道重复：${id}`);
    channels.add(id);
    const switchEntityId = entityId(item.switchEntityId, "switch", true);
    if (switchEntityId && switches.has(switchEntityId)) throw new Error(`Home Assistant 开关实体重复：${switchEntityId}`);
    if (switchEntityId) switches.add(switchEntityId);
    return {
      id,
      name: text(item.name) || `Home Assistant 插座 ${id}`,
      zone: text(item.zone) || "Home Assistant",
      switchEntityId,
      wattsEntityId: entityId(item.wattsEntityId, "sensor", true) || undefined,
      voltsEntityId: entityId(item.voltsEntityId, "sensor", true) || undefined,
      ampsEntityId: entityId(item.ampsEntityId, "sensor", true) || undefined,
    };
  });
}

export function validateHomeAssistantUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("Home Assistant URL 必须是有效的 HTTP 或 HTTPS 地址");
  }
}

function entityId(value: unknown, domain: string, optional: boolean) {
  const result = text(value).toLowerCase();
  if (!result && optional) return "";
  if (!new RegExp(`^${domain}\\.[a-z0-9_]+$`).test(result)) throw new Error(`实体必须是有效的 ${domain}.* entity_id`);
  return result;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
