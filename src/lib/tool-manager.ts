import "server-only";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPitConfigPath } from "@/lib/pit-config";
import {
  createEmptyToolStore,
  nextToolState,
  parseToolStore,
  parseToolOperation,
  parseToolSlotInput,
  TOOL_SESSION_MS,
  type ToolStoreData,
} from "@/lib/tool-model";
import type { PitTool, ToolOperation, ToolStationState } from "@/types/pit";

const FILE_NAME = "pit-tools.json";

export class ToolManager {
  private data = this.load();
  private readonly stationId = process.env.PIT_TOOL_STATION_ID?.trim() || "main";

  get tools(): PitTool[] {
    return this.data.slots.filter((slot) => slot.enabled).map((slot) => ({
      slot: slot.slot,
      name: slot.name,
      unit: "U1",
      state: slot.state,
      time: slot.checkedOutAt ? new Date(slot.checkedOutAt).toLocaleString("zh-CN", { hour12: false }) : undefined,
      qr: slot.qr,
    }));
  }

  get station(): ToolStationState {
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
        id: item.id,
        slot: item.slot,
        name: item.name,
        operation: item.operation,
        createdAt: item.createdAt,
      })),
    };
  }

  get slots() {
    return this.data.slots.map(({ slot, ledIndex, enabled, name, qr, state }) => ({ slot, ledIndex, enabled, name, qr, state }));
  }

  configure(input: unknown) {
    const next = parseToolSlotInput(input);
    const duplicate = this.data.slots.find((slot) => slot.slot !== next.slot && slot.enabled && slot.qr === next.qr);
    if (next.enabled && duplicate) throw new Error(`二维码已绑定到 ${duplicate.slot}`);
    const slot = this.data.slots.find((item) => item.slot === next.slot);
    if (!slot) throw new Error("工具位不存在");
    slot.enabled = next.enabled;
    slot.name = next.enabled ? next.name : "";
    slot.qr = next.enabled ? next.qr : "";
    if (!next.enabled) {
      slot.state = "in";
      slot.checkedOutAt = null;
    }
    slot.updatedAt = Date.now();
    this.data.revision += 1;
    this.save();
    return slot;
  }

  startSession(operationInput: unknown) {
    this.expireSession();
    if (this.data.activeSession) throw new Error("已有扫码操作进行中，请先取消");
    const operation = parseToolOperation(operationInput);
    const now = Date.now();
    this.data.activeSession = { id: randomUUID(), operation, createdAt: now, expiresAt: now + TOOL_SESSION_MS };
    this.save();
    return this.data.activeSession;
  }

  cancelSession() {
    this.data.activeSession = null;
    this.save();
  }

  consumeScan(scanIdInput: unknown, qrInput: unknown, stationIdInput: unknown, capturedAtInput: unknown) {
    const scanId = typeof scanIdInput === "string" ? scanIdInput.trim().slice(0, 120) : "";
    const qr = typeof qrInput === "string" ? qrInput.trim().slice(0, 160) : "";
    if (!scanId || !qr) throw new Error("扫码事件缺少 scanId 或二维码");
    if (this.data.processedScans.includes(scanId)) return { duplicate: true as const };
    this.expireSession();
    const session = this.data.activeSession;
    if (!session) throw new Error("当前没有借出或归还扫码会话");
    const stationId = typeof stationIdInput === "string" ? stationIdInput.trim() : "";
    const capturedAt = typeof capturedAtInput === "number" && Number.isSafeInteger(capturedAtInput) ? capturedAtInput : 0;
    if (stationId !== this.stationId) throw new Error("扫码站不匹配");
    if (capturedAt < session.createdAt || capturedAt > session.expiresAt) throw new Error("扫码不属于当前操作会话");
    const slot = this.data.slots.find((item) => item.enabled && item.qr === qr);
    if (!slot) throw new Error("二维码未登记");
    const operation: ToolOperation = session.operation;
    slot.state = nextToolState(slot.state, operation);
    const now = Date.now();
    slot.checkedOutAt = operation === "checkout" ? now : null;
    slot.updatedAt = now;
    this.data.revision += 1;
    this.data.transactions.unshift({
      id: randomUUID(), scanId, slot: slot.slot, name: slot.name, qr, operation, createdAt: now,
    });
    this.data.transactions = this.data.transactions.slice(0, 500);
    this.data.processedScans.unshift(scanId);
    this.data.processedScans = this.data.processedScans.slice(0, 200);
    this.data.activeSession = null;
    this.save();
    return { duplicate: false as const, slot, operation };
  }

  ledSnapshot() {
    return {
      revision: this.data.revision,
      slots: this.data.slots.map((slot) => ({
        ledIndex: slot.ledIndex,
        slot: slot.slot,
        state: slot.enabled ? slot.state : "unconfigured",
      })),
    };
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
      return parseToolStore(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (error) {
      console.error(`[tools] 工具库读取失败：${error instanceof Error ? error.message : String(error)}，使用空配置`);
      return createEmptyToolStore();
    }
  }

  private save() {
    const file = this.filePath();
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  private filePath() {
    return path.join(path.dirname(getPitConfigPath()), FILE_NAME);
  }
}
