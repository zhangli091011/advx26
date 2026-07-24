export type MiotPropertyInput = {
  siid: number;
  piid: number;
  scale: number;
};

export type MiotOutletInput = {
  id: string;
  name: string;
  zone: string;
  model: string;
  ip: string;
  token: string;
  tokenConfigured: boolean;
  clearToken?: boolean;
  did: string;
  nominalVolts: number;
  power: MiotPropertyInput;
  watts: MiotPropertyInput | null;
  volts: MiotPropertyInput | null;
  amps: MiotPropertyInput | null;
};

export type PitConfigView = {
  configPath: string;
  restartRequired: boolean;
  mqtt: {
    url: string;
    username: string;
    password: string;
    passwordConfigured: boolean;
    clearPassword?: boolean;
  };
  miot: {
    pollIntervalMs: number;
    debug: boolean;
    cloud: {
      region: string;
      username: string;
      password: string;
      passwordConfigured: boolean;
      clearPassword?: boolean;
      session: string;
      sessionConfigured: boolean;
      clearSession?: boolean;
      brokerUrl: string;
    };
    outlets: MiotOutletInput[];
  };
};

export type PitConfigTestResult = {
  ok: boolean;
  target: string;
  transport?: "local" | "cloud";
  latencyMs: number;
  message: string;
};

export type DiscoveredMiotDevice = {
  did: string;
  name: string;
  model: string;
  ip: string;
  online: boolean;
  localAvailable: boolean;
  mappingKnown: boolean;
};
