"use client";

import { useEffect, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import type { DiscoveredHomeAssistantOutlet, HomeAssistantOutletInput, PitConfigTestResult, PitConfigView } from "@/types/pit-config";

type DesktopWindow = Window & { pitDesktop?: { restartApplication(): Promise<void> } };

const EMPTY_CONFIG: PitConfigView = {
  configPath: "",
  restartRequired: true,
  team: { number: 8214, name: "" },
  gateway: { url: "ws://127.0.0.1:8765", clientId: "pithub-main", token: "", tokenConfigured: false },
  homeAssistant: {
    baseUrl: "http://homeassistant.local:8123",
    accessToken: "",
    accessTokenConfigured: false,
    pollIntervalMs: 10_000,
    migrationRequired: false,
    outlets: [],
  },
};

const NEW_OUTLET: HomeAssistantOutletInput = {
  id: "CH1",
  name: "Home Assistant 插座",
  zone: "工作台",
  switchEntityId: "",
  wattsEntityId: "",
  voltsEntityId: "",
  ampsEntityId: "",
};

export function PitSettingsClient() {
  const [config, setConfig] = useState<PitConfigView>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [testResults, setTestResults] = useState<Record<string, PitConfigTestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [devices, setDevices] = useState<DiscoveredHomeAssistantOutlet[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/pit/config", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      if (!result.ok) throw new Error(result.error);
      if (active) setConfig(result.data);
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "配置读取失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/pit/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "配置保存失败");
      setConfig(result.data);
      setMessage("配置已保存；赛队信息立即生效，硬件连接配置重启后生效");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function runTest(target: string) {
    setTesting(target);
    try {
      const response = await fetch("/api/pit/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "测试失败");
      setTestResults((current) => ({ ...current, [target]: result.data }));
    } catch (error) {
      setTestResults((current) => ({ ...current, [target]: { ok: false, target, latencyMs: 0, message: error instanceof Error ? error.message : "测试失败" } }));
    } finally {
      setTesting(null);
    }
  }

  async function discoverDevices() {
    setDiscovering(true);
    setMessage("");
    try {
      const savedResponse = await fetch("/api/pit/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const saved = await savedResponse.json();
      if (!savedResponse.ok || !saved.ok) throw new Error(saved.error ?? "请先保存 Home Assistant 配置");
      setConfig(saved.data);
      const response = await fetch("/api/pit/config/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "获取 Home Assistant 实体失败");
      setDevices(result.data.devices);
      setMessage(result.data.devices.length ? `发现 ${result.data.devices.length} 个可导入开关实体` : "未发现可导入开关实体");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "获取 Home Assistant 实体失败");
    } finally {
      setDiscovering(false);
    }
  }

  async function importDevice(device: DiscoveredHomeAssistantOutlet) {
    const unbound = config.homeAssistant.outlets.find((outlet) => !outlet.switchEntityId)?.id;
    const used = new Set(config.homeAssistant.outlets.filter((outlet) => outlet.switchEntityId).map((outlet) => outlet.id));
    const channelId = unbound ?? Array.from({ length: 8 }, (_, index) => `CH${index + 1}`).find((item) => !used.has(item));
    if (!channelId) return setMessage("CH1-CH8 已全部使用，请先删除一个通道");
    setDiscovering(true);
    try {
      const response = await fetch("/api/pit/config/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", entityId: device.entityId, channelId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "导入实体失败");
      setConfig(result.data);
      setDevices((current) => current?.filter((item) => item.entityId !== device.entityId) ?? null);
      setMessage(`${device.name} 已导入到 ${channelId}，重启后生效`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入实体失败");
    } finally {
      setDiscovering(false);
    }
  }

  function updateOutlet(index: number, patch: Partial<HomeAssistantOutletInput>) {
    setConfig((current) => ({ ...current, homeAssistant: { ...current.homeAssistant, outlets: current.homeAssistant.outlets.map((outlet, itemIndex) => itemIndex === index ? { ...outlet, ...patch } : outlet) } }));
  }

  function addOutlet() {
    const used = new Set(config.homeAssistant.outlets.map((outlet) => outlet.id));
    const id = Array.from({ length: 8 }, (_, index) => `CH${index + 1}`).find((item) => !used.has(item));
    if (!id) return setMessage("CH1-CH8 已全部使用");
    setConfig((current) => ({ ...current, homeAssistant: { ...current.homeAssistant, outlets: [...current.homeAssistant.outlets, { ...NEW_OUTLET, id }] } }));
  }

  async function restart() {
    const desktop = (window as DesktopWindow).pitDesktop;
    if (!desktop) return setMessage("树莓派或浏览器部署请重启 pit-os 服务");
    await desktop.restartApplication();
  }

  return (
    <PitShell title="TEST & CONFIG MANAGEMENT" active={7}>
      <Panel x={224} y={96} w={360} h={420} title="赛队配置" en="TEAM IDENTITY">
        <div className="pit-settings-team">
          <Field label="FRC 队号" type="number" value={String(config.team.number)} onChange={(number) => setConfig({ ...config, team: { ...config.team, number: Number(number) } })} />
          <Field label="赛队名称（可选）" value={config.team.name} onChange={(name) => setConfig({ ...config, team: { ...config.team, name } })} />
          <div className="pit-settings-team-preview">
            <span>OUR TEAM</span>
            <strong>{Number.isInteger(config.team.number) && config.team.number > 0 ? config.team.number : "—"}</strong>
            <small>{config.team.name || "未填写赛队名称"}</small>
          </div>
          <p>用于赛事页面识别我方联盟、下一场比赛和赛区排名。保存后立即生效。</p>
        </div>
      </Panel>

      <Panel x={600} y={96} w={400} h={420} title="设备网关" en="WEBSOCKET">
        <div className="pit-settings-form">
          <Field label="WebSocket URL" value={config.gateway.url} onChange={(url) => setConfig({ ...config, gateway: { ...config.gateway, url } })} />
          <Field label="客户端 ID" value={config.gateway.clientId} onChange={(clientId) => setConfig({ ...config, gateway: { ...config.gateway, clientId } })} />
          <SecretField label="访问令牌" value={config.gateway.token} configured={config.gateway.tokenConfigured} clear={config.gateway.clearToken === true} onChange={(token) => setConfig({ ...config, gateway: { ...config.gateway, token, clearToken: false } })} onClear={(clearToken) => setConfig({ ...config, gateway: { ...config.gateway, clearToken } })} />
          <TestButton target="gateway" testing={testing} result={testResults.gateway} onTest={runTest} />
        </div>
      </Panel>

      <Panel x={1016} y={96} w={480} h={420} title="Home Assistant" en="REST API">
        <div className="pit-settings-form">
          <Field label="HA URL" value={config.homeAssistant.baseUrl} onChange={(baseUrl) => setConfig({ ...config, homeAssistant: { ...config.homeAssistant, baseUrl } })} />
          <SecretField label="长期访问令牌" value={config.homeAssistant.accessToken} configured={config.homeAssistant.accessTokenConfigured} clear={config.homeAssistant.clearAccessToken === true} onChange={(accessToken) => setConfig({ ...config, homeAssistant: { ...config.homeAssistant, accessToken, clearAccessToken: false } })} onClear={(clearAccessToken) => setConfig({ ...config, homeAssistant: { ...config.homeAssistant, clearAccessToken } })} />
          <Field label="轮询间隔 ms" type="number" value={String(config.homeAssistant.pollIntervalMs)} onChange={(value) => setConfig({ ...config, homeAssistant: { ...config.homeAssistant, pollIntervalMs: Number(value) } })} />
          <button className="pit-settings-discover" type="button" disabled={discovering || loading} onClick={() => void discoverDevices()}>{discovering ? "正在读取 HA 实体..." : "一键发现 HA 插座"}</button>
          {config.homeAssistant.migrationRequired ? <p>检测到旧小米配置，请重新绑定 Home Assistant 实体。</p> : null}
        </div>
      </Panel>

      <Panel x={1512} y={96} w={368} h={420} title="诊断与应用" en="DIAGNOSTICS">
        <div className="pit-settings-summary">
          <strong>{loading ? "正在读取配置..." : "配置存储"}</strong>
          <code>{config.configPath || "尚未确定"}</code>
          <p>赛队信息保存后立即用于赛事页面。令牌只保存在服务端；硬件连接配置需要重启应用。</p>
          <div className={`pit-settings-message ${message.includes("失败") || message.includes("无效") ? "error" : ""}`}>{message || "先在 Home Assistant 中添加小米设备，再在此导入实体。"}</div>
          <button className="pit-settings-primary" type="button" disabled={saving || loading} onClick={() => void save()}>{saving ? "保存中..." : "保存全部配置"}</button>
          <button className="pit-settings-secondary" type="button" onClick={() => void restart()}>重启并应用</button>
        </div>
      </Panel>

      <Panel x={224} y={532} w={1656} h={504} title="Home Assistant 电源通道" en="HA OUTLETS · REST">
        <button className="pit-settings-add" type="button" onClick={addOutlet}>+ 添加通道</button>
        <div className="pit-settings-outlets">
          {config.homeAssistant.outlets.map((outlet, index) => <OutletCard key={`${outlet.id}-${index}`} outlet={outlet} index={index} testing={testing} result={testResults[outlet.id]} onChange={updateOutlet} onRemove={() => setConfig((current) => ({ ...current, homeAssistant: { ...current.homeAssistant, outlets: current.homeAssistant.outlets.filter((_, itemIndex) => itemIndex !== index) } }))} onTest={runTest} />)}
          {config.homeAssistant.outlets.length === 0 ? <div className="pit-settings-empty">尚未绑定 Home Assistant 插座。</div> : null}
        </div>
      </Panel>

      {devices ? <div className="pit-discovery-backdrop" role="dialog" aria-modal="true" aria-label="Home Assistant 插座发现结果"><section className="pit-discovery-dialog"><header><strong>发现 Home Assistant 开关实体</strong><span>功率、电压和电流传感器会按实体名称自动匹配</span><button type="button" onClick={() => setDevices(null)}>关闭</button></header><div className="pit-discovery-list">{devices.map((device) => <article key={device.entityId}><i className={device.available ? "online" : ""} /><div><strong>{device.name}</strong><span>{device.entityId}</span></div><code>{device.wattsEntityId || "未匹配功率传感器"}</code><small>{device.available ? "可用" : "当前不可用"}</small><button type="button" disabled={discovering} onClick={() => void importDevice(device)}>导入下一通道</button></article>)}{devices.length === 0 ? <p>没有可导入开关实体。</p> : null}</div></section></div> : null}
    </PitShell>
  );
}

function OutletCard({ outlet, index, testing, result, onChange, onRemove, onTest }: { outlet: HomeAssistantOutletInput; index: number; testing: string | null; result?: PitConfigTestResult; onChange(index: number, patch: Partial<HomeAssistantOutletInput>): void; onRemove(): void; onTest(target: string): void }) {
  return <article className="pit-settings-outlet"><header><strong>{outlet.id} · {outlet.name}</strong><button type="button" onClick={onRemove}>删除</button></header><div className="pit-settings-outlet-grid"><Field label="通道" value={outlet.id} onChange={(id) => onChange(index, { id })} /><Field label="名称" value={outlet.name} onChange={(name) => onChange(index, { name })} /><Field label="区域" value={outlet.zone} onChange={(zone) => onChange(index, { zone })} /><Field label="开关实体 switch.*" value={outlet.switchEntityId} onChange={(switchEntityId) => onChange(index, { switchEntityId })} /><Field label="功率实体 sensor.*" value={outlet.wattsEntityId} onChange={(wattsEntityId) => onChange(index, { wattsEntityId })} /><Field label="电压实体 sensor.*" value={outlet.voltsEntityId} onChange={(voltsEntityId) => onChange(index, { voltsEntityId })} /><Field label="电流实体 sensor.*" value={outlet.ampsEntityId} onChange={(ampsEntityId) => onChange(index, { ampsEntityId })} /></div><TestButton target={outlet.id} testing={testing} result={result} onTest={onTest} /></article>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange(value: string): void; type?: string }) {
  return <label className="pit-settings-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SecretField({ label, value, configured, clear, onChange, onClear }: { label: string; value: string; configured: boolean; clear: boolean; onChange(value: string): void; onClear(value: boolean): void }) {
  return <div className="pit-settings-secret"><Field label={`${label}${configured ? " · 已配置" : ""}`} type="password" value={value} onChange={onChange} /><label><input type="checkbox" checked={clear} onChange={(event) => onClear(event.target.checked)} />清除</label></div>;
}

function TestButton({ target, testing, result, onTest }: { target: string; testing: string | null; result?: PitConfigTestResult; onTest(target: string): void }) {
  return <div className="pit-settings-test"><button type="button" disabled={testing !== null} onClick={() => onTest(target)}>{testing === target ? "测试中..." : "连接测试"}</button>{result ? <span className={result.ok ? "ok" : "error"}>{result.message} · {result.latencyMs}ms</span> : <span>请先保存，再执行测试</span>}</div>;
}
