export type HomeAssistantAddressDraft = {
  protocol: "http" | "https";
  host: string;
  port: string;
};

export function splitHomeAssistantBaseUrl(baseUrl: string): HomeAssistantAddressDraft {
  const url = new URL(baseUrl);
  return {
    protocol: url.protocol === "https:" ? "https" : "http",
    host: stripIpv6Brackets(url.hostname),
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
  };
}

export function buildHomeAssistantBaseUrl(draft: HomeAssistantAddressDraft) {
  const protocol = draft.protocol === "https" ? "https" : "http";
  const host = stripIpv6Brackets(draft.host.trim());
  if (!host) throw new Error("Home Assistant IP 或主机名不能为空");
  if (/[\s/?#@]/.test(host)) throw new Error("Home Assistant IP 或主机名格式无效");
  if (!/^\d{1,5}$/.test(draft.port.trim())) {
    throw new Error("Home Assistant 端口必须是 1–65535 的数字");
  }
  const port = Number(draft.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Home Assistant 端口必须是 1–65535 的数字");
  }
  const formattedHost = host.includes(":") ? `[${host}]` : host;
  const url = new URL(`${protocol}://${formattedHost}:${port}`);
  return url.origin;
}

function stripIpv6Brackets(host: string) {
  return host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
}
