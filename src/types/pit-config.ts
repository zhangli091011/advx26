import type {
  HomeAssistantBinding,
  HomeAssistantMode,
  PitChannelId,
} from "@/lib/pit-config-model";

export type LegacyChannelHint = {
  channelId: PitChannelId;
  name: string;
  zone: string;
};

export type LocalNetworkView = {
  hostname: string;
  preferredIpv4: string;
  ipv4Addresses: {
    address: string;
    interfaceName: string;
  }[];
};

export type PitConfigView = {
  version: 2;
  configPath: string;
  restartRequired: boolean;
  migrationRequired: boolean;
  legacyChannels: LegacyChannelHint[];
  localNetwork: LocalNetworkView;
  mqtt: {
    url: string;
    username: string;
    password: string;
    passwordConfigured: boolean;
    clearPassword?: boolean;
  };
  homeAssistant: {
    baseUrl: string;
    accessToken: string;
    accessTokenConfigured: boolean;
    tokenManagedByEnvironment: boolean;
    clearAccessToken?: boolean;
    mode: HomeAssistantMode;
    defaultAreaId: string;
    bindings: HomeAssistantBinding[];
  };
};

export type PitConfigTestResult = {
  ok: boolean;
  target: string;
  transport?: "mqtt" | "websocket";
  latencyMs: number;
  version?: string;
  message: string;
};

export type DiscoveredHomeAssistantArea = {
  areaId: string;
  name: string;
};

export type DiscoveredHomeAssistantDevice = {
  deviceId: string;
  name: string;
  areaId: string;
  manufacturer: string;
  model: string;
};

export type DiscoveredHomeAssistantEntity = {
  entityId: string;
  name: string;
  domain: string;
  platform: string;
  areaId: string;
  deviceId: string;
  state: string;
  unit: string;
  deviceClass: string;
  services: string[];
  available: boolean;
  controllable: boolean;
};

export type HomeAssistantDiscoveryView = {
  version: string;
  defaultAreaId: string;
  areas: DiscoveredHomeAssistantArea[];
  devices: DiscoveredHomeAssistantDevice[];
  entities: DiscoveredHomeAssistantEntity[];
};
