export type HomeAssistantOutletInput = {
  id: string;
  name: string;
  zone: string;
  switchEntityId: string;
  wattsEntityId: string;
  voltsEntityId: string;
  ampsEntityId: string;
};

export type PitConfigView = {
  configPath: string;
  restartRequired: boolean;
  team: {
    number: number;
    name: string;
  };
  gateway: {
    url: string;
    clientId: string;
    token: string;
    tokenConfigured: boolean;
    clearToken?: boolean;
  };
  homeAssistant: {
    baseUrl: string;
    accessToken: string;
    accessTokenConfigured: boolean;
    clearAccessToken?: boolean;
    pollIntervalMs: number;
    migrationRequired: boolean;
    outlets: HomeAssistantOutletInput[];
  };
};

export type PitConfigTestResult = {
  ok: boolean;
  target: string;
  transport?: "rest" | "websocket";
  version?: string;
  latencyMs: number;
  message: string;
};

export type DiscoveredHomeAssistantOutlet = {
  entityId: string;
  name: string;
  available: boolean;
  wattsEntityId: string;
  voltsEntityId: string;
  ampsEntityId: string;
  areaId: string;
  areaName: string;
  deviceName: string;
  manufacturer: string;
  model: string;
  platform: string;
};

export type DiscoveredHomeAssistantArea = { areaId: string; name: string };
