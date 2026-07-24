import type { MiCloudDevice } from "homebridge-miot/lib/protocol/MiCloud.js";

export type DiscoveredMiotDevice = {
  did: string;
  name: string;
  model: string;
  ip: string;
  online: boolean;
  localAvailable: boolean;
  mappingKnown: boolean;
};

export function sanitizeDiscoveredDevices(devices: MiCloudDevice[]): DiscoveredMiotDevice[] {
  return devices
    .filter(isOutletCandidate)
    .flatMap((device) => {
      const did = device.did == null ? "" : String(device.did);
      if (!did) return [];
      const model = text(device.model);
      return [{
        did,
        name: text(device.name) || model || `米家插座 ${did}`,
        model,
        ip: text(device.localip),
        online: device.isOnline === true,
        localAvailable: Boolean(device.localip && validToken(device.token)),
        mappingKnown: model === "xiaomi.plug.mcn005" || model === "chuangmi.plug.212a01",
      }];
    });
}

export function isOutletCandidate(device: MiCloudDevice) {
  const model = text(device.model).toLowerCase();
  const name = text(device.name).toLowerCase();
  return model.includes("plug") || model.includes("outlet") || name.includes("插座");
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{32}$/.test(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
