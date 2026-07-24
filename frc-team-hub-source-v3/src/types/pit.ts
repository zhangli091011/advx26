export type ToolState = "in" | "out" | "lost";

export interface PitTool {
  slot: string;
  name: string;
  unit: string;
  state: ToolState;
  who?: string;
  time?: string;
  qr?: string;
}

export type ToolOperation = "checkout" | "return";

export interface ToolSession {
  id: string;
  operation: ToolOperation;
  createdAt: number;
  expiresAt: number;
}

export interface ToolTransaction {
  id: string;
  slot: string;
  name: string;
  operation: ToolOperation;
  createdAt: number;
}

export interface ToolStationState {
  activeSession: ToolSession | null;
  checkoutCount: number;
  returnCount: number;
  desiredRevision: number;
  appliedRevision: number | null;
  recentTransactions: ToolTransaction[];
}

export interface RackUnit {
  u: string;
  name: string;
  note: string;
  status: string;
  level: "ok" | "low" | "active";
  pct: number;
}

export interface Compartment {
  id: string;
  label: string;
  qty: number;
  state: "ok" | "low" | "empty" | "active";
}

export interface PowerChannel {
  id: string;
  name: string;
  zone: string;
  volts: number | null;
  amps: number | null;
  watts: number | null;
  on: boolean;
  provider: "mqtt" | "miot";
  transport: "local" | "cloud" | null;
  online: boolean;
  updatedAt: number;
  model?: string;
}

export interface Battery {
  id: string;
  pct: number;
  charging: boolean;
  volts: number;
}

export interface CanDevice {
  id: string;
  name: string;
  model: string;
  mech: string;
  on: boolean;
  latencyMs: number | null;
  tempC: number | null;
  lastHeartbeat: number;
}

export interface PitConnection {
  brokerConnected: boolean;
  lastMessageAt: number | null;
  deviceLastSeen: {
    cabinet: number | null;
    power: number | null;
    miot: number | null;
    can: number | null;
    vision: number | null;
    toolbox: number | null;
  };
}

export interface PitState {
  updatedAt: number;
  source: "empty" | "live";
  connection: PitConnection;
  tools: PitTool[];
  units: RackUnit[];
  compartments: Compartment[];
  channels: PowerChannel[];
  batteries: Battery[];
  canDevices: CanDevice[];
  env: { tempC: number | null; humidity: number | null };
  scanLog: Array<{ t: string; msg: string; kind: "ok" | "warn" | "err" }>;
  toolStation: ToolStationState;
}
