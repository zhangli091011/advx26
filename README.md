# PIT-OS

PIT-OS 是面向 FRC 维修区（Pit）的本地优先控制面板。系统运行在树莓派 5 或 Windows
桌面端，通过 MQTT、Home Assistant、SSE、SocketCAN 与视觉扫码聚合工具、零件、电源和
机器人状态。

## 当前能力

| 路由 | 能力 | 数据来源 |
| --- | --- | --- |
| `/pit` | 总览、连接状态、工具/零件/电源/CAN 摘要 | 聚合状态 |
| `/pit/tools` | 10 工具位配置、扫码借还、LED 定位与持久化统计 | JSON + MQTT |
| `/pit/parts` | 储物单元、格位库存与 LED 引导 | MQTT |
| `/pit/can` | CAN 总线健康、设备列表、拓扑与日志 | SocketCAN 桥接 |
| `/pit/match` | 比分、赛程与战略分析空态 | 待接入 |
| `/pit/power` | HA 电源实体或 ESP32 通道控制与遥测 | Home Assistant / MQTT |
| `/pit/team` | STEP 模型展示与团队资料空态 | 浏览器本地模型 |
| `/pit/settings` | MQTT、HA 连接、区域发现与 CH1–CH8 映射 | 本地配置 |

未配置的数据源会明确显示空态，不注入演示数据。

## 架构概览

```text
浏览器 / Electron
       │ HTTP + SSE
       ▼
Next.js UI 与 Route Handlers
       │
       ▼
PitHub 进程内状态中心
  ├─ Mosquitto MQTT ───── ESP32 / CAN bridge / vision scan
  ├─ Home Assistant ───── WebSocket 状态 / 服务调用
  ├─ ToolManager ──────── data/pit-tools.json
  └─ 配置存储 ─────────── data/pit-config.json
```

HA 映射通道以 Home Assistant 为唯一状态与控制来源；同名 MQTT 电源遥测会被忽略，
避免双重控制。详细说明见 [系统架构](docs/architecture.md)、[HA 迁移方案](docs/home-assistant-migration.md)
和 [项目洞察](docs/project-insights.md)。

## 开始开发

要求 Node.js 20.9 或更高版本。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`，首页会自动跳转到 `/pit`。无硬件时可正常启动并显示空态。
界面会随浏览器窗口实时调整：常规桌面完整居中缩放，窄屏或矮窗口保持最低可读比例并
启用触控/鼠标滚动。

提交前执行：

```bash
npm run check
```

## Home Assistant 配置

默认接口基址为 `http://192.168.66.34:8123`。`/home/areas-ting_zi` 是面板路径，
不是 API 地址或可信的区域 ID。

1. 在 HA 中为 PIT-OS 创建专用、非管理员用户和长期访问令牌。
2. 在 `/pit/settings` 保存地址和令牌，保持“观察”模式。
3. 发现真实区域和实体，将 `switch.*` 或 `light.*` 映射到 CH1–CH8。
4. 可选绑定同一设备的功率、电压、电流 `sensor.*`。
5. 观察验证完成后切换到“活动”模式并重启。

也可使用 `HOME_ASSISTANT_ACCESS_TOKEN` 托管令牌。环境变量令牌优先于配置文件，且设置
页不能修改地址后继续复用该令牌。完整步骤和回退流程见
[迁移方案](docs/home-assistant-migration.md)。

## 配置与数据

- `.env.example`：环境变量模板；本地配置写入 `.env.local`，禁止提交真实凭据。
- `PIT_CONFIG_DIR`：运行时配置目录；默认 `data/`，树莓派建议 `/var/lib/pit-os`。
- `pit-config.json`：配置版本 2，权限为 `0600`；GET API 永不返回 MQTT 密码或 HA 令牌。
- `HOME_ASSISTANT_BINDINGS_JSON`：可选的服务端启动映射，通常由设置页生成。

所有 MQTT 与 Home Assistant 凭据只能使用服务端变量，不能使用 `NEXT_PUBLIC_` 前缀。

## 部署与发布

- 树莓派、MQTT、SocketCAN、扫码服务和固件接线见
  [硬件部署说明](hardware/README.md)。
- OTA Nginx 配置位于 `deploy/`。
- Electron 打包脚本位于 `scripts/`，Windows 入口位于 `scripts/windows/`。
- `npm run desktop:build` 构建安装包但不上传；`npm run desktop:publish` 发布已有安装包。

## 仓库结构

```text
.
├── deploy/               # OTA 部署配置
├── docs/                 # 架构、迁移、洞察、开发规范与产品资料
├── electron/             # Electron 主进程与安全预加载桥
├── hardware/             # ESP32 固件、边缘脚本和硬件部署说明
├── public/               # 浏览器静态资源与 STEP 导入 WASM
├── scripts/              # 桌面构建、打包和发布工具
├── src/                  # Next.js 应用、组件、领域逻辑和类型
└── tests/                # Node.js 单元测试
```

文档入口见 [docs/README.md](docs/README.md)。
