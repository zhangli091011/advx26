import "server-only";

import MiCloud from "homebridge-miot/lib/protocol/MiCloud.js";
import type { MiotOutletConfig } from "@/lib/miot-config";
import { isOutletCandidate, sanitizeDiscoveredDevices, type DiscoveredMiotDevice } from "@/lib/miot-discovery-model";
import { fetchBrokerSession } from "@/lib/miot-session-broker";
import type { StoredPitConfig } from "@/lib/pit-config-model";

export type { DiscoveredMiotDevice } from "@/lib/miot-discovery-model";

const quietLogger = { debug() {}, deepDebug() {} };

export async function discoverMiotDevices(config: StoredPitConfig): Promise<DiscoveredMiotDevice[]> {
  return sanitizeDiscoveredDevices(await getCloudDevices(config));
}

export async function importMiotDevice(config: StoredPitConfig, did: string, channelId: string): Promise<MiotOutletConfig> {
  if (!/^CH[1-8]$/.test(channelId)) throw new Error("导入通道必须为 CH1-CH8");
  if (config.miot.outlets.some((outlet) => outlet.id === channelId)) throw new Error(`${channelId} 已被其他插座占用`);
  if (config.miot.outlets.some((outlet) => outlet.did === did)) throw new Error("该米家插座已经导入");

  const devices = await getCloudDevices(config);
  const device = devices.find((item) => item.did != null && String(item.did) === did);
  if (!device || !isOutletCandidate(device)) throw new Error("该插座不属于当前小米账号或已不存在");

  const model = text(device.model);
  const profile = profileForModel(model);
  const token = validToken(device.token) ? device.token!.toLowerCase() : undefined;
  const ip = token ? text(device.localip) || undefined : undefined;
  return {
    id: channelId,
    name: text(device.name) || `米家智能插座 ${channelId}`,
    zone: "米家",
    model: model || undefined,
    ip,
    token,
    did,
    nominalVolts: 220,
    power: { siid: 2, piid: 1, scale: 1 },
    ...profile,
  };
}

async function getCloudDevices(config: StoredPitConfig) {
  const cloud = new MiCloud(quietLogger);
  cloud.setCountry(config.miot.cloud.region);
  cloud.setRequestTimeout(10_000);
  const brokerSession = await fetchBrokerSession(config.miot.cloud);
  if (brokerSession) {
    cloud.setServiceToken(brokerSession);
  } else if (config.miot.cloud.session) {
    cloud.setServiceToken(JSON.parse(config.miot.cloud.session));
  } else if (config.miot.cloud.username && config.miot.cloud.password) {
    try {
      await cloud.login(config.miot.cloud.username, config.miot.cloud.password);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/two|2fa|notification/i.test(message)) throw new Error("小米账号需要二次验证，请保存 Session JSON 后重试");
      throw new Error(`小米云登录失败：${message}`);
    }
  } else {
    throw new Error("请先保存小米云 Session JSON 或账号密码");
  }
  if (!cloud.isLoggedIn()) throw new Error("小米云 Session 无效或已过期");
  try {
    return await cloud.getDevices();
  } catch (error) {
    throw new Error(`获取小米设备列表失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function profileForModel(model: string): Partial<MiotOutletConfig> | null {
  if (model === "xiaomi.plug.mcn005") {
    return { watts: { siid: 3, piid: 2, scale: 1 } };
  }
  if (model === "chuangmi.plug.212a01") {
    return {
      watts: { siid: 5, piid: 6, scale: 1 },
      amps: { siid: 5, piid: 2, scale: 0.001 },
      volts: { siid: 5, piid: 3, scale: 0.1 },
    };
  }
  return null;
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{32}$/.test(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
