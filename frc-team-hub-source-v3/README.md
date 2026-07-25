# PIT-OS // FRC 智能工具箱

面向 FRC 维修区（Pit）的智能工具箱控制面板，运行于**树莓派 5 + 22" 触摸屏**，配合两个 **ESP32 分控**实现工具/零件/电源/CAN 的实时监控。

终末地工业风 UI（深炭底 + 工业黄）。设备通过 WebSocket 长连接上报，服务端经 SSE 实时推送到面板；未接入数据源的功能统一显示“未配置”。

## 功能页面（`/pit`）

| 路由 | 功能 |
|---|---|
| `/pit` | 主控面板：下一场比赛、CAN 状态、电源通道、工具/零件摘要、CAD 查阅、赛程、LIVE 滚动条 |
| `/pit/tools` | 工具管理：10 工具位配置、明确借出/归还扫码、LED 定位与同步、持久化统计 |
| `/pit/parts` | 零件库存：U3-U6 储物单元、U4 格位 LED 引导、采购清单、工序临时托盘 |
| `/pit/can` | CAN 监控：总线健康卡、设备清单、拓扑图、串口日志（USB-CAN + TunerX） |
| `/pit/match` | 赛事信息：实时比分、下场倒计时、完整赛程、AI 云端战略分析 |
| `/pit/power` | 电源控制：ESP32 继电器或米家智能插座 3、总负载仪表、电池充电 |
| `/pit/team` | 战队展示：形象墙、机器能力、Pit Interview 流程清单 |
| `/pit/settings` | 测试管理：设备网关、Home Assistant、插座通道配置及连接测试 |

## 架构

```
树莓派 5 (Next.js UI + WebSocket device gateway + can-bridge + vision-scan)
   │ WebSocket over WiFi
   ├─ ESP32-A  16U 储存柜分控（HX711 称重×8 · WS2812 格位 LED ×64 · 门磁×8）
   └─ ESP32-B  电源配电箱分控（继电器×8 · ACS712 电流×8 · 电池电压×4 · DS18B20×2）

机器人 CAN 总线 → USB-CAN 适配器 → 树莓派 can-bridge → WebSocket
工具二维码     → Dabai DC RGB   → 树莓派 vision-scan → WebSocket
小米智能插座 → Home Assistant → REST API → Next.js
```

10 工具位配置、当前状态、扫码会话和最近事务保存在 `PIT_CONFIG_DIR/pit-tools.json`。扫码服务只发布原始二维码，主控完成状态校验后更新工具状态并向 ESP32 发布 retained LED 快照。

## 本地启动

```bash
npm install
npm run dev
# 打开 http://localhost:3000 → 自动跳转 /pit
```

默认无硬件时显示空态；设备建立长连接并上报后显示真实数据。

## Home Assistant 电源

先在 Home Assistant 中接入小米智能插座，然后在 `/pit/settings` 配置 HA URL 和长期访问令牌，点击“一键发现 HA 插座”并导入到 `CH1-CH8`。PIT-OS 通过 REST API 读取 `switch.*` 和可选 `sensor.*` 实体，并调用 `switch.turn_on/turn_off` 控制开关。

长期访问令牌仅保存在服务端 `PIT_CONFIG_DIR/pit-config.json`，不会返回浏览器。建议为 PIT-OS 创建专用 Home Assistant 用户和令牌。旧版小米配置会保留通道名称和区域，但需要重新绑定 HA 实体。

提交前运行：

```bash
npm run lint
npm test
npm run typecheck
npm run build
```

## 树莓派部署

无桌面环境的 Pi 5 kiosk 安装见 [`deploy/pi/README.md`](deploy/pi/README.md)。它使用 Raspberry Pi OS Lite、Linux ARM64 standalone、Cage 和系统 Chromium，不运行 Electron。

硬件服务见 [`hardware/README.md`](hardware/README.md)：系统拓扑、接线表、WebSocket/SocketCAN/systemd 部署和通道契约。

## 分控固件

- `hardware/firmware/esp32-a-cabinet/` — 储存柜（称重 + LED 寻物 + 门磁）
- `hardware/firmware/esp32-b-power/` — 配电箱（继电器 + 电流 + 电池 + 温度断电保护）
- `hardware/scripts/vision-scan.py` — 视觉扫码入库（OpenCV + pyzbar）
- `hardware/scripts/can-bridge.js` — CAN 转 WebSocket 桥（SocketCAN）
