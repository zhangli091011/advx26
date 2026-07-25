"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, PitShell } from "@/components/pit/pit-shell";
import {
  buildHomeAssistantBaseUrl,
  splitHomeAssistantBaseUrl,
  type HomeAssistantAddressDraft,
} from "@/lib/home-assistant-address";
import type {
  HomeAssistantBinding,
  PitChannelId,
} from "@/lib/pit-config-model";
import type {
  DiscoveredHomeAssistantEntity,
  HomeAssistantDiscoveryView,
  PitConfigTestResult,
  PitConfigView,
} from "@/types/pit-config";

type DesktopWindow = Window & { pitDesktop?: { restartApplication(): Promise<void> } };

const CHANNEL_IDS = Array.from(
  { length: 8 },
  (_, index) => `CH${index + 1}` as PitChannelId,
);

const EMPTY_CONFIG: PitConfigView = {
  version: 2,
  configPath: "",
  restartRequired: true,
  migrationRequired: false,
  legacyChannels: [],
  localNetwork: {
    hostname: "",
    preferredIpv4: "",
    ipv4Addresses: [],
  },
  mqtt: {
    url: "mqtt://127.0.0.1:1883",
    username: "",
    password: "",
    passwordConfigured: false,
  },
  homeAssistant: {
    baseUrl: "http://192.168.66.34:8123",
    accessToken: "",
    accessTokenConfigured: false,
    tokenManagedByEnvironment: false,
    mode: "observe",
    defaultAreaId: "",
    bindings: [],
  },
};

export function PitSettingsClient() {
  const [config, setConfig] = useState<PitConfigView>(EMPTY_CONFIG);
  const [haAddress, setHaAddress] = useState<HomeAssistantAddressDraft>(
    () => splitHomeAssistantBaseUrl(EMPTY_CONFIG.homeAssistant.baseUrl),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [testResults, setTestResults] = useState<Record<string, PitConfigTestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<HomeAssistantDiscoveryView | null>(null);
  const [mappingChannel, setMappingChannel] = useState<PitChannelId | null>(null);
  const [areaFilter, setAreaFilter] = useState("");
  const [entitySearch, setEntitySearch] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/pit/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        if (active) {
          setConfig(result.data);
          setHaAddress(splitHomeAssistantBaseUrl(result.data.homeAssistant.baseUrl));
        }
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "配置读取失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredControlEntities = useMemo(() => {
    if (!discovery) return [];
    const query = entitySearch.trim().toLowerCase();
    return discovery.entities.filter((entity) => {
      if (!entity.controllable) return false;
      if (areaFilter && entity.areaId !== areaFilter) return false;
      return !query
        || entity.name.toLowerCase().includes(query)
        || entity.entityId.toLowerCase().includes(query)
        || entity.platform.toLowerCase().includes(query);
    });
  }, [areaFilter, discovery, entitySearch]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const baseUrl = buildHomeAssistantBaseUrl(haAddress);
      const submittedConfig = {
        ...config,
        homeAssistant: { ...config.homeAssistant, baseUrl },
      };
      const response = await fetch("/api/pit/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submittedConfig),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "配置保存失败");
      setConfig(result.data);
      setHaAddress(splitHomeAssistantBaseUrl(result.data.homeAssistant.baseUrl));
      setMessage(
        result.data.homeAssistant.mode === "observe"
          ? "配置已保存；当前仍为观察模式，重启后只读取状态"
          : "配置已保存；重启后由 Home Assistant 接管已映射通道",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function runTest(target: "mqtt" | "home-assistant") {
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
        [target]: {
          ok: false,
          target,
          latencyMs: 0,
          message: error instanceof Error ? error.message : "测试失败",
        },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function discoverEntities(channelId?: PitChannelId) {
    setDiscovering(true);
    setMessage("");
    try {
      const response = await fetch("/api/pit/config/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Home Assistant 实体发现失败");
      }
      const nextDiscovery = result.data as HomeAssistantDiscoveryView;
      const defaultAreaId = config.homeAssistant.defaultAreaId
        || nextDiscovery.defaultAreaId
        || "";
      setDiscovery(nextDiscovery);
      setAreaFilter(defaultAreaId);
      setMappingChannel(channelId ?? nextAvailableChannel(config.homeAssistant.bindings));
      setEntitySearch("");
      setMessage(
        `已连接 Home Assistant ${nextDiscovery.version}，发现 ${nextDiscovery.entities.length} 个实体`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Home Assistant 实体发现失败");
    } finally {
      setDiscovering(false);
    }
  }

  function bindControlEntity(entity: DiscoveredHomeAssistantEntity) {
    if (!discovery || !mappingChannel) return;
    const hint = config.legacyChannels.find((item) => item.channelId === mappingChannel);
    const area = discovery.areas.find((item) => item.areaId === entity.areaId);
    const relatedSensors = discovery.entities.filter(
      (candidate) => candidate.domain === "sensor"
        && candidate.deviceId !== ""
        && candidate.deviceId === entity.deviceId,
    );
    const binding: HomeAssistantBinding = {
      channelId: mappingChannel,
      name: hint?.name || entity.name || mappingChannel,
      zone: hint?.zone || area?.name || "",
      controlEntityId: entity.entityId as HomeAssistantBinding["controlEntityId"],
      powerEntityId: suggestSensor(relatedSensors, "power"),
      voltageEntityId: suggestSensor(relatedSensors, "voltage"),
      currentEntityId: suggestSensor(relatedSensors, "current"),
    };
    setConfig((current) => ({
      ...current,
      homeAssistant: {
        ...current.homeAssistant,
        defaultAreaId: areaFilter || current.homeAssistant.defaultAreaId,
        bindings: [
          ...current.homeAssistant.bindings.filter(
            (item) => item.channelId !== mappingChannel,
          ),
          binding,
        ].sort((a, b) => a.channelId.localeCompare(b.channelId)),
      },
    }));
    setMappingChannel(null);
    setMessage(`${mappingChannel} 已绑定 ${entity.entityId}，请保存并保持观察模式验证`);
  }

  function updateBinding(index: number, patch: Partial<HomeAssistantBinding>) {
    setConfig((current) => ({
      ...current,
      homeAssistant: {
        ...current.homeAssistant,
        bindings: current.homeAssistant.bindings.map((binding, itemIndex) =>
          itemIndex === index ? { ...binding, ...patch } : binding),
      },
    }));
  }

  function removeBinding(index: number) {
    setConfig((current) => ({
      ...current,
      homeAssistant: {
        ...current.homeAssistant,
        bindings: current.homeAssistant.bindings.filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      },
    }));
  }

  async function restart() {
    const desktop = (window as DesktopWindow).pitDesktop;
    if (!desktop) {
      setMessage("树莓派或浏览器部署请重启 pit-os 服务；旁路实例使用端口 3001");
      return;
    }
    await desktop.restartApplication();
  }

  const availableChannel = nextAvailableChannel(
    config.homeAssistant.bindings,
    config.legacyChannels.map((hint) => hint.channelId),
  );
  const hasError = /失败|无效|必须|禁止|错误/.test(message);

  return (
    <PitShell title="HOME ASSISTANT MIGRATION" active={7}>
      <Panel x={224} y={96} w={430} h={420} title="MQTT 配置" en="PIT DEVICES">
        <div className="pit-settings-form">
          <Field
            label="Broker URL"
            value={config.mqtt.url}
            onChange={(url) => setConfig({
              ...config,
              mqtt: { ...config.mqtt, url },
            })}
          />
          <Field
            label="用户名"
            value={config.mqtt.username}
            onChange={(username) => setConfig({
              ...config,
              mqtt: { ...config.mqtt, username },
            })}
          />
          <SecretField
            label="密码"
            value={config.mqtt.password}
            configured={config.mqtt.passwordConfigured}
            clear={config.mqtt.clearPassword === true}
            onChange={(password) => setConfig({
              ...config,
              mqtt: { ...config.mqtt, password, clearPassword: false },
            })}
            onClear={(clearPassword) => setConfig({
              ...config,
              mqtt: { ...config.mqtt, clearPassword },
            })}
          />
          <p className="pit-settings-note">
            MQTT 继续服务 ESP32、CAN、工具柜等 PIT 专用硬件，不作为 HA 映射通道的第二控制源。
          </p>
          <TestButton
            target="mqtt"
            testing={testing}
            result={testResults.mqtt}
            onTest={runTest}
          />
        </div>
      </Panel>

      <Panel x={670} y={96} w={760} h={420} title="Home Assistant" en="LOCAL DEVICE GATEWAY">
        <div className="pit-settings-form two-col">
          <HomeAssistantAddressFields value={haAddress} onChange={setHaAddress} />
          <label className="pit-settings-field">
            <span>运行模式</span>
            <select
              value={config.homeAssistant.mode}
              onChange={(event) => setConfig({
                ...config,
                homeAssistant: {
                  ...config.homeAssistant,
                  mode: event.target.value === "active" ? "active" : "observe",
                },
              })}
            >
              <option value="observe">观察 · 只读</option>
              <option value="active">活动 · 允许控制</option>
            </select>
          </label>
          <SecretField
            label={config.homeAssistant.tokenManagedByEnvironment
              ? "访问令牌 · 环境变量托管"
              : "长期访问令牌"}
            value={config.homeAssistant.accessToken}
            configured={config.homeAssistant.accessTokenConfigured}
            clear={config.homeAssistant.clearAccessToken === true}
            disabled={config.homeAssistant.tokenManagedByEnvironment}
            onChange={(accessToken) => setConfig({
              ...config,
              homeAssistant: {
                ...config.homeAssistant,
                accessToken,
                clearAccessToken: false,
              },
            })}
            onClear={(clearAccessToken) => setConfig({
              ...config,
              homeAssistant: { ...config.homeAssistant, clearAccessToken },
            })}
          />
          <Field
            label="默认区域 ID"
            value={config.homeAssistant.defaultAreaId}
            placeholder="发现后自动匹配亭子区域"
            onChange={(defaultAreaId) => setConfig({
              ...config,
              homeAssistant: { ...config.homeAssistant, defaultAreaId },
            })}
          />
          <TestButton
            target="home-assistant"
            testing={testing}
            result={testResults["home-assistant"]}
            onTest={runTest}
          />
          <button
            className="pit-settings-discover"
            type="button"
            disabled={discovering || loading}
            onClick={() => void discoverEntities(availableChannel ?? undefined)}
          >
            {discovering ? "正在发现实体..." : "发现区域与实体"}
          </button>
          <LocalNetworkSummary config={config} />
          <p className="pit-settings-note pit-settings-wide">
            面板路径 `/home/areas-ting_zi` 只作区域提示；修改 HA IP 或端口后必须重新输入令牌。
          </p>
        </div>
      </Panel>

      <Panel x={1446} y={96} w={434} h={420} title="迁移状态" en="CUTOVER">
        <div className="pit-settings-summary">
          <strong>
            {config.homeAssistant.mode === "active" ? "HA 已允许控制" : "HA 观察模式"}
          </strong>
          <code>{config.configPath || "尚未确定配置路径"}</code>
          <p>
            已映射 {config.homeAssistant.bindings.length}/8 个通道。
            {config.migrationRequired ? " 已读取旧米家通道名称，保存后升级为配置版本 2。" : ""}
          </p>
          <div className={`pit-settings-message ${hasError ? "error" : ""}`}>
            {message || "敏感字段留空会保留原值；修改 HA 地址必须重新输入令牌。"}
          </div>
          <button
            className="pit-settings-primary"
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
          >
            {saving ? "保存中..." : "保存全部配置"}
          </button>
          <button
            className="pit-settings-secondary"
            type="button"
            onClick={() => void restart()}
          >
            重启并应用
          </button>
        </div>
      </Panel>

      <Panel
        x={224}
        y={532}
        w={1656}
        h={504}
        title="Home Assistant 电源映射"
        en="CH1–CH8 · SINGLE SOURCE OF TRUTH"
      >
        <button
          className="pit-settings-add"
          type="button"
          disabled={!availableChannel || discovering}
          onClick={() => void discoverEntities(availableChannel ?? undefined)}
        >
          {availableChannel ? `+ 映射 ${availableChannel}` : "通道已满"}
        </button>
        <div className="pit-settings-outlets">
          {config.homeAssistant.bindings.map((binding, index) => (
            <BindingCard
              key={binding.channelId}
              binding={binding}
              index={index}
              discovery={discovery}
              onChange={updateBinding}
              onRemove={removeBinding}
              onRemap={(channelId) => void discoverEntities(channelId)}
            />
          ))}
          {config.homeAssistant.bindings.length === 0 ? (
            <div className="pit-settings-empty">
              尚未映射 Home Assistant 实体。保存令牌后点击“映射 CH1”开始。
            </div>
          ) : null}
        </div>
      </Panel>

      {discovery && mappingChannel ? (
        <div
          className="pit-discovery-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Home Assistant 实体发现结果"
        >
          <section className="pit-discovery-dialog">
            <header>
              <strong>为 {mappingChannel} 选择控制实体</strong>
              <span>默认筛选亭子区域；实体绑定后仍需保存并在观察模式验证</span>
              <button type="button" onClick={() => setMappingChannel(null)}>关闭</button>
            </header>
            <div className="pit-discovery-filters">
              <label>
                区域
                <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
                  <option value="">全部区域</option>
                  {discovery.areas.map((area) => (
                    <option key={area.areaId} value={area.areaId}>
                      {area.name} · {area.areaId}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                搜索
                <input
                  value={entitySearch}
                  placeholder="名称、entity_id 或平台"
                  onChange={(event) => setEntitySearch(event.target.value)}
                />
              </label>
            </div>
            <div className="pit-discovery-list">
              {filteredControlEntities.map((entity) => {
                const device = discovery.devices.find(
                  (item) => item.deviceId === entity.deviceId,
                );
                return (
                  <article key={entity.entityId}>
                    <i className={entity.available ? "online" : ""} />
                    <div>
                      <strong>{entity.name}</strong>
                      <span>{entity.entityId}</span>
                    </div>
                    <code>{entity.platform || "unknown"}</code>
                    <small>
                      {device
                        ? `${device.manufacturer || "未知厂商"} · ${device.model || device.name}`
                        : "未关联设备"}
                    </small>
                    <button type="button" onClick={() => bindControlEntity(entity)}>
                      绑定到 {mappingChannel}
                    </button>
                  </article>
                );
              })}
              {filteredControlEntities.length === 0 ? (
                <p>当前筛选条件下没有可控制的 switch 或 light 实体。</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </PitShell>
  );
}

function BindingCard({
  binding,
  index,
  discovery,
  onChange,
  onRemove,
  onRemap,
}: {
  binding: HomeAssistantBinding;
  index: number;
  discovery: HomeAssistantDiscoveryView | null;
  onChange(index: number, patch: Partial<HomeAssistantBinding>): void;
  onRemove(index: number): void;
  onRemap(channelId: PitChannelId): void;
}) {
  const sensorEntities = discovery?.entities.filter((entity) => entity.domain === "sensor") ?? [];
  return (
    <article className="pit-settings-outlet pit-settings-ha-binding">
      <header>
        <strong>{binding.channelId} · {binding.name}</strong>
        <button type="button" onClick={() => onRemove(index)}>删除</button>
      </header>
      <div className="pit-settings-outlet-grid">
        <Field
          label="名称"
          value={binding.name}
          onChange={(name) => onChange(index, { name })}
        />
        <Field
          label="区域"
          value={binding.zone}
          onChange={(zone) => onChange(index, { zone })}
        />
      </div>
      <EntityValue label="控制实体" value={binding.controlEntityId} />
      <div className="pit-settings-sensors">
        <SensorSelect
          label="功率"
          value={binding.powerEntityId}
          entities={sensorEntities}
          onChange={(powerEntityId) => onChange(index, { powerEntityId })}
        />
        <SensorSelect
          label="电压"
          value={binding.voltageEntityId}
          entities={sensorEntities}
          onChange={(voltageEntityId) => onChange(index, { voltageEntityId })}
        />
        <SensorSelect
          label="电流"
          value={binding.currentEntityId}
          entities={sensorEntities}
          onChange={(currentEntityId) => onChange(index, { currentEntityId })}
        />
      </div>
      <p className="pit-settings-binding-note">
        传感器在发现时按同一设备自动匹配；未配置或不可用时显示“—”，不会沿用旧读数。
      </p>
      <button
        type="button"
        className="pit-settings-remap"
        onClick={() => onRemap(binding.channelId)}
      >
        重新发现并映射
      </button>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="pit-settings-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function HomeAssistantAddressFields({
  value,
  onChange,
}: {
  value: HomeAssistantAddressDraft;
  onChange(value: HomeAssistantAddressDraft): void;
}) {
  return (
    <div className="pit-settings-address pit-settings-wide">
      <label className="pit-settings-field">
        <span>协议</span>
        <select
          value={value.protocol}
          onChange={(event) => {
            const protocol = event.target.value === "https" ? "https" : "http";
            const previousDefaultPort = value.protocol === "https" ? "443" : "80";
            onChange({
              ...value,
              protocol,
              port: value.port === previousDefaultPort
                ? protocol === "https" ? "443" : "80"
                : value.port,
            });
          }}
        >
          <option value="http">HTTP</option>
          <option value="https">HTTPS</option>
        </select>
      </label>
      <label className="pit-settings-field">
        <span>HA IP / 主机</span>
        <input
          value={value.host}
          placeholder="192.168.66.34"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => onChange({ ...value, host: event.target.value })}
        />
      </label>
      <label className="pit-settings-field">
        <span>端口</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={65_535}
          value={value.port}
          placeholder="8123"
          onChange={(event) => onChange({ ...value, port: event.target.value })}
        />
      </label>
    </div>
  );
}

function LocalNetworkSummary({ config }: { config: PitConfigView }) {
  const { hostname, ipv4Addresses, preferredIpv4 } = config.localNetwork;
  return (
    <div className="pit-settings-network pit-settings-wide">
      <span>本机内网 IPv4</span>
      <div>
        {ipv4Addresses.length ? ipv4Addresses.map((item) => (
          <code
            className={item.address === preferredIpv4 ? "preferred" : ""}
            key={`${item.interfaceName}-${item.address}`}
          >
            {item.address}
            <small>{item.interfaceName}</small>
          </code>
        )) : <em>未检测到可用的内网 IPv4 地址</em>}
      </div>
      {hostname ? <small>主机名：{hostname}</small> : null}
    </div>
  );
}

function SecretField({
  label,
  value,
  configured,
  clear,
  disabled = false,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  configured: boolean;
  clear: boolean;
  disabled?: boolean;
  onChange(value: string): void;
  onClear(value: boolean): void;
}) {
  return (
    <div className="pit-settings-secret">
      <label className="pit-settings-field">
        <span>{`${label}${configured ? " · 已配置" : ""}`}</span>
        <input
          type="password"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={clear}
          disabled={disabled}
          onChange={(event) => onClear(event.target.checked)}
        />
        清除
      </label>
    </div>
  );
}

function TestButton({
  target,
  testing,
  result,
  onTest,
}: {
  target: "mqtt" | "home-assistant";
  testing: string | null;
  result?: PitConfigTestResult;
  onTest(target: "mqtt" | "home-assistant"): void;
}) {
  return (
    <div className="pit-settings-test">
      <button type="button" disabled={testing !== null} onClick={() => onTest(target)}>
        {testing === target ? "测试中..." : "连接测试"}
      </button>
      {result ? (
        <span className={result.ok ? "ok" : "error"}>
          {result.message} · {result.latencyMs}ms
        </span>
      ) : (
        <span>请先保存，再执行测试</span>
      )}
    </div>
  );
}

function EntityValue({ label, value }: { label: string; value: string }) {
  return (
    <label className="pit-settings-field pit-settings-entity-value">
      <span>{label}</span>
      <code>{value}</code>
    </label>
  );
}

function SensorSelect({
  label,
  value,
  entities,
  onChange,
}: {
  label: string;
  value?: `sensor.${string}`;
  entities: DiscoveredHomeAssistantEntity[];
  onChange(value: `sensor.${string}` | undefined): void;
}) {
  const currentMissing = value && !entities.some((entity) => entity.entityId === value);
  return (
    <label className="pit-settings-field">
      <span>{label}传感器</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(
          event.target.value
            ? event.target.value as `sensor.${string}`
            : undefined,
        )}
      >
        <option value="">不配置</option>
        {currentMissing ? <option value={value}>{value}</option> : null}
        {entities.map((entity) => (
          <option key={entity.entityId} value={entity.entityId}>
            {entity.name} · {entity.unit || entity.entityId}
          </option>
        ))}
      </select>
    </label>
  );
}

function nextAvailableChannel(
  bindings: HomeAssistantBinding[],
  preferred: PitChannelId[] = [],
) {
  const used = new Set(bindings.map((binding) => binding.channelId));
  const preferredChannel = preferred.find((channelId) => !used.has(channelId));
  if (preferredChannel) return preferredChannel;
  return CHANNEL_IDS.find((channelId) => !used.has(channelId)) ?? null;
}

function suggestSensor(
  entities: DiscoveredHomeAssistantEntity[],
  kind: "power" | "voltage" | "current",
) {
  const units = {
    power: new Set(["w", "kw"]),
    voltage: new Set(["v", "mv"]),
    current: new Set(["a", "ma"]),
  }[kind];
  const match = entities.find((entity) =>
    entity.deviceClass.toLowerCase() === kind
    || units.has(entity.unit.trim().toLowerCase()),
  );
  return match?.entityId as `sensor.${string}` | undefined;
}
