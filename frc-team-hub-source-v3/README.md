# PIT-OS // FRC 智能工具箱

面向 FRC 维修区（Pit）的智能工具箱控制面板，运行于**树莓派 5 + 22" 触摸屏**，配合两个 **ESP32 分控**实现工具/零件/电源/CAN 的实时监控。

终末地工业风 UI（深炭底 + 工业黄），7 个页面全部真实数据驱动（MQTT + SSE 实时推送）。

## 功能页面（`/pit`）

| 路由 | 功能 |
|---|---|
| `/pit` | 主控面板：下一场比赛、CAN 状态、电源通道、工具/零件摘要、CAD 查阅、赛程、LIVE 滚动条 |
| `/pit/tools` | 工具管理：16U 单元筛选、二维码绑定工具表、视觉扫码借还、今日统计 |
| `/pit/parts` | 零件库存：U3-U6 储物单元、U4 格位 LED 引导、采购清单、工序临时托盘 |
| `/pit/can` | CAN 监控：总线健康卡、设备清单、拓扑图、串口日志（USB-CAN + TunerX） |
| `/pit/match` | 赛事信息：实时比分、下场倒计时、完整赛程、AI 云端战略分析 |
| `/pit/power` | 电源控制：8 路远程开关、总负载仪表、电池充电、安全自动化 |
| `/pit/team` | 战队展示：形象墙、机器能力、Pit Interview 流程清单 |

## 架构

```
树莓派 5 (Next.js UI + Mosquitto MQTT Broker + can-bridge + vision-scan)
   │ MQTT over WiFi
   ├─ ESP32-A  16U 储存柜分控（HX711 称重×8 · WS2812 格位 LED ×64 · 门磁×8）
   └─ ESP32-B  电源配电箱分控（继电器×8 · ACS712 电流×8 · 电池电压×4 · DS18B20×2）

机器人 CAN 总线 → USB-CAN 适配器 → 树莓派 can-bridge → MQTT
工具二维码     → USB 摄像头     → 树莓派 vision-scan → MQTT
```

## 本地启动

```bash
npm install
npm run dev
# 打开 http://localhost:3000 → 自动跳转 /pit
```

无硬件时面板显示空态与 MQTT topic 提示；连接 Broker 后数秒内切换为真实数据。

## 树莓派部署

见 [`hardware/README.md`](hardware/README.md)：系统拓扑、接线表、Mosquitto/SocketCAN/systemd 部署脚本、MQTT topic 契约。

## 分控固件

- `hardware/firmware/esp32-a-cabinet/` — 储存柜（称重 + LED 寻物 + 门磁）
- `hardware/firmware/esp32-b-power/` — 配电箱（继电器 + 电流 + 电池 + 温度断电保护）
- `hardware/scripts/vision-scan.py` — 视觉扫码入库（OpenCV + pyzbar）
- `hardware/scripts/can-bridge.js` — CAN 转 MQTT 桥（SocketCAN）
