import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StoredPitConfig } from "@/lib/pit-config-model";

const execFileAsync = promisify(execFile);

type CloudSession = {
  ssecurity: string;
  userId: string;
  serviceToken: string;
  agentId?: string;
  clientId?: string;
  timestamp?: number;
  loginMethod?: string;
};

export async function fetchBrokerSession(cloud: StoredPitConfig["miot"]["cloud"]): Promise<CloudSession | null> {
  if (!cloud.brokerUrl) return null;
  const apiKey = cloud.brokerKey || await fetchBrokerKeyOverSsh(cloud.brokerSshHost);
  if (!apiKey) return null;
  const response = await brokerFetch(cloud, apiKey, "/v1/session");
  if (!response.ok) throw new Error(`Session Broker 返回 HTTP ${response.status}`);
  const body = await response.json() as { session?: unknown };
  if (!isSession(body.session)) throw new Error("Session Broker 返回的数据无效");
  return body.session;
}

function brokerFetch(
  cloud: StoredPitConfig["miot"]["cloud"],
  apiKey: string,
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${cloud.brokerUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(10_000),
  });
}

async function fetchBrokerKeyOverSsh(host: string) {
  if (!host) return "";
  if (!/^[A-Za-z0-9_.@:[\]-]+$/.test(host)) throw new Error("Session Broker SSH 主机格式无效");
  try {
    const { stdout } = await execFileAsync("ssh", [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      host,
      "cat /etc/pit-session-broker.device-key",
    ], { timeout: 12_000, windowsHide: true });
    const key = stdout.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) throw new Error("服务器返回的设备密钥格式无效");
    return key;
  } catch (error) {
    throw new Error(`无法通过 SSH 获取 Session Broker 密钥：${error instanceof Error ? error.message : String(error)}`);
  }
}

function isSession(value: unknown): value is CloudSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Record<string, unknown>;
  return typeof session.ssecurity === "string"
    && typeof session.userId === "string"
    && typeof session.serviceToken === "string";
}
