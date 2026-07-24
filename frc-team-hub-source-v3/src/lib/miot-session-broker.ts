import "server-only";

import type { StoredPitConfig } from "@/lib/pit-config-model";

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
  const response = await fetch(`${cloud.brokerUrl}/v1/session`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Session Broker 返回 HTTP ${response.status}`);
  const body = await response.json() as { session?: unknown };
  if (!isSession(body.session)) throw new Error("Session Broker 返回的数据无效");
  return body.session;
}

function isSession(value: unknown): value is CloudSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Record<string, unknown>;
  return typeof session.ssecurity === "string"
    && typeof session.userId === "string"
    && typeof session.serviceToken === "string";
}
