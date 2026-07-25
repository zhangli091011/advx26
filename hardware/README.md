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

# 2) MQTT Broker 账号和最小 Topic 权限
sudo mosquitto_passwd -c /etc/mosquitto/passwd pit-device
sudo tee /etc/mosquitto/acl <<'EOF'
user pit-device
topic readwrite pit/#
EOF
sudo tee /etc/mosquitto/conf.d/pit.conf <<'EOF'
listener 1883 0.0.0.0
allow_anonymous false
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl
EOF
sudo systemctl enable --now mosquitto

# 3) CAN 接口（SocketCAN，USB-CAN 适配器）
sudo ip link set can0 up type can bitrate 1000000
sudo ip link set can0 up
ip -details link show can0   # 确认 UP

# 4) 项目
git clone --branch dev https://github.com/zhangli091011/advx26.git pit-os && cd pit-os
npm ci && npm run build
PIT_MQTT_URL=mqtt://127.0.0.1:1883 \
PIT_MQTT_USERNAME=pit-device PIT_MQTT_PASSWORD='<部署密码>' npm run start -- --port 3000

# 5) 开机自启（systemd）
sudo tee /etc/systemd/system/pit-os.service <<'EOF'
[Unit]
Description=PIT-OS
After=network.target mosquitto.service
[Service]
WorkingDirectory=/home/pi/pit-os
Environment=PIT_MQTT_URL=mqtt://127.0.0.1:1883
Environment=PIT_MQTT_USERNAME=pit-device
Environment=PIT_MQTT_PASSWORD=<部署密码>
Environment=PIT_CONFIG_DIR=/var/lib/pit-os
ExecStart=/usr/bin/npm run start -- --port 3000
Restart=always
User=pi
[Install]
WantedBy=multi-user.target
EOF
sudo install -d -o pi -g pi -m 0700 /var/lib/pit-os
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

软件保护不能代替保险丝、接触器和急停。当前固件实现每路 `>16A` 断电及箱内 `>60°C` 全通道断电；赛前自动上电和离场模式尚未实现。

### 3.1 两颗普通 LED 测试模式

固件：`firmware/esp32-toolbox-10led/esp32-toolbox-10led.ino`

当前固件保持系统 10 工具位协议，但只驱动前两颗普通单色 LED，便于先完成台架测试：

| 灯位 | 工具位 | ESP32 GPIO |
|---:|---|---:|
| 1 | U1-01 | 13 |
| 2 | U1-02 | 14 |

每路接线：`GPIO → 330Ω 电阻 → LED 正极`，LED 负极接 GND。建议每颗控制在 3–5mA；如果灯珠工作电流更大，应增加三极管、MOSFET 或 PCA9685 驱动，不能由 ESP32 GPIO 直接供电。

两灯完整接线：

```text
GPIO13 → 330Ω → LED1 长脚（正极）
LED1 短脚（负极）→ GND

GPIO14 → 330Ω → LED2 长脚（正极）
LED2 短脚（负极）→ GND
```

ESP32 通过 USB 供电即可，不要把 LED 正极接 5V。两颗 LED 可以共用 GND，但必须各自使用一个 330Ω 电阻。

Arduino 库：

```text
PubSubClient
ArduinoJson
```

灯态：未配置熄灭，在位常亮，借出慢闪，遗失快闪，定位快闪 15 秒。客户端只配置 `U1-01` 和 `U1-02`，其余 8 位保持停用。

上电自检顺序：LED1 点亮 0.5 秒、LED2 点亮 0.5 秒、两灯同时点亮 0.7 秒、全部熄灭。自检无需 Wi-Fi 或 MQTT；如果自检不正确，应先检查极性、电阻和 GND。

客户端测试配置：

```text
U1-01：启用，工具名称=测试工具1，二维码=TOOL-U1-01
U1-02：启用，工具名称=测试工具2，二维码=TOOL-U1-02
U1-03 至 U1-10：停用
```

测试步骤：先点击“同步 LED”，在位状态应两灯常亮；分别点击工具的“定位”，对应灯应快闪 15 秒；点击“借出”并扫描对应二维码后，该灯慢闪；点击“归还”并再次扫描后恢复常亮。

测试通过后扩展到 10 颗时，将固件中的 `PHYSICAL_LED_COUNT` 改为 `10`，并把 `LED_PINS` 恢复为 `{13,14,16,17,18,19,21,22,23,25}`。

---

## 5. 视觉识别二维码（工具入库）

替代 RFID：每件工具贴 **10×10mm 二维码贴纸**（内容 = 工具 ID，如 `TOOL-U1-03`）。

- 借还工位固定一个 USB 摄像头；
- 在客户端先选择“借出”或“归还”，再扫描二维码；
- `vision-scan` 只发布原始扫码事件，不自行翻转工具状态；
- 主控将状态持久化到 `PIT_CONFIG_DIR/pit-tools.json`，成功后自动同步 10 个 LED。

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
| `pit/vision/scan` | `{scanId,qr,stationId,capturedAt}`，非 retained | vision-scan |
| `pit/toolbox/status` | `online` / `offline` | 10 LED 控制器独立在线状态 |
| `pit/toolbox/tool-leds/status` | `{revision,applied}` | 10 LED 控制器 |

| Topic（下行 → 分控） | 载荷 | 用途 |
|---|---|---|
| `pit/control/power/{ch}` | `{on}` | 继电器开关 |
| `pit/control/locate/{slot}` | `{blink:true}` | 格位 LED 闪烁寻物 |
| `pit/control/locate-unit/{unit}` | `{blink:true}` | 整单元 LED 提示 |
| `pit/control/toolbox/tool-leds` | `{revision,slots:[{ledIndex,slot,state}]}`，retained | 10 LED 完整状态快照 |

---

## 8. 分控固件

- `firmware/esp32-a-cabinet/` — 储存柜分控（HX711 ×8 + WS2812 ×64 + 门磁 ×8 + MQTT）
- `firmware/esp32-toolbox-10led/` — 当前为两颗普通 LED 台架测试固件，协议兼容后续 10 位扩展
- `firmware/esp32-b-power/` — 配电箱分控（继电器 ×8 + ACS712 ×8 + 电池电压 ×4 + DS18B20 + MQTT）
- `scripts/vision-scan.py` — 视觉扫码服务（OpenCV + pyzbar + MQTT）
- `scripts/can-bridge.js` — CAN 转 MQTT 桥（SocketCAN + node-can）
