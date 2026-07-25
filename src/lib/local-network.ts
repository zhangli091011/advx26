import {
  hostname,
  networkInterfaces,
  type NetworkInterfaceInfo,
} from "node:os";
import type { LocalNetworkView } from "@/types/pit-config";

type NetworkAddress = Pick<NetworkInterfaceInfo, "address" | "family" | "internal">;
type NetworkInterfaceMap = Record<string, readonly NetworkAddress[] | undefined>;

export function getLocalNetworkView(): LocalNetworkView {
  return collectLocalNetworkView(hostname(), networkInterfaces());
}

export function collectLocalNetworkView(
  machineHostname: string,
  interfaces: NetworkInterfaceMap,
): LocalNetworkView {
  const seen = new Set<string>();
  const ipv4Addresses = Object.entries(interfaces)
    .flatMap(([interfaceName, entries]) => (entries ?? []).flatMap((entry) => {
      if (entry.internal || entry.family !== "IPv4" || !isUsableIpv4(entry.address)) return [];
      if (seen.has(entry.address)) return [];
      seen.add(entry.address);
      return [{ address: entry.address, interfaceName }];
    }))
    .sort((left, right) =>
      addressRank(left.address, left.interfaceName)
      - addressRank(right.address, right.interfaceName)
      || left.address.localeCompare(right.address));

  return {
    hostname: machineHostname,
    preferredIpv4: ipv4Addresses[0]?.address ?? "",
    ipv4Addresses,
  };
}

function isUsableIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4
    || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second] = parts;
  return first !== 0
    && first !== 127
    && first < 224
    && !(first === 169 && second === 254)
    && isPrivateIpv4(address);
}

function addressRank(address: string, interfaceName: string) {
  let score = 0;
  if (/^(?:en|eth|wlan|wl|br-lan)/i.test(interfaceName)) score -= 10;
  if (/^(?:utun|tun|tap|docker|veth|vmnet|bridge)/i.test(interfaceName)) score += 20;
  return score;
}

function isPrivateIpv4(address: string) {
  const [first, second] = address.split(".").map(Number);
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}
