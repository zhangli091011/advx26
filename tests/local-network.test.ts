import assert from "node:assert/strict";
import test from "node:test";
import { collectLocalNetworkView } from "../src/lib/local-network";

test("reports usable LAN IPv4 addresses and prefers a physical private interface", () => {
  const view = collectLocalNetworkView("pit-station", {
    lo0: [
      { address: "127.0.0.1", family: "IPv4", internal: true },
    ],
    utun4: [
      { address: "100.96.1.20", family: "IPv4", internal: false },
      { address: "28.0.0.1", family: "IPv4", internal: false },
    ],
    en0: [
      { address: "192.168.66.20", family: "IPv4", internal: false },
      { address: "fe80::1", family: "IPv6", internal: false },
    ],
    en7: [
      { address: "169.254.20.1", family: "IPv4", internal: false },
      { address: "192.168.66.20", family: "IPv4", internal: false },
    ],
  });

  assert.equal(view.hostname, "pit-station");
  assert.equal(view.preferredIpv4, "192.168.66.20");
  assert.deepEqual(view.ipv4Addresses, [
    { address: "192.168.66.20", interfaceName: "en0" },
    { address: "100.96.1.20", interfaceName: "utun4" },
  ]);
});
