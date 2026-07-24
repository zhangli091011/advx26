import "server-only";

import { getPitHub, type PitState } from "@/lib/pit-hub";

/**
 * 初始库存种子 —— 仅在 MQTT 无数据时作为回退。
 * 真实部署后，ESP32 分控会在数秒内用真实状态覆盖这些数据。
 */
export function seedPitStateIfEmpty(): PitState {
  const hub = getPitHub();
  if (hub.state.updatedAt > 0) return hub.state;

  hub.state = {
    updatedAt: Date.now(),
    tools: [
      { slot: "U1-01", name: "内六角套装 1.5-10mm", unit: "U1", state: "in" },
      { slot: "U1-02", name: "尖嘴钳 6寸", unit: "U1", state: "in" },
      { slot: "U1-03", name: "活动扳手 8寸", unit: "U1", state: "lost", who: "张工", time: "13:58" },
      { slot: "U2-01", name: "电动螺丝刀", unit: "U2", state: "out", who: "张工", time: "13:41" },
      { slot: "U2-02", name: "热风枪", unit: "U2", state: "in" },
      { slot: "U3-01", name: "批头套装 PH/TX 32件", unit: "U3", state: "out", who: "李工", time: "12:20" },
      { slot: "U7-01", name: "万用表 UT61E+", unit: "U7", state: "in" },
      { slot: "U7-02", name: "夹式电流表", unit: "U7", state: "in" },
    ],
    units: [
      { u: "U1", name: "手动工具抽屉", note: "内六角 / 扳手 / 钳", status: "在位 6/6", level: "ok", pct: 100 },
      { u: "U2", name: "电动工具抽屉", note: "电螺丝刀 / 热风枪", status: "在位 3/4", level: "ok", pct: 75 },
      { u: "U3", name: "批头 · 钻头耗材", note: "PH / TX / 内六角批头", status: "库存正常", level: "ok", pct: 86 },
      { u: "U4", name: "螺丝螺母格柜", note: "M3 / M4 / M5 / 垫片", status: "M4×20 偏低", level: "low", pct: 18 },
      { u: "U5", name: "接头 · 线材", note: "Anderson / XT60 / 线", status: "SB50 偏低", level: "low", pct: 18 },
      { u: "U6", name: "扎带 · 耗材", note: "扎带 / 热缩管 / 胶带", status: "扎带 仅剩1包", level: "low", pct: 10 },
      { u: "U7", name: "电工仪表", note: "万用表 / 夹表", status: "在位 2/2", level: "ok", pct: 100 },
      { u: "U8", name: "维修临时托盘", note: "按工序分组收纳", status: "◉ 取件指示", level: "active", pct: 0 },
    ],
    compartments: [
      { id: "m3x8", label: "M3×8", qty: 86, state: "ok" },
      { id: "m3x12", label: "M3×12", qty: 64, state: "ok" },
      { id: "m3nut", label: "M3 螺母", qty: 120, state: "ok" },
      { id: "m4x8", label: "M4×8", qty: 52, state: "ok" },
      { id: "m4x12", label: "M4×12", qty: 47, state: "ok" },
      { id: "m4x20", label: "M4×20", qty: 12, state: "low" },
      { id: "m4nut", label: "M4 螺母", qty: 98, state: "ok" },
      { id: "m4wash", label: "M4 弹垫", qty: 30, state: "active" },
      { id: "m5x10", label: "M5×10", qty: 40, state: "ok" },
      { id: "m5x16", label: "M5×16", qty: 33, state: "ok" },
      { id: "m5nut", label: "M5 螺母", qty: 61, state: "ok" },
      { id: "wash4", label: "平垫 Φ4", qty: 150, state: "ok" },
      { id: "circlip", label: "卡簧", qty: 22, state: "ok" },
      { id: "rivet", label: "铆钉", qty: 0, state: "empty" },
      { id: "selftap", label: "自攻丝", qty: 77, state: "ok" },
      { id: "setscr", label: "紧定", qty: 41, state: "ok" },
    ],
    channels: [
      { id: "CH1", name: "工作台插座 AC", zone: "工作台", volts: 220, amps: 3.2, watts: 704, on: true },
      { id: "CH2", name: "电池充电器 ×4", zone: "充电区", volts: 24, amps: 6.8, watts: 163, on: true },
      { id: "CH3", name: "笔记本平台", zone: "算法位", volts: 20, amps: 1.5, watts: 30, on: true },
      { id: "CH4", name: "机器人调试电源", zone: "检修位", volts: 12, amps: 0, watts: 0, on: false },
      { id: "CH5", name: "显示屏 · 面板", zone: "箱体", volts: 12, amps: 2.1, watts: 25, on: true },
      { id: "CH6", name: "照明 LED 灯带", zone: "箱体", volts: 12, amps: 1.8, watts: 22, on: true },
      { id: "CH7", name: "备用 USB-C PD", zone: "工作台", volts: 20, amps: 0.6, watts: 12, on: true },
      { id: "CH8", name: "备用插座", zone: "—", volts: 0, amps: 0, watts: 0, on: false },
    ],
    batteries: [
      { id: "BAT-1", pct: 100, charging: false, volts: 13.1 },
      { id: "BAT-2", pct: 87, charging: true, volts: 12.4 },
      { id: "BAT-3", pct: 100, charging: false, volts: 13.2 },
      { id: "BAT-4", pct: 45, charging: true, volts: 11.6 },
    ],
    canDevices: [
      { id: "01", name: "DRIVE-L1", model: "TalonFX (Kraken)", mech: "左驱动", on: true, latencyMs: 3, tempC: 41, lastHeartbeat: Date.now() },
      { id: "02", name: "DRIVE-R1", model: "TalonFX (Kraken)", mech: "右驱动", on: true, latencyMs: 3, tempC: 43, lastHeartbeat: Date.now() },
      { id: "11", name: "INTAKE", model: "SparkMax + NEO", mech: "进气", on: true, latencyMs: 5, tempC: 36, lastHeartbeat: Date.now() },
      { id: "21", name: "SHOOTER", model: "TalonFX ×2", mech: "射手", on: true, latencyMs: 4, tempC: 52, lastHeartbeat: Date.now() },
      { id: "31", name: "CLIMB", model: "SparkMax + NEO", mech: "攀爬", on: false, latencyMs: null, tempC: null, lastHeartbeat: 0 },
      { id: "60", name: "PDH", model: "Rev PDH", mech: "电源分配", on: true, latencyMs: 2, tempC: 33, lastHeartbeat: Date.now() },
    ],
    env: { tempC: 31.2, humidity: 46 },
    scanLog: [
      { t: "14:29:11", msg: "李工 归还「热风枪」→ 自动入位 U2-02", kind: "ok" },
      { t: "13:58:42", msg: "张工 借出「活动扳手 8寸」", kind: "warn" },
    ],
  };
  return hub.state;
}
