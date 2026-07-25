import "server-only";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPitConfigPath } from "@/lib/pit-config";
import {
  createEmptyToolStore,
  aggregateDrawerStates,
  drawerIds,
  nextToolState,
  parseToolInput,
  parseBorrower,
  parseToolOperation,
  parseToolStore,
  TOOL_DRAWER_COUNT,
  TOOL_SESSION_MS,
  type ToolStoreData,
} from "@/lib/tool-model";
import type { PitTool, ToolOperation, ToolStationState } from "@/types/pit";

const FILE_NAME = "pit-tools.json";

export class ToolManager {
  private data = this.load();
  private readonly stationId = process.env.PIT_TOOL_STATION_ID?.trim() || "main";

  get tools(): PitTool[] {
    return this.data.tools.map((tool) => ({
      slot: tool.id,
      name: tool.name,
      unit: tool.drawer,
      state: tool.state,
      who: tool.borrower ?? undefined,
      time: tool.checkedOutAt ? new Date(tool.checkedOutAt).toLocaleString("zh-CN", { hour12: false }) : undefined,
      qr: tool.qr,
    }));
  }

  get station(): Omit<ToolStationState, "vision"> {
    this.expireSession();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = this.data.transactions.filter((item) => item.createdAt >= start.getTime());
    return {
      activeSession: this.data.activeSession,
      checkoutCount: today.filter((item) => item.operation === "checkout").length,
      returnCount: today.filter((item) => item.operation === "return").length,
      desiredRevision: this.data.revision,
      appliedRevision: null,
      recentTransactions: this.data.transactions.slice(0, 10).map((item) => ({
        id: item.id, slot: item.toolId, name: item.name, operation: item.operation, borrower: item.borrower, createdAt: item.createdAt,
      })),
    };
  }

  get adminState() {
    return { tools: this.tools, drawers: drawerIds() };
  }

  configure(input: unknown) {
    const next = parseToolInput(input);
    const duplicate = this.data.tools.find((tool) => tool.id !== next.id && tool.qr === next.qr);
    if (duplicate) throw new Error(`二维码已绑定到 ${duplicate.id}`);
    if (!next.id) {
      const tool = { ...next, id: `T-${randomUUID().slice(0, 8).toUpperCase()}`, state: "in" as const, borrower: null, checkedOutAt: null, updatedAt: Date.now() };
      this.data.tools.push(tool);
      this.bumpAndSave();
      return tool;
    }
    const tool = this.data.tools.find((item) => item.id === next.id);
    if (!tool) throw new Error("工具不存在");
    if (tool.state !== "in" && (tool.name !== next.name || tool.qr !== next.qr || tool.drawer !== next.drawer)) {
      throw new Error("工具借出期间不能修改名称、二维码或所属抽屉");
    }
    Object.assign(tool, { name: next.name, qr: next.qr, drawer: next.drawer, updatedAt: Date.now() });
    this.bumpAndSave();
    return tool;
  }

  remove(idInput: unknown) {
    const id = typeof idInput === "string" ? idInput.trim().toUpperCase() : "";
    const index = this.data.tools.findIndex((tool) => tool.id === id);
    if (index < 0) throw new Error("工具不存在");
    if (this.data.tools[index].state !== "in") throw new Error("工具借出期间不能删除");
    const [removed] = this.data.tools.splice(index, 1);
    this.bumpAndSave();
    return removed;
  }

  drawerForTool(id: string) {
    return this.data.tools.find((tool) => tool.id === id)?.drawer ?? null;
  }

  startSession(operationInput: unknown, borrowerInput?: unknown) {
    this.expireSession();
    if (this.data.activeSession) throw new Error("已有扫码操作进行中，请先取消");
    const operation = parseToolOperation(operationInput);
    const borrower = parseBorrower(borrowerInput, operation);
    const now = Date.now();
    this.data.activeSession = { id: randomUUID(), operation, borrower, createdAt: now, expiresAt: now + TOOL_SESSION_MS };
    this.save();
    return this.data.activeSession;
  }

  cancelSession(expectedId?: string) {
    if (expectedId && this.data.activeSession?.id !== expectedId) return false;
    this.data.activeSession = null;
    this.save();
    return true;
  }

  consumeScan(scanIdInput: unknown, sessionIdInput: unknown, qrInput: unknown, stationIdInput: unknown, capturedAtInput: unknown) {
    const scanId = typeof scanIdInput === "string" ? scanIdInput.trim().slice(0, 120) : "";
    const qr = typeof qrInput === "string" ? qrInput.trim().slice(0, 160) : "";
    if (!scanId || !qr) throw new Error("扫码事件缺少 scanId 或二维码");
    if (this.data.processedScans.includes(scanId)) return { duplicate: true as const };
    this.expireSession();
    const session = this.data.activeSession;
    if (!session) throw new Error("当前没有借出或归还扫码会话");
    if (stationIdInput !== this.stationId || sessionIdInput !== session.id) throw new Error("扫码不属于当前操作会话");
    const capturedAt = typeof capturedAtInput === "number" && Number.isSafeInteger(capturedAtInput) ? capturedAtInput : 0;
    if (capturedAt < session.createdAt || capturedAt > session.expiresAt) throw new Error("扫码不属于当前操作会话");
    const tool = this.data.tools.find((item) => item.qr === qr);
    if (!tool) throw new Error("二维码未登记");
    const operation: ToolOperation = session.operation;
    tool.state = nextToolState(tool.state, operation);
    const now = Date.now();
    tool.checkedOutAt = operation === "checkout" ? now : null;
    const borrower = operation === "checkout" ? session.borrower : tool.borrower;
    tool.borrower = operation === "checkout" ? session.borrower : null;
    tool.updatedAt = now;
    this.data.revision += 1;
    this.data.transactions.unshift({
      id: randomUUID(), scanId, toolId: tool.id, drawer: tool.drawer, name: tool.name, qr, operation, borrower, createdAt: now,
    });
    this.data.transactions = this.data.transactions.slice(0, 500);
    this.data.processedScans = [scanId, ...this.data.processedScans].slice(0, 200);
    this.data.activeSession = null;
    this.save();
    return { duplicate: false as const, slot: tool, operation };
  }

  ledSnapshot() {
    return {
      revision: this.data.revision,
      drawerCount: TOOL_DRAWER_COUNT,
      drawers: aggregateDrawerStates(this.data.tools),
    };
  }

  private bumpAndSave() {
    this.data.revision += 1;
    this.save();
  }

  private expireSession() {
    if (this.data.activeSession && this.data.activeSession.expiresAt <= Date.now()) {
      this.data.activeSession = null;
      this.save();
    }
  }

  private load(): ToolStoreData {
    const file = this.filePath();
    if (!fs.existsSync(file)) return createEmptyToolStore();
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const parsed = parseToolStore(raw);
      if (raw.version !== 2) this.write(parsed);
      return parsed;
    } catch (error) {
      const backup = `${file}.invalid-${Date.now()}`;
      fs.copyFileSync(file, backup);
      console.error(`[tools] 工具库读取失败：${error instanceof Error ? error.message : String(error)}；原文件已备份到 ${backup}`);
      return createEmptyToolStore();
    }
  }

  private save() {
    this.write(this.data);
  }

  private write(data: ToolStoreData) {
    const file = this.filePath();
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  private filePath() {
    return path.join(path.dirname(getPitConfigPath()), FILE_NAME);
  }
}
