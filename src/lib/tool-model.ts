import type { ToolOperation, ToolState } from "@/types/pit";

export const TOOL_DRAWER_COUNT = 5;
export const TOOL_SESSION_MS = 60_000;

export type StoredTool = {
  id: string;
  drawer: string;
  name: string;
  qr: string;
  state: ToolState;
  borrower: string | null;
  checkedOutAt: number | null;
  updatedAt: number;
};

export type StoredToolSession = {
  id: string;
  operation: ToolOperation;
  borrower: string | null;
  createdAt: number;
  expiresAt: number;
};

export type StoredToolTransaction = {
  id: string;
  scanId: string;
  toolId: string;
  drawer: string;
  name: string;
  qr: string;
  operation: ToolOperation;
  borrower: string | null;
  createdAt: number;
};

export type ToolStoreData = {
  version: 2;
  revision: number;
  tools: StoredTool[];
  activeSession: StoredToolSession | null;
  transactions: StoredToolTransaction[];
  processedScans: string[];
};

export function createEmptyToolStore(): ToolStoreData {
  return { version: 2, revision: 1, tools: [], activeSession: null, transactions: [], processedScans: [] };
}

export function parseToolStore(value: unknown): ToolStoreData {
  if (!isRecord(value)) throw new Error("结构无效");
  if (value.version === 1) return migrateVersion1(value);
  if (value.version !== 2 || !nonNegativeInteger(value.revision)) throw new Error("结构无效");
  if (!Array.isArray(value.tools) || value.tools.length > 200) throw new Error("工具清单无效");
  if (!Array.isArray(value.transactions) || !Array.isArray(value.processedScans)) throw new Error("事务记录无效");
  const tools = value.tools.map(parseStoredTool);
  ensureUnique(tools.map((tool) => tool.id), "工具 ID 重复");
  ensureUnique(tools.map((tool) => tool.qr), "工具二维码重复");
  return {
    version: 2,
    revision: value.revision,
    tools,
    activeSession: value.activeSession === null ? null : parseStoredSession(value.activeSession),
    transactions: value.transactions.map(parseStoredTransaction),
    processedScans: value.processedScans.map((item) => requiredString(item, 120, "扫码记录无效")),
  };
}

export function parseToolInput(value: unknown) {
  if (!isRecord(value)) throw new Error("工具配置格式无效");
  const idText = typeof value.id === "string" ? value.id.trim() : "";
  const id = idText ? toolId(idText) : "";
  const drawer = drawerId(value.drawer);
  const name = requiredString(value.name, 80, "工具名称不能为空");
  const qr = requiredString(value.qr, 160, "二维码不能为空");
  return { id, drawer, name, qr };
}

export function parseToolOperation(value: unknown): ToolOperation {
  if (value !== "checkout" && value !== "return") throw new Error("操作必须为借出或归还");
  return value;
}

export function parseBorrower(value: unknown, operation: ToolOperation) {
  const borrower = typeof value === "string" ? value.trim().slice(0, 40) : "";
  if (operation === "checkout" && !borrower) throw new Error("借出时必须填写借用人");
  return borrower || null;
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
  return {
    scanId: requiredString(value.scanId, 120, "扫码事件缺少 scanId"),
    sessionId: requiredString(value.sessionId, 120, "扫码事件缺少 sessionId"),
    qr: requiredString(value.qr, 160, "扫码事件缺少二维码"),
    stationId: requiredString(value.stationId, 64, "扫码事件缺少扫码站"),
    capturedAt: timestamp(value.capturedAt, "扫码时间无效"),
  };
}

export function drawerIds() {
  return Array.from({ length: TOOL_DRAWER_COUNT }, (_, index) => `D${index + 1}`);
}

export function isToolDrawer(value: string) {
  return /^D[1-5]$/.test(value);
}

export function aggregateDrawerStates(tools: Array<Pick<StoredTool, "drawer" | "state">>) {
  return drawerIds().map((drawer, ledIndex) => {
    const states = tools.filter((tool) => tool.drawer === drawer).map((tool) => tool.state);
    const state = states.length === 0 ? "unconfigured" : states.includes("lost") ? "lost" : states.includes("out") ? "out" : "in";
    return { ledIndex, drawer, state, toolCount: states.length };
  });
}

function migrateVersion1(value: Record<string, unknown>): ToolStoreData {
  if (!nonNegativeInteger(value.revision) || !Array.isArray(value.slots)) throw new Error("旧工具库结构无效");
  const tools = value.slots.flatMap((item, index) => {
    if (!isRecord(item) || item.enabled !== true) return [];
    const state = parseToolState(item.state);
    return [{
      id: toolId(item.slot),
      drawer: `D${index % TOOL_DRAWER_COUNT + 1}`,
      name: requiredString(item.name, 80, "旧工具名称无效"),
      qr: requiredString(item.qr, 160, "旧工具二维码无效"),
      state,
      borrower: typeof item.borrower === "string" && item.borrower.trim() ? item.borrower.trim().slice(0, 40) : null,
      checkedOutAt: item.checkedOutAt === null ? null : timestamp(item.checkedOutAt, "旧借出时间无效"),
      updatedAt: timestamp(item.updatedAt, "旧更新时间无效"),
    }];
  });
  const legacyTransactions = Array.isArray(value.transactions) ? value.transactions : [];
  return {
    version: 2,
    revision: value.revision + 1,
    tools,
    activeSession: null,
    transactions: legacyTransactions.map((item) => {
      if (!isRecord(item)) throw new Error("旧工具事务无效");
      const legacyId = toolId(item.slot);
      const number = Number(legacyId.match(/(\d+)$/)?.[1] ?? 1);
      return {
        id: requiredString(item.id, 120, "事务 ID 无效"),
        scanId: requiredString(item.scanId, 120, "事务扫码 ID 无效"),
        toolId: legacyId,
        drawer: `D${(number - 1) % TOOL_DRAWER_COUNT + 1}`,
        name: requiredString(item.name, 80, "事务工具名称无效"),
        qr: requiredString(item.qr, 160, "事务二维码无效"),
        operation: parseToolOperation(item.operation),
        borrower: null,
        createdAt: timestamp(item.createdAt, "事务时间无效"),
      };
    }),
    processedScans: Array.isArray(value.processedScans)
      ? value.processedScans.map((item) => requiredString(item, 120, "扫码记录无效"))
      : [],
  };
}

function parseStoredTool(value: unknown): StoredTool {
  if (!isRecord(value)) throw new Error("工具结构无效");
  return {
    id: toolId(value.id),
    drawer: drawerId(value.drawer),
    name: requiredString(value.name, 80, "工具名称无效"),
    qr: requiredString(value.qr, 160, "工具二维码无效"),
    state: parseToolState(value.state),
    borrower: value.borrower === null || value.borrower === undefined ? null : requiredString(value.borrower, 40, "借用人无效"),
    checkedOutAt: value.checkedOutAt === null ? null : timestamp(value.checkedOutAt, "借出时间无效"),
    updatedAt: timestamp(value.updatedAt, "更新时间无效"),
  };
}

function parseStoredSession(value: unknown): StoredToolSession {
  if (!isRecord(value)) throw new Error("扫码会话无效");
  const createdAt = timestamp(value.createdAt, "会话时间无效");
  const expiresAt = timestamp(value.expiresAt, "会话时间无效");
  if (expiresAt <= createdAt) throw new Error("会话有效期无效");
  const operation = parseToolOperation(value.operation);
  return { id: requiredString(value.id, 120, "会话 ID 无效"), operation, borrower: parseBorrower(value.borrower, operation), createdAt, expiresAt };
}

function parseStoredTransaction(value: unknown): StoredToolTransaction {
  if (!isRecord(value)) throw new Error("工具事务无效");
  return {
    id: requiredString(value.id, 120, "事务 ID 无效"),
    scanId: requiredString(value.scanId, 120, "事务扫码 ID 无效"),
    toolId: toolId(value.toolId),
    drawer: drawerId(value.drawer),
    name: requiredString(value.name, 80, "事务工具名称无效"),
    qr: requiredString(value.qr, 160, "事务二维码无效"),
    operation: parseToolOperation(value.operation),
    borrower: value.borrower === null || value.borrower === undefined ? null : requiredString(value.borrower, 40, "事务借用人无效"),
    createdAt: timestamp(value.createdAt, "事务时间无效"),
  };
}

function parseToolState(value: unknown): ToolState {
  if (value !== "in" && value !== "out" && value !== "lost") throw new Error("工具状态无效");
  return value;
}

function toolId(value: unknown) {
  const result = requiredString(value, 64, "工具 ID 无效").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(result)) throw new Error("工具 ID 只能包含字母、数字、下划线和连字符");
  return result;
}

function drawerId(value: unknown) {
  const result = requiredString(value, 2, "抽屉编号无效").toUpperCase();
  if (!isToolDrawer(result)) throw new Error("抽屉必须为 D1 至 D5");
  return result;
}

function ensureUnique(values: string[], message: string) {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function requiredString(value: unknown, max: number, message: string) {
  const result = typeof value === "string" ? value.trim().slice(0, max) : "";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
