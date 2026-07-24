export type MiotPropertyRef = {
  siid: number;
  piid: number;
  scale: number;
};

export type MiotOutletConfig = {
  id: string;
  name: string;
  zone: string;
  model?: string;
  ip?: string;
  token?: string;
  did?: string;
  nominalVolts: number;
  power: MiotPropertyRef;
  watts?: MiotPropertyRef;
  volts?: MiotPropertyRef;
  amps?: MiotPropertyRef;
};

export function parseMiotOutletConfigs(raw: string | undefined): MiotOutletConfig[] {
  if (!raw?.trim()) return [];

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("MIOT_OUTLETS_JSON 不是有效 JSON");
  }
  if (!Array.isArray(value)) throw new Error("MIOT_OUTLETS_JSON 必须是数组");

  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`米家插座配置 #${index + 1} 必须是对象`);
    const id = requiredText(item.id, `米家插座配置 #${index + 1} 缺少 id`);
    if (!/^CH[1-8]$/.test(id)) throw new Error(`${id} 不是有效通道，必须为 CH1-CH8`);
    if (ids.has(id)) throw new Error(`米家插座通道重复：${id}`);
    ids.add(id);

    const ip = optionalText(item.ip);
    const token = optionalText(item.token);
    const did = optionalText(item.did);
    if ((ip && !token) || (!ip && token)) throw new Error(`${id} 的 ip 和 token 必须同时配置`);
    if (token && !/^[a-fA-F0-9]{32}$/.test(token)) throw new Error(`${id} 的 token 必须是 32 位十六进制`);
    if (!ip && !did) throw new Error(`${id} 至少需要局域网 ip/token 或云端 did`);

    return {
      id,
      name: optionalText(item.name) ?? `米家智能插座 3 ${id}`,
      zone: optionalText(item.zone) ?? "米家",
      model: optionalText(item.model),
      ip,
      token: token?.toLowerCase(),
      did,
      nominalVolts: finitePositive(item.nominalVolts) ?? 220,
      power: propertyRef(item.power, `${id}.power`, { siid: 2, piid: 1, scale: 1 }),
      watts: optionalPropertyRef(item.watts, `${id}.watts`),
      volts: optionalPropertyRef(item.volts, `${id}.volts`),
      amps: optionalPropertyRef(item.amps, `${id}.amps`),
    };
  });
}

function propertyRef(value: unknown, path: string, fallback?: MiotPropertyRef): MiotPropertyRef {
  if (value == null && fallback) return fallback;
  if (!isRecord(value)) throw new Error(`${path} 必须是属性映射对象`);
  const siid = positiveInteger(value.siid);
  const piid = positiveInteger(value.piid);
  if (!siid || !piid) throw new Error(`${path} 缺少有效的 siid/piid`);
  return { siid, piid, scale: finitePositive(value.scale) ?? 1 };
}

function optionalPropertyRef(value: unknown, path: string) {
  return value == null ? undefined : propertyRef(value, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, message: string) {
  const text = optionalText(value);
  if (!text) throw new Error(message);
  return text;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function finitePositive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
