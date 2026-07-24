# PIT-OS 硬件部署与接线方案

> 主控：**树莓派 5**（主工作台 22" 触摸屏）
> 分控：**ESP32-A**（16U 储存柜）、**ESP32-B**（电源配电箱）
> 通信：**MQTT over WiFi**（树莓派跑 Mosquitto Broker）
> 机器人 CAN：**USB-CAN 适配器 + TunerX**（SocketCAN）
> 工具识别：**视觉识别二维码标签**（不用 RFID）

---

## 1. 系统拓扑

```
                    ┌────────────────────────────────────┐
                    │         树莓派 5 (主控)              │
                    │  ┌──────────────────────────────┐  │
   22" 触摸屏 ◄────►│  │  Next.js (PIT-OS UI + API)   │  │
   (HDMI + USB 触摸) │  ├──────────────────────────────┤  │
                    │  │  Mosquitto MQTT Broker :1883 │  │
                    │  ├──────────────────────────────┤  │
                    │  │  can-bridge 服务 (SocketCAN)  │  │
                    │  └──────────────────────────────┘  │
                    │   USB-CAN 适配器 ──► 机器人 CAN 总线 │
                    └───────┬──────────────┬─────────────┘
                            │ MQTT/WiFi    │ MQTT/WiFi
              ┌─────────────▼───┐      ┌───▼──────────────┐
              │  ESP32-A 储存柜  │      │  ESP32-B 配电箱   │
              │  · 称重×8        │      │  · 8路继电器       │
              │  · 格位LED×64    │      │  · 8路电流检测     │
              │  · 柜门磁×8      │      │  · 电池电压×4      │
              │  · 摄像头(扫码)   │      │  · 温度×2         │
              └─────────────────┘      └──────────────────┘
```

**储物柜与主工作台分离**：两者之间只需一根网线（或纯 WiFi），ESP32-A 独立供电，可整体快拆搬运。

---

## 2. 树莓派 5 接线

| 外设 | 接口 | 说明 |
|---|---|---|
| 22" 触摸屏 | HDMI0 + USB-A（触摸） | 主显示 |
| USB-CAN 适配器 | USB-A 3.0 | 接机器人 CAN 总线（TalonFX/SparkMax/PDH）|
| 散热风扇 | 5V + GND（GPIO4/6）| 建议主动散热 |
| 电源 | USB-C PD 5V/5A | 官方电源 |
| 以太网（可选）| RJ45 | 接赛场网络拉取官方赛事 API |

### 树莓派 5 软件部署

```bash
# 1) 系统依赖
sudo apt update && sudo apt install -y mosquitto mosquitto-clients \
  can-utils nodejs npm git

# 2) MQTT Broker 允许本机连接
sudo tee /etc/mosquitto/conf.d/pit.conf <<'EOF'
listener 1883 0.0.0.0
allow_anonymous true
EOF
sudo systemctl enable --now mosquitto

# 3) CAN 接口（SocketCAN，USB-CAN 适配器）
sudo ip link set can0 up type can bitrate 1000000
sudo ip link set can0 up
ip -details link show can0   # 确认 UP

# 4) 项目
git clone <repo> frc-team-hub && cd frc-team-hub
npm ci && npm run build
PIT_MQTT_URL=mqtt://127.0.0.1:1883 npm run start -- --port 3000

# 5) 开机自启（systemd）
sudo tee /etc/systemd/system/pit-os.service <<'EOF'
[Unit]
Description=PIT-OS
After=network.target mosquitto.service
[Service]
WorkingDirectory=/home/pi/frc-team-hub
Environment=PIT_MQTT_URL=mqtt://127.0.0.1:1883
ExecStart=/usr/bin/npm run start -- --port 3000
Restart=always
User=pi
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now pit-os

# 6) 触摸屏开机全屏（Chromium kiosk）
# 在 autostart 中加入：
# chromium-browser --kiosk --app=http://localhost:3000/pit
```

---

## 3. ESP32-A（16U 储存柜分控）接线

主控建议 **ESP32-WROOM-32**（GPIO 较多）或 **ESP32-S3**。

| 功能 | 器件 | ESP32 引脚 | 说明 |
|---|---|---|---|
| 称重 ×8 | HX711 ×8 | DT= GPIO 32,33,25,26,27,14,12,13；SCK 共用 GPIO 15 | 8 个抽屉各 1 个 |
| 格位 LED ×64 | WS2812B 灯带 ×8 段 | DATA= GPIO 22（串联 64 颗）| 每格 1 颗，U1-U8 各 8 颗 |
| 柜门磁 ×8 | 干簧管 ×8 | GPIO 34,35,36,39,4,16,17,5 | 上拉输入 |
| 扫码摄像头 | ESP32-CAM 或 USB 摄像头接树莓派 | 见 §5 | 视觉识别二维码 |
| 电源 | 12V→5V 降压 | 5V 输入 | 建议 5V/4A |

**HX711 接线**（每个抽屉一组）：
- VCC → 5V，GND → GND
- DT → 对应 GPIO，SCK → GPIO15（共用）
- E+ / E− / A+ / A− → 称重传感器（5kg 梁式）四线

**WS2812B**：DATA 串联 64 颗，5V 独立供电（不可由 ESP32 的 5V 引脚直供大电流），共地。

---

## 4. ESP32-B（电源配电箱分控）接线

| 功能 | 器件 | ESP32 引脚 | 说明 |
|---|---|---|---|
| 继电器 ×8 | 8 路继电器模块（带光耦）| GPIO 23,22,21,19,18,5,17,16 | CH1–CH8 强电开关 |
| 电流检测 ×8 | ACS712-20A ×8 | ADC1: GPIO 36,39,34,35,32,33,25,26 | 串联在各路火线 |
| 电池电压 ×4 | 分压电阻 (100k+22k) | ADC1: GPIO 27,14,12,13 | 4 块机器人电池 |
| 温度 ×2 | DS18B20 ×2 | GPIO 4（单总线）| 箱内 + 充电区 |
| 电源 | 12V→5V 降压 | 5V/3A | 与继电器模块共地 |

**强电安全**：继电器模块的强电侧必须由有资质人员接线，8 路独立保险丝（每路 ≤16A），零火线分色，外壳接地。CH4（机器人调试电源）串接触器，满足"上场前 10 分钟自动上电"的安全逻辑。

---

## 5. 视觉识别二维码（工具入库）

替代 RFID：每件工具贴 **10×10mm 二维码贴纸**（内容 = 工具 ID，如 `TOOL-U1-03`）。

- 借还工位固定一个 **USB 摄像头**（罗技 C270 或 ESP32-CAM 模块）对准托盘；
- 树莓派跑 `vision-scan` 服务（Python + OpenCV + pyzbar），识别后：
  - 借出：该工具状态 → `out`，记录借出人（触摸屏确认）；
  - 归还：识别二维码 → 任意空位放入 → 该格称重变化 → 自动绑定新位号；
- 事件发布到 `pit/vision/scan`，前端借还工位实时显示。

```bash
sudo apt install -y python3-opencv python3-pip libzbar0
pip3 install pyzbar paho-mqtt
# 运行 scripts/vision-scan.py（见下方固件目录）
```

---

## 6. 机器人 CAN（USB-CAN + TunerX）

- 适配器：**CTRE CANivore** 或任意 SocketCAN 兼容 USB-CAN（如 CANable/PCAN）；
- 树莓派通过 SocketCAN 读取 FRC CAN 帧（TalonFX/SparkMax/PDH 心跳与遥测）；
- `can-bridge` 服务（Node/Python）解析设备 ID → 在线状态 / 延迟 / 温度，发布到 `pit/can/devices`；
- TunerX 用于现场标定与设备 ID 管理（笔记本 USB 直连时使用，与面板监控互补）。

---

## 7. MQTT Topic 契约

| Topic（上行 → 树莓派） | 载荷 | 来源 |
|---|---|---|
| `pit/esp32-a/tools/{slot}` | `{name,unit,state,who,time,qr}` | ESP32-A |
| `pit/esp32-a/units/{unit}` | `{name,note,status,level,pct}` | ESP32-A |
| `pit/esp32-a/compartments/{id}` | `{label,qty,state}` | ESP32-A |
| `pit/esp32-b/power/{ch}` | `{name,zone,volts,amps,watts,on}` | ESP32-B |
| `pit/esp32-b/battery/{id}` | `{pct,charging,volts}` | ESP32-B |
| `pit/esp32-b/env` | `{tempC,humidity}` | ESP32-B |
| `pit/can/devices` | `[{id,name,model,mech,on,latencyMs,tempC,lastHeartbeat}]` | can-bridge |
| `pit/vision/scan` | `{msg,kind}` | vision-scan |

| Topic（下行 → 分控） | 载荷 | 用途 |
|---|---|---|
| `pit/control/power/{ch}` | `{on}` | 继电器开关 |
| `pit/control/locate/{slot}` | `{blink:true}` | 格位 LED 闪烁寻物 |
| `pit/control/locate-unit/{unit}` | `{blink:true}` | 整单元 LED 提示 |

---

## 8. 分控固件

- `firmware/esp32-a-cabinet/` — 储存柜分控（HX711 ×8 + WS2812 ×64 + 门磁 ×8 + MQTT）
- `firmware/esp32-b-power/` — 配电箱分控（继电器 ×8 + ACS712 ×8 + 电池电压 ×4 + DS18B20 + MQTT）
- `scripts/vision-scan.py` — 视觉扫码服务（OpenCV + pyzbar + MQTT）
- `scripts/can-bridge.js` — CAN 转 MQTT 桥（SocketCAN + node-can）
