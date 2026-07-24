# PIT-OS // FRC 智能工具箱

面向 FRC 维修区（Pit）的智能工具箱控制面板，运行于**树莓派 5 + 22" 触摸屏**，配合两个 **ESP32 分控**实现工具/零件/电源/CAN 的实时监控。

终末地工业风 UI（深炭底 + 工业黄）。设备遥测通过 MQTT + SSE 实时推送；未接入数据源的功能统一显示“未配置”。

## 功能页面（`/pit`）

| 路由 | 功能 |
|---|---|
| `/pit` | 主控面板：下一场比赛、CAN 状态、电源通道、工具/零件摘要、CAD 查阅、赛程、LIVE 滚动条 |
| `/pit/tools` | 工具管理：16U 单元筛选、二维码绑定工具表、视觉扫码借还、今日统计 |
| `/pit/parts` | 零件库存：U3-U6 储物单元、U4 格位 LED 引导、采购清单、工序临时托盘 |
| `/pit/can` | CAN 监控：总线健康卡、设备清单、拓扑图、串口日志（USB-CAN + TunerX） |
| `/pit/match` | 赛事信息：实时比分、下场倒计时、完整赛程、AI 云端战略分析 |
| `/pit/power` | 电源控制：ESP32 继电器或米家智能插座 3、总负载仪表、电池充电 |
| `/pit/team` | 战队展示：形象墙、机器能力、Pit Interview 流程清单 |

## 架构

```
树莓派 5 (Next.js UI + Mosquitto MQTT Broker + can-bridge + vision-scan)
   │ MQTT over WiFi
   ├─ ESP32-A  16U 储存柜分控（HX711 称重×8 · WS2812 格位 LED ×64 · 门磁×8）
   └─ ESP32-B  电源配电箱分控（继电器×8 · ACS712 电流×8 · 电池电压×4 · DS18B20×2）

机器人 CAN 总线 → USB-CAN 适配器 → 树莓派 can-bridge → MQTT
工具二维码     → USB 摄像头     → 树莓派 vision-scan → MQTT
米家智能插座 3 → 局域网 MIoT（优先）/ 小米云（回退）→ Next.js
```

## 本地启动

```bash
npm install
npm run dev
# 打开 http://localhost:3000 → 自动跳转 /pit
```

默认无硬件时显示空态与 MQTT topic 提示；连接 Broker 并收到设备上报后显示真实数据。

## 米家智能插座 3

在 `.env.local` 中通过 `MIOT_OUTLETS_JSON` 把插座绑定到 `CH1-CH8`。每个插座可同时配置：

- `ip` + 32 位十六进制 `token`：局域网直连，优先使用。
- `did`：局域网失败时允许回退小米云。
- `model`：米家设备清单返回的真实型号。
- `power`、`watts`、`volts`、`amps`：对应型号的 MIoT `siid/piid` 与可选 `scale`。

`xiaomi.plug.mcn005` 常见映射：开关 `2/1`、当前功率 `3/2`。`chuangmi.plug.212a01` 常见映射：开关 `2/1`、功率 `5/6`、电流 `5/2`、电压 `5/3`。商品名不能唯一确定型号，请以账号设备清单和 `https://miot-spec.org/miot-spec-v2/` 返回结果为准。

云端回退可配置 `MIOT_CLOUD_USERNAME`、`MIOT_CLOUD_PASSWORD` 和 `MIOT_CLOUD_REGION`；启用二次验证的账号应配置 `MIOT_CLOUD_SESSION_JSON`。所有凭据仅供服务端使用，不要使用 `NEXT_PUBLIC_` 前缀。

提交前运行：

```bash
npm run lint
npm test
npm run typecheck
npm run build
```

## 树莓派部署

见 [`hardware/README.md`](hardware/README.md)：系统拓扑、接线表、Mosquitto/SocketCAN/systemd 部署脚本、MQTT topic 契约。

## 分控固件

- `hardware/firmware/esp32-a-cabinet/` — 储存柜（称重 + LED 寻物 + 门磁）
- `hardware/firmware/esp32-b-power/` — 配电箱（继电器 + 电流 + 电池 + 温度断电保护）
- `hardware/scripts/vision-scan.py` — 视觉扫码入库（OpenCV + pyzbar）
- `hardware/scripts/can-bridge.js` — CAN 转 MQTT 桥（SocketCAN）
