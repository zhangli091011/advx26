import "server-only";

export type HomeAssistantState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated?: string;
};

export class HomeAssistantClient {
  constructor(private readonly baseUrl: string, private readonly accessToken: string) {}

  async getStates(): Promise<HomeAssistantState[]> {
    const response = await this.request("/api/states");
    const value: unknown = await response.json();
    if (!Array.isArray(value)) throw new Error("Home Assistant 状态响应无效");
    return value.filter(isState);
  }

  async callSwitch(entityId: string, on: boolean) {
    await this.request(`/api/services/switch/${on ? "turn_on" : "turn_off"}`, {
      method: "POST",
      body: JSON.stringify({ entity_id: entityId }),
    });
  }

  private async request(path: string, init: RequestInit = {}) {
    if (!this.baseUrl || !this.accessToken) throw new Error("请先配置 Home Assistant URL 和长期访问令牌");
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) throw new Error("Home Assistant 访问令牌无效或权限不足");
    if (!response.ok) throw new Error(`Home Assistant 返回 HTTP ${response.status}`);
    return response;
  }
}

function isState(value: unknown): value is HomeAssistantState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return typeof state.entity_id === "string"
    && typeof state.state === "string"
    && typeof state.attributes === "object"
    && state.attributes !== null
    && !Array.isArray(state.attributes);
}
