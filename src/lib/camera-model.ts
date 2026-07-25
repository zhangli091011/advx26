export type CameraSourceConfig = { id: string; label: string };

export type MediaMtxPath = {
  name?: unknown;
  ready?: unknown;
  readers?: unknown;
  bytesReceived?: unknown;
  tracks?: unknown;
};

export function parseCameraSources(value: string | undefined): CameraSourceConfig[] {
  if (!value?.trim()) return [{ id: "dabai", label: "Dabai DC" }];
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("PIT_CAMERA_SOURCES_JSON 必须是有效 JSON"); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 4) throw new Error("RTMP 相机源必须配置 1 至 4 路");
  const ids = new Set<string>();
  return parsed.map((item, index) => {
    if (!isRecord(item)) throw new Error(`RTMP 相机源 #${index + 1} 无效`);
    const id = text(item.id, 32);
    const label = text(item.label, 60);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(id)) throw new Error(`RTMP 相机源 #${index + 1} ID 无效`);
    if (!label) throw new Error(`RTMP 相机源 #${index + 1} 缺少名称`);
    if (ids.has(id)) throw new Error(`RTMP 相机源重复：${id}`);
    ids.add(id);
    return { id, label };
  });
}

export function projectMediaMtxSources(configs: CameraSourceConfig[], paths: unknown, now = Date.now()) {
  const items = isRecord(paths) && Array.isArray(paths.items) ? paths.items : [];
  const byName = new Map(items.filter(isRecord).map((item) => [text(item.name, 32), item]));
  return configs.map((config) => {
    const path = byName.get(config.id);
    const readers = path && Array.isArray(path.readers) ? path.readers.length : 0;
    const tracks = path && Array.isArray(path.tracks) ? path.tracks.filter((track) => typeof track === "string").slice(0, 8) : [];
    return {
      ...config,
      online: path?.ready === true,
      readers,
      bytesReceived: safeInteger(path?.bytesReceived),
      tracks,
      updatedAt: now,
    };
  });
}

function safeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
