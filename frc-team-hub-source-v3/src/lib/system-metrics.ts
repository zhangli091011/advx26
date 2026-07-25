import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";
import { statfs } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export type CpuTimes = { idle: number; total: number };

export type SystemMetrics = {
  sampledAt: number;
  identity: { hostname: string; model: string | null; platform: string; arch: string };
  cpu: { usagePct: number | null; cores: number; load: [number, number, number]; frequencyMhz: number | null };
  memory: { totalBytes: number; usedBytes: number; availableBytes: number; usagePct: number };
  storage: { totalBytes: number; usedBytes: number; availableBytes: number; usagePct: number } | null;
  thermal: { temperatureC: number | null; throttledRaw: string | null; activeFlags: string[]; historicalFlags: string[] };
  uptimeSec: number;
  process: { rssBytes: number; heapUsedBytes: number };
};

let previousCpu: CpuTimes | null = null;
let throttleCache: { expiresAt: number; raw: string | null } | null = null;

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const cpuTimes = aggregateCpuTimes(os.cpus());
  const usagePct = calculateCpuUsage(previousCpu, cpuTimes);
  previousCpu = cpuTimes;

  const [model, frequencyMhz, storage, throttledRaw] = await Promise.all([
    readText("/proc/device-tree/model"),
    readNumber("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq", 1000),
    readStorage(),
    readThrottled(),
  ]);
  const totalBytes = os.totalmem();
  const availableBytes = os.freemem();
  const memoryUsed = totalBytes - availableBytes;
  const memoryUsage = totalBytes > 0 ? memoryUsed / totalBytes * 100 : 0;
  const throttling = parseThrottled(throttledRaw);
  const processMemory = process.memoryUsage();

  return {
    sampledAt: Date.now(),
    identity: {
      hostname: os.hostname(),
      model: cleanDeviceTreeText(model),
      platform: os.platform(),
      arch: os.arch(),
    },
    cpu: {
      usagePct,
      cores: os.cpus().length,
      load: os.loadavg().map((value) => round(value, 2)) as [number, number, number],
      frequencyMhz,
    },
    memory: {
      totalBytes,
      usedBytes: memoryUsed,
      availableBytes,
      usagePct: round(memoryUsage, 1),
    },
    storage,
    thermal: {
      temperatureC: await readTemperature(),
      throttledRaw: throttling.raw,
      activeFlags: throttling.active,
      historicalFlags: throttling.historical,
    },
    uptimeSec: Math.floor(os.uptime()),
    process: { rssBytes: processMemory.rss, heapUsedBytes: processMemory.heapUsed },
  };
}

export function calculateCpuUsage(previous: CpuTimes | null, current: CpuTimes) {
  if (!previous) return null;
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (totalDelta <= 0) return null;
  return round(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)), 1);
}

export function parseThrottled(value: string | null) {
  const match = value?.match(/(?:throttled=)?(0x[\da-f]+)/i);
  if (!match) return { raw: null, active: [] as string[], historical: [] as string[] };
  const bits = Number.parseInt(match[1], 16);
  const flags = [
    { bit: 0, label: "undervoltage" },
    { bit: 1, label: "frequency-capped" },
    { bit: 2, label: "throttled" },
    { bit: 3, label: "soft-temperature-limit" },
  ];
  return {
    raw: `0x${bits.toString(16)}`,
    active: flags.filter(({ bit }) => bits & (1 << bit)).map(({ label }) => label),
    historical: flags.filter(({ bit }) => bits & (1 << (bit + 16))).map(({ label }) => label),
  };
}

function aggregateCpuTimes(cpus: os.CpuInfo[]): CpuTimes {
  return cpus.reduce((sum, cpu) => {
    const total = Object.values(cpu.times).reduce((value, time) => value + time, 0);
    return { idle: sum.idle + cpu.times.idle, total: sum.total + total };
  }, { idle: 0, total: 0 });
}

async function readStorage() {
  try {
    const result = await statfs("/");
    const totalBytes = result.blocks * result.bsize;
    const availableBytes = result.bavail * result.bsize;
    const usedBytes = totalBytes - result.bfree * result.bsize;
    return {
      totalBytes,
      usedBytes,
      availableBytes,
      usagePct: totalBytes > 0 ? round(usedBytes / totalBytes * 100, 1) : 0,
    };
  } catch {
    return null;
  }
}

async function readTemperature() {
  const thermalZone = await readNumber("/sys/class/thermal/thermal_zone0/temp", 1000);
  if (thermalZone !== null) return thermalZone;
  try {
    const { stdout } = await execFileAsync("vcgencmd", ["measure_temp"], { timeout: 1000 });
    const match = stdout.match(/([\d.]+)'?C/);
    return match ? round(Number(match[1]), 1) : null;
  } catch {
    return null;
  }
}

async function readThrottled() {
  const now = Date.now();
  if (throttleCache && throttleCache.expiresAt > now) return throttleCache.raw;
  let raw: string | null = null;
  try {
    const result = await execFileAsync("vcgencmd", ["get_throttled"], { timeout: 1000 });
    raw = result.stdout.trim();
  } catch {
    // vcgencmd is Raspberry Pi specific; other platforms report unavailable.
  }
  throttleCache = { expiresAt: now + 5000, raw };
  return raw;
}

async function readText(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function readNumber(path: string, divisor: number) {
  const text = await readText(path);
  const value = Number(text?.trim());
  return Number.isFinite(value) ? round(value / divisor, 1) : null;
}

function cleanDeviceTreeText(value: string | null) {
  return value?.replace(/\0/g, "").trim() || null;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
