import type { ToolOperation, ToolState } from "@/types/pit";

export const TOOL_SLOT_COUNT = 10;
export const TOOL_SESSION_MS = 60_000;

export type StoredToolSlot = {
  slot: string;
  ledIndex: number;
  enabled: boolean;
  name: string;
  qr: string;
  state: ToolState;
  checkedOutAt: number | null;
  updatedAt: number;
};

export type StoredToolSession = {
  id: string;
  operation: ToolOperation;
  createdAt: number;
  expiresAt: number;
};

export type StoredToolTransaction = {
  id: string;
  scanId: string;
  slot: string;
  name: string;
  qr: string;
  operation: ToolOperation;
  createdAt: number;
};

export type ToolStoreData = {
  version: 1;
  revision: number;
  slots: StoredToolSlot[];
  activeSession: StoredToolSession | null;
  transactions: StoredToolTransaction[];
  processedScans: string[];
};

export function createEmptyToolStore(): ToolStoreData {
  return {
    version: 1,
    revision: 1,
    slots: Array.from({ length: TOOL_SLOT_COUNT }, (_, index) => ({
      slot: `U1-${String(index + 1).padStart(2, "0")}`,
      ledIndex: index,
      enabled: false,
      name: "",
      qr: "",
      state: "in" as const,
      checkedOutAt: null,
      updatedAt: 0,
    })),
    activeSession: null,
    transactions: [],
    processedScans: [],
  };
}

export function parseToolStore(value: unknown): ToolStoreData {
  if (!isRecord(value) || value.version !== 1 || !nonNegativeInteger(value.revision)) throw new Error("结构无效");
  if (!Array.isArray(value.slots) || value.slots.length !== TOOL_SLOT_COUNT) throw new Error("工具位数量无效");
  const slots = value.slots.map((item, index) => parseStoredSlot(item, index));
  if (!Array.isArray(value.transactions) || !Array.isArray(value.processedScans)) throw new Error("事务记录无效");
  const transactions = value.transactions.map(parseStoredTransaction);
  const processedScans = value.processedScans.map((item) => requiredString(item, 120, "扫码记录无效"));
  const activeSession = value.activeSession === null ? null : parseStoredSession(value.activeSession);
  return { version: 1, revision: value.revision, slots, activeSession, transactions, processedScans };
}

export function parseToolSlotInput(value: unknown) {
  if (!isRecord(value)) throw new Error("工具配置格式无效");
  const slot = typeof value.slot === "string" ? value.slot.trim().toUpperCase() : "";
  if (!/^U1-(0[1-9]|10)$/.test(slot)) throw new Error("工具位必须为 U1-01 至 U1-10");
  const enabled = value.enabled === true;
  const name = text(value.name, 80);
  const qr = text(value.qr, 160);
  if (enabled && (!name || !qr)) throw new Error("启用工具位必须填写名称和二维码");
  return { slot, enabled, name, qr };
}

export function parseToolOperation(value: unknown): ToolOperation {
  if (value !== "checkout" && value !== "return") throw new Error("操作必须为借出或归还");
  return value;
}

export function nextToolState(current: ToolState, operation: ToolOperation): ToolState {
  if (operation === "checkout") {
    if (current !== "in") throw new Error("工具当前不在位，不能重复借出");
    return "out";
  }
  if (current === "in") throw new Error("工具已经在位，不能重复归还");
  return "in";
}

export function parseVisionScan(value: unknown) {
  if (!isRecord(value)) throw new Error("扫码事件格式无效");
  const scanId = requiredString(value.scanId, 120, "扫码事件缺少 scanId");
  const sessionId = requiredString(value.sessionId, 120, "扫码事件缺少 sessionId");
  const qr = requiredString(value.qr, 160, "扫码事件缺少二维码");
  const stationId = requiredString(value.stationId, 64, "扫码事件缺少扫码站");
  const capturedAt = timestamp(value.capturedAt, "扫码时间无效");
  return { scanId, sessionId, qr, stationId, capturedAt };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredSlot(value: unknown, index: number): StoredToolSlot {
  if (!isRecord(value)) throw new Error("工具位结构无效");
  const expectedSlot = `U1-${String(index + 1).padStart(2, "0")}`;
  if (value.slot !== expectedSlot || value.ledIndex !== index || typeof value.enabled !== "boolean") throw new Error("工具位顺序无效");
  const state = value.state;
  if (state !== "in" && state !== "out" && state !== "lost") throw new Error("工具状态无效");
  const name = text(value.name, 80);
  const qr = text(value.qr, 160);
  if (value.enabled && (!name || !qr)) throw new Error("启用工具位缺少名称或二维码");
  const checkedOutAt = value.checkedOutAt === null ? null : timestamp(value.checkedOutAt, "借出时间无效");
  return { slot: expectedSlot, ledIndex: index, enabled: value.enabled, name, qr, state, checkedOutAt, updatedAt: timestamp(value.updatedAt, "更新时间无效") };
}

function parseStoredSession(value: unknown): StoredToolSession {
  if (!isRecord(value)) throw new Error("扫码会话无效");
  const createdAt = timestamp(value.createdAt, "会话时间无效");
  const expiresAt = timestamp(value.expiresAt, "会话时间无效");
  if (expiresAt <= createdAt) throw new Error("会话有效期无效");
  return { id: requiredString(value.id, 120, "会话 ID 无效"), operation: parseToolOperation(value.operation), createdAt, expiresAt };
}

function parseStoredTransaction(value: unknown): StoredToolTransaction {
  if (!isRecord(value)) throw new Error("工具事务无效");
  const slot = requiredString(value.slot, 8, "事务工具位无效");
  if (!/^U1-(0[1-9]|10)$/.test(slot)) throw new Error("事务工具位无效");
  return {
    id: requiredString(value.id, 120, "事务 ID 无效"),
    scanId: requiredString(value.scanId, 120, "事务扫码 ID 无效"),
    slot,
    name: requiredString(value.name, 80, "事务工具名称无效"),
    qr: requiredString(value.qr, 160, "事务二维码无效"),
    operation: parseToolOperation(value.operation),
    createdAt: timestamp(value.createdAt, "事务时间无效"),
  };
}

function requiredString(value: unknown, max: number, message: string) {
  const result = text(value, max);
  if (!result) throw new Error(message);
  return result;
}

function timestamp(value: unknown, message: string) {
  if (!nonNegativeInteger(value)) throw new Error(message);
  return value;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
