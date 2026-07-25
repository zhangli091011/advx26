import WebSocket from "ws";
import {
  createConnection,
  createLongLivedTokenAuth,
  type Connection,
} from "home-assistant-js-websocket";

type HomeAssistantConnectionConfig = {
  baseUrl: string;
  accessToken: string;
};

export async function createHomeAssistantConnection(
  config: HomeAssistantConnectionConfig,
): Promise<Connection> {
  ensureNodeWebSocket();
  const auth = createLongLivedTokenAuth(config.baseUrl, config.accessToken);
  return withTimeout(
    createConnection({ auth, setupRetry: 0 }),
    8_000,
    "Home Assistant 连接超时",
  );
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function ensureNodeWebSocket() {
  Object.assign(globalThis, { WebSocket });
}
