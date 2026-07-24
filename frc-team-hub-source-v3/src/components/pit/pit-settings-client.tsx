"use client";

import { useEffect, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import { DEFAULT_MIOT_BROKER_URL } from "@/lib/pit-config-model";
import type { DiscoveredMiotDevice, MiotOutletInput, MiotPropertyInput, PitConfigTestResult, PitConfigView } from "@/types/pit-config";

type DesktopWindow = Window & { pitDesktop?: { restartApplication(): Promise<void> } };

const EMPTY_CONFIG: PitConfigView = {
  configPath: "",
  restartRequired: true,
  mqtt: { url: "mqtt://127.0.0.1:1883", username: "", password: "", passwordConfigured: false },
  miot: {
    pollIntervalMs: 10_000,
    debug: false,
    cloud: {
      region: "cn", username: "", password: "", passwordConfigured: false,
      session: "", sessionConfigured: false, brokerUrl: DEFAULT_MIOT_BROKER_URL,
    },
    outlets: [],
  },
};

const NEW_OUTLET: MiotOutletInput = {
  id: "CH1",
  name: "米家智能插座 3",
  zone: "工作台",
  model: "cuco.plug.v3",
  ip: "",
  token: "",
  tokenConfigured: false,
  did: "",
  nominalVolts: 220,
  power: { siid: 2, piid: 1, scale: 1 },
  watts: { siid: 11, piid: 2, scale: 1 },
  volts: null,
  amps: null,
};

export function PitSettingsClient() {
  const [config, setConfig] = useState<PitConfigView>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [testResults, setTestResults] = useState<Record<string, PitConfigTestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [devices, setDevices] = useState<DiscoveredMiotDevice[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/pit/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) setConfig(result.data);
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "配置读取失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/pit/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "配置保存失败");
      setConfig(result.data);
      setMessage("配置已保存，重启服务后生效");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function runTest(target: string) {
    setTesting(target);
    setMessage("");
    try {
      const response = await fetch("/api/pit/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "测试失败");
      setTestResults((current) => ({ ...current, [target]: result.data }));
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [target]: { ok: false, target, latencyMs: 0, message: error instanceof Error ? error.message : "测试失败" },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function discoverDevices() {
    setDiscovering(true);
    setMessage("");
    try {
      const response = await fetch("/api/pit/config/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "获取小米设备列表失败");
      setDevices(result.data.devices);
      setMessage(result.data.devices.length ? `发现 ${result.data.devices.length} 个米家插座` : "账号中未发现插座设备");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "获取小米设备列表失败");
    } finally {
      setDiscovering(false);
    }
  }

  async function importDevice(device: DiscoveredMiotDevice) {
    const used = new Set(config.miot.outlets.map((outlet) => outlet.id));
    const channelId = Array.from({ length: 8 }, (_, index) => `CH${index + 1}`).find((item) => !used.has(item));
    if (!channelId) return setMessage("CH1-CH8 已全部使用，请先删除一个通道");
    setDiscovering(true);
    try {
      const response = await fetch("/api/pit/config/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", did: device.did, channelId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "导入插座失败");
      setConfig(result.data);
      setDevices((current) => current?.filter((item) => item.did !== device.did) ?? null);
      setMessage(`${device.name} 已导入到 ${channelId}，重启后生效`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入插座失败");
    } finally {
      setDiscovering(false);
    }
  }

  function updateOutlet(index: number, patch: Partial<MiotOutletInput>) {
    setConfig((current) => ({
      ...current,
      miot: {
        ...current.miot,
        outlets: current.miot.outlets.map((outlet, itemIndex) => itemIndex === index ? { ...outlet, ...patch } : outlet),
      },
    }));
  }

  function addOutlet() {
    const used = new Set(config.miot.outlets.map((outlet) => outlet.id));
    const id = Array.from({ length: 8 }, (_, index) => `CH${index + 1}`).find((item) => !used.has(item));
    if (!id) return setMessage("CH1-CH8 已全部使用");
    setConfig((current) => ({
      ...current,
      miot: { ...current.miot, outlets: [...current.miot.outlets, { ...NEW_OUTLET, id }] },
    }));
  }

  function removeOutlet(index: number) {
    setConfig((current) => ({
      ...current,
      miot: { ...current.miot, outlets: current.miot.outlets.filter((_, itemIndex) => itemIndex !== index) },
    }));
  }

  async function restart() {
    const desktop = (window as DesktopWindow).pitDesktop;
    if (!desktop) return setMessage("树莓派或浏览器部署请重启 pit-os 服务");
    await desktop.restartApplication();
  }

  return (
    <PitShell title="TEST & CONFIG MANAGEMENT" active={7}>
      <Panel x={224} y={96} w={520} h={420} title="MQTT 配置" en="BROKER">
        <div className="pit-settings-form">
          <Field label="Broker URL" value={config.mqtt.url} onChange={(url) => setConfig({ ...config, mqtt: { ...config.mqtt, url } })} />
          <Field label="用户名" value={config.mqtt.username} onChange={(username) => setConfig({ ...config, mqtt: { ...config.mqtt, username } })} />
          <SecretField
            label="密码"
            value={config.mqtt.password}
            configured={config.mqtt.passwordConfigured}
            clear={config.mqtt.clearPassword === true}
            onChange={(password) => setConfig({ ...config, mqtt: { ...config.mqtt, password, clearPassword: false } })}
            onClear={(clearPassword) => setConfig({ ...config, mqtt: { ...config.mqtt, clearPassword } })}
          />
          <TestButton target="mqtt" testing={testing} result={testResults.mqtt} onTest={runTest} />
        </div>
      </Panel>

      <Panel x={760} y={96} w={560} h={420} title="米家云端" en="MI CLOUD FALLBACK">
        <div className="pit-settings-form two-col">
          <Field label="区域" value={config.miot.cloud.region} onChange={(region) => setConfig({ ...config, miot: { ...config.miot, cloud: { ...config.miot.cloud, region } } })} />
          <Field label="账号" value={config.miot.cloud.username} onChange={(username) => setConfig({ ...config, miot: { ...config.miot, cloud: { ...config.miot.cloud, username } } })} />
          <SecretField
            label="密码"
            value={config.miot.cloud.password}
            configured={config.miot.cloud.passwordConfigured}
            clear={config.miot.cloud.clearPassword === true}
            onChange={(password) => setConfig({ ...config, miot: { ...config.miot, cloud: { ...config.miot.cloud, password, clearPassword: false } } })}
            onClear={(clearPassword) => setConfig({ ...config, miot: { ...config.miot, cloud: { ...config.miot.cloud, clearPassword } } })}
          />
          <SecretField
            label="Session JSON"
            value={config.miot.cloud.session}
            configured={config.miot.cloud.sessionConfigured}
            clear={config.miot.cloud.clearSession === true}
            onChange={(session) => setConfig({ ...config, miot: { ...config.miot, cloud: { ...config.miot.cloud, session, clearSession: false } } })}
            onClear={(clearSession) => setConfig({ ...config, miot: { ...config.miot, cloud: { ...config.miot.cloud, clearSession } } })}
          />
          <Field label="轮询间隔 ms" type="number" value={String(config.miot.pollIntervalMs)} onChange={(value) => setConfig({ ...config, miot: { ...config.miot, pollIntervalMs: Number(value) } })} />
          <Field label="Session Broker URL" value={config.miot.cloud.brokerUrl} onChange={(brokerUrl) => setConfig({ ...config, miot: { ...config.miot, cloud: { ...config.miot.cloud, brokerUrl } } })} />
          <label className="pit-settings-check"><input type="checkbox" checked={config.miot.debug} onChange={(event) => setConfig({ ...config, miot: { ...config.miot, debug: event.target.checked } })} />启用 MIoT 调试日志</label>
          <button className="pit-settings-discover" type="button" disabled={discovering || loading} onClick={() => void discoverDevices()}>
            {discovering ? "正在获取云端 Session..." : "一键获取米家插座"}
          </button>
        </div>
      </Panel>

      <Panel x={1336} y={96} w={544} h={420} title="诊断与应用" en="DIAGNOSTICS">
        <div className="pit-settings-summary">
          <strong>{loading ? "正在读取配置..." : "配置存储"}</strong>
          <code>{config.configPath || "尚未确定"}</code>
          <p>保存不会立即中断当前控制连接。重启后 MQTT 和米家配置生效。</p>
          <div className={`pit-settings-message ${message.includes("失败") || message.includes("无效") ? "error" : ""}`}>{message || "修改敏感字段时留空将保留原值。"}</div>
          <button className="pit-settings-primary" type="button" disabled={saving || loading} onClick={() => void save()}>{saving ? "保存中..." : "保存全部配置"}</button>
          <button className="pit-settings-secondary" type="button" onClick={() => void restart()}>重启并应用</button>
        </div>
      </Panel>

      <Panel x={224} y={532} w={1656} h={504} title="米家插座通道" en="MIOT OUTLETS · LOCAL FIRST">
        <button className="pit-settings-add" type="button" onClick={addOutlet}>+ 添加插座</button>
        <div className="pit-settings-outlets">
          {config.miot.outlets.map((outlet, index) => (
            <OutletCard key={`${outlet.id}-${index}`} outlet={outlet} index={index} testing={testing} result={testResults[outlet.id]} onChange={updateOutlet} onRemove={removeOutlet} onTest={runTest} />
          ))}
          {config.miot.outlets.length === 0 ? <div className="pit-settings-empty">尚未配置米家插座。添加后可绑定到 CH1-CH8。</div> : null}
        </div>
      </Panel>
      {devices ? (
        <div className="pit-discovery-backdrop" role="dialog" aria-modal="true" aria-label="小米设备发现结果">
          <section className="pit-discovery-dialog">
            <header>
              <strong>发现米家插座</strong>
              <span>设备凭据只在服务端保存，不会返回到页面</span>
              <button type="button" onClick={() => setDevices(null)}>关闭</button>
            </header>
            <div className="pit-discovery-list">
              {devices.map((device) => (
                <article key={device.did}>
                  <i className={device.online ? "online" : ""} />
                  <div><strong>{device.name}</strong><span>{device.model || "未知型号"} · DID {device.did}</span></div>
                  <code>{device.ip || "无局域网 IP"}</code>
                  <small>{device.mappingKnown ? "属性映射已识别" : "未知型号，导入后请确认 SIID/PIID"}</small>
                  <button type="button" disabled={discovering} onClick={() => void importDevice(device)}>导入下一空闲通道</button>
                </article>
              ))}
              {devices.length === 0 ? <p>没有可导入的插座，或已全部导入。</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </PitShell>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange(value: string): void; type?: string }) {
  return <label className="pit-settings-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SecretField({ label, value, configured, clear, onChange, onClear }: { label: string; value: string; configured: boolean; clear: boolean; onChange(value: string): void; onClear(value: boolean): void }) {
  return (
    <div className="pit-settings-secret">
      <Field label={`${label}${configured ? " · 已配置" : ""}`} type="password" value={value} onChange={onChange} />
      <label><input type="checkbox" checked={clear} onChange={(event) => onClear(event.target.checked)} />清除</label>
    </div>
  );
}

function TestButton({ target, testing, result, onTest }: { target: string; testing: string | null; result?: PitConfigTestResult; onTest(target: string): void }) {
  return (
    <div className="pit-settings-test">
      <button type="button" disabled={testing !== null} onClick={() => onTest(target)}>{testing === target ? "测试中..." : "连接测试"}</button>
      {result ? <span className={result.ok ? "ok" : "error"}>{result.message} · {result.latencyMs}ms</span> : <span>请先保存，再执行测试</span>}
    </div>
  );
}

function OutletCard({ outlet, index, testing, result, onChange, onRemove, onTest }: { outlet: MiotOutletInput; index: number; testing: string | null; result?: PitConfigTestResult; onChange(index: number, patch: Partial<MiotOutletInput>): void; onRemove(index: number): void; onTest(target: string): void }) {
  return (
    <article className="pit-settings-outlet">
      <header><strong>{outlet.id} · {outlet.name}</strong><button type="button" onClick={() => onRemove(index)}>删除</button></header>
      <div className="pit-settings-outlet-grid">
        <Field label="通道" value={outlet.id} onChange={(id) => onChange(index, { id })} />
        <Field label="名称" value={outlet.name} onChange={(name) => onChange(index, { name })} />
        <Field label="区域" value={outlet.zone} onChange={(zone) => onChange(index, { zone })} />
        <Field label="Model" value={outlet.model} onChange={(model) => onChange(index, { model })} />
        <Field label="局域网 IP" value={outlet.ip} onChange={(ip) => onChange(index, { ip })} />
        <Field label="云端 DID" value={outlet.did} onChange={(did) => onChange(index, { did })} />
        <SecretField label={`Token${outlet.tokenConfigured ? "" : " · 未配置"}`} value={outlet.token} configured={outlet.tokenConfigured} clear={outlet.clearToken === true} onChange={(token) => onChange(index, { token, clearToken: false })} onClear={(clearToken) => onChange(index, { clearToken })} />
        <Field label="额定电压" type="number" value={String(outlet.nominalVolts)} onChange={(value) => onChange(index, { nominalVolts: Number(value) })} />
      </div>
      <div className="pit-settings-properties">
        <PropertyFields label="开关" value={outlet.power} onChange={(power) => onChange(index, { power })} />
        <OptionalPropertyFields label="功率" value={outlet.watts} onChange={(watts) => onChange(index, { watts })} />
        <OptionalPropertyFields label="电压" value={outlet.volts} onChange={(volts) => onChange(index, { volts })} />
        <OptionalPropertyFields label="电流" value={outlet.amps} onChange={(amps) => onChange(index, { amps })} />
      </div>
      <TestButton target={outlet.id} testing={testing} result={result} onTest={onTest} />
    </article>
  );
}

function PropertyFields({ label, value, onChange }: { label: string; value: MiotPropertyInput; onChange(value: MiotPropertyInput): void }) {
  return (
    <div className="pit-settings-property"><strong>{label}</strong>{(["siid", "piid", "scale"] as const).map((key) => <label key={key}>{key}<input type="number" step={key === "scale" ? "0.001" : "1"} value={value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} /></label>)}</div>
  );
}

function OptionalPropertyFields({ label, value, onChange }: { label: string; value: MiotPropertyInput | null; onChange(value: MiotPropertyInput | null): void }) {
  return <div className="pit-settings-optional"><label><input type="checkbox" checked={value !== null} onChange={(event) => onChange(event.target.checked ? { siid: 1, piid: 1, scale: 1 } : null)} />{label}</label>{value ? <PropertyFields label="" value={value} onChange={onChange} /> : null}</div>;
}
