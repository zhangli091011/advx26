import "server-only";

import fs from "node:fs";
import path from "node:path";
import { environmentPitConfig, parseStoredPitConfig, type StoredPitConfig } from "@/lib/pit-config-model";

const CONFIG_FILE = "pit-config.json";

export function getPitConfigPath() {
  const directory = process.env.PIT_CONFIG_DIR
    ? path.resolve(process.env.PIT_CONFIG_DIR)
    : path.join(process.cwd(), "data");
  return path.join(directory, CONFIG_FILE);
}

export function loadPitConfig(): StoredPitConfig {
  const filePath = getPitConfigPath();
  if (!fs.existsSync(filePath)) return environmentPitConfig();
  try {
    return parseStoredPitConfig(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch (error) {
    throw new Error(`无法读取 ${filePath}：${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadPitConfigFallback() {
  try {
    return loadPitConfig();
  } catch (error) {
    console.error(`[config] ${error instanceof Error ? error.message : String(error)}，使用环境变量回退`);
    return environmentPitConfig();
  }
}

export function savePitConfig(config: StoredPitConfig) {
  const filePath = getPitConfigPath();
  const directory = path.dirname(filePath);
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows does not implement POSIX file modes.
  }
}
