import WebSocket from "ws";
import { createConnection, createLongLivedTokenAuth, type Connection } from "home-assistant-js-websocket";

type HomeAssistantConnectionConfig = { baseUrl: string; accessToken: string };

export async function createHomeAssistantConnection(config: HomeAssistantConnectionConfig): Promise<Connection> {
  if (!config.baseUrl || !config.accessToken) throw new Error("请先配置 Home Assistant URL 和长期访问令牌");
  Object.assign(globalThis, { WebSocket });
  const auth = createLongLivedTokenAuth(config.baseUrl, config.accessToken);
  try {
    return await withTimeout(createConnection({ auth, setupRetry: 0 }), 8_000, "Home Assistant 连接超时");
  } catch (error) {
    if (error === 1 || error === 2) throw new Error("Home Assistant 访问令牌无效或权限不足");
    throw error;
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
