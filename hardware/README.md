# PIT-OS 硬件部署与接线方案

> 主控：**树莓派 5**（主工作台 22" 触摸屏）
> 分控：**ESP32-A**（16U 储存柜）、**ESP32-B**（电源配电箱）
> 通信：**WebSocket 长连接 over WiFi**（树莓派运行认证设备网关）
> 机器人 CAN：**ESP32-S3 + SN65HVD230**（TWAI 只监听探针）
> 工具识别：**视觉识别二维码标签**（不用 RFID）

---

## 1. 系统拓扑

```
                    ┌────────────────────────────────────┐
                    │         树莓派 5 (主控)              │
                    │  ┌──────────────────────────────┐  │
   22" 触摸屏 ◄────►│  │  Next.js (PIT-OS UI + API)   │  │
   (HDMI + USB 触摸) │  ├──────────────────────────────┤  │
                    │  │  WebSocket Device Gateway   │  │
                    │  └──────────────────────────────┘  │
                    └───────┬──────────────┬─────────────┘
                             │ WebSocket    │ WebSocket
        ┌──────▼────────────┐ ┌──▼──────────────┐ ┌───────────────┐
        │ ESP32 工具抽屉分控  │ │ ESP32-A 零件柜  │ │ ESP32-B 配电箱 │
        │ · 5 抽屉指示灯      │ │ · 称重/格位 LED │ │ · 电源与电池   │
        └───────────────────┘ └─────────────────┘ └───────────────┘
                              │ WebSocket
                     ┌────────▼────────────┐
                     │ ESP32-S3 CAN 探针    │
                     │ SN65HVD230 → CAN    │
                     └─────────────────────┘
扫码摄像头直接连接树莓派；工具抽屉分控只负责 5 颗抽屉指示灯。
```

**储物柜与主工作台分离**：两者之间只需一根网线（或纯 WiFi），ESP32-A 独立供电，可整体快拆搬运。

---

## 2. 树莓派 5 接线

| 外设 | 接口 | 说明 |
|---|---|---|
| 22" 触摸屏 | HDMI0 + USB-A（触摸） | 主显示 |
| 散热风扇 | 5V + GND（GPIO4/6）| 建议主动散热 |
| 电源 | USB-C PD 5V/5A | 官方电源 |
| 以太网（可选）| RJ45 | 接赛场网络拉取官方赛事 API |

### 树莓派 5 软件部署

```bash
# 1) 系统依赖
sudo apt update && sudo apt install -y can-utils nodejs npm git

# 2) 使用 deploy/pi/install.sh 安装认证设备网关、Next.js 和 kiosk
# 网关监听 8765，token 自动写入 /etc/pit-os/gateway.env

# 3) 项目
git clone <repo> frc-team-hub && cd frc-team-hub
npm ci && npm run build
PIT_GATEWAY_URL=ws://127.0.0.1:8765 \
PIT_GATEWAY_TOKEN='<与 /etc/pit-os/gateway.env 一致>' npm run start -- --port 3000

# 4) 开机自启（systemd）
sudo tee /etc/systemd/system/pit-os.service <<'EOF'
[Unit]
Description=PIT-OS
After=network.target pit-device-gateway.service
[Service]
WorkingDirectory=/home/pi/frc-team-hub
Environment=PIT_GATEWAY_URL=ws://127.0.0.1:8765
EnvironmentFile=/etc/pit-os/gateway.env
Environment=PIT_CONFIG_DIR=/var/lib/pit-os
ExecStart=/usr/bin/npm run start -- --port 3000
Restart=always
User=pi
[Install]
WantedBy=multi-user.target
EOF
sudo install -d -o pi -g pi -m 0700 /var/lib/pit-os
sudo systemctl enable --now pit-os

# 5) 触摸屏开机全屏（Chromium kiosk）
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

## 5. 五抽屉工具指示灯控制器

生产固件：`firmware/esp32-toolbox-5drawer/esp32-toolbox-5drawer.ino`

如果只测试 5 颗灯珠和接线，不连接 Wi-Fi/WebSocket，请先烧录：

```text
firmware/esp32-5led-test/esp32-5led-test.ino
```

该测试固件不需要任何第三方库，使用 GPIO13、14、16、17、18。它会逐颗点亮 0.8 秒，再让 5 颗同时点亮 2 秒，最后全部熄灭 1 秒。

系统固定 5 个物理抽屉，每个抽屉可登记多件独立工具。每件工具绑定一个二维码，但同一抽屉共用一颗定位/状态灯：

| 灯位 | 抽屉 | ESP32 GPIO |
|---:|---|---:|
| 1 | D1 | 13 |
| 2 | D2 | 14 |
| 3 | D3 | 16 |
| 4 | D4 | 17 |
| 5 | D5 | 18 |

每路接线：`GPIO → 330Ω 电阻 → LED 正极`，LED 负极接 GND。建议每颗控制在 3–5mA；如果灯珠工作电流更大，应增加三极管、MOSFET 或 PCA9685 驱动，不能由 ESP32 GPIO 直接供电。

五路完整接线：

```text
GPIO13 → 330Ω → LED1 长脚（正极）
LED1 短脚（负极）→ GND

GPIO14 → 330Ω → LED2 长脚（正极）
LED2 短脚（负极）→ GND

GPIO16 → 330Ω → LED3 长脚（正极）
LED3 短脚（负极）→ GND

GPIO17 → 330Ω → LED4 长脚（正极）
LED4 短脚（负极）→ GND

GPIO18 → 330Ω → LED5 长脚（正极）
LED5 短脚（负极）→ GND
```

ESP32 通过 USB 供电即可，不要把 LED 正极接 5V。五颗 LED 可以共用 GND，但必须各自使用一个 330Ω 电阻。GPIO34–39 仅输入，本方案不使用；GPIO0、2、12、15 是启动相关引脚，也不用于抽屉灯。

Arduino 库：

```text
ArduinoWebsockets
ArduinoJson
```

灯态按抽屉内全部工具聚合：抽屉无工具时熄灭；全部在库时常亮；任一工具借出时慢闪；任一工具未归还时快闪；点击某件工具定位时，其所属抽屉快闪 15 秒。

上电自检顺序：LED1–LED5 依次点亮 0.35 秒、五灯同时点亮 0.7 秒、全部熄灭。自检无需网关已在线；如果自检不正确，应先检查极性、电阻和 GND。

客户端测试配置示例：

```text
D1：活动扳手，二维码=TOOL-WRENCH-01
D1：尖嘴钳，二维码=TOOL-PLIERS-01
D2：电动螺丝刀，二维码=TOOL-DRIVER-01
D3-D5：可继续添加任意数量工具
```

测试步骤：先点击“同步抽屉灯”，有工具且全部在库的抽屉应常亮；点击任意工具的“定位抽屉”，其所属抽屉灯应快闪 15 秒；点击“借出扫码”并扫描二维码后，该抽屉灯慢闪；点击“归还扫码”并再次扫描后恢复常亮。

工具抽屉控制器只订阅 `pit/control/toolbox/#`。ESP32-A 零件柜订阅自己的格位与单元定位通道；工具定位使用独立的 `pit/control/toolbox/locate/{drawer}`，两者不会同时响应。

---

## 6. 视觉识别二维码（工具出入库）

替代 RFID：每件工具贴独立二维码贴纸（建议至少 **15×15mm**，内容如 `TOOL-WRENCH-01`）。工具在系统中分配到 D1-D5 之一；扫码相机使用 Orbbec Dabai DC 的 RGB UVC/V4L2 节点，不使用深度流。

- 借还工位固定一个 USB 摄像头；
- 在客户端先选择“借出”或“归还”，再扫描二维码；
- `vision-scan` 只发布原始扫码事件，不自行翻转工具状态；
- 主控将状态持久化到 `PIT_CONFIG_DIR/pit-tools.json`，成功后自动同步 5 个抽屉 LED。

```bash
sudo apt install -y python3-opencv python3-websocket v4l-utils
lsusb | grep -i -E '2bc5|orbbec'
v4l2-ctl --list-devices
ls -l /dev/v4l/by-id /dev/v4l/by-path
v4l2-ctl --device=/dev/videoN --list-formats-ext
```

标准 Pi 安装器会安装扫码依赖、脚本和 systemd 服务。找到支持 RGB/MJPEG/YUYV 的彩色节点后，优先使用稳定路径而不是 `/dev/video0`，编辑 `/etc/pit-os/vision-scan.env` 设置 `PIT_CAMERA_DEVICE=/dev/v4l/by-id/...`：

```bash
sudo systemctl restart pit-vision-scan
sudo journalctl -u pit-vision-scan -f
```

确认 `PIT_TOOL_STATION_ID=main` 与 PIT-OS 环境变量一致。相机只在客户端点击“借出”或“归还”后 60 秒会话内扫码；空闲时二维码不会改变工具状态。USB 断开后服务会标记未就绪并自动重开。

---

## 7. 机器人 CAN（ESP32-S3 只监听探针）

### 7.1 推荐器件

| 器件 | 数量 | 说明 |
|---|---:|---|
| ESP32-S3 DevKitC-1 | 1 | 使用片上 TWAI 控制器，Wi-Fi 连接 PIT-OS |
| SN65HVD230 CAN 收发器模块 | 1 | 必须是 3.3V 逻辑版本，不要使用 5V TJA1050 模块 |
| 2 芯双绞线 | 1 | CAN-H/CAN-L；FRC 常用黄色 CAN-H、绿色 CAN-L |
| USB 5V 电源 | 1 | 给 ESP32-S3 供电，不从机器人 CAN 线取电 |

固件：`firmware/esp32-s3-can-monitor/esp32-s3-can-monitor.ino`。使用 Arduino ESP32 core 自带 TWAI 驱动，另需 `ArduinoWebsockets` 和 `ArduinoJson`。

SN65HVD230 适合维修区原型和短线测试；长期装车建议改用带数字隔离和隔离电源的 3.3V CAN 模块。自制 CAN 探针是否允许随机器人正式上场必须按当季 FRC 规则和检查要求确认，未确认前应只在 PIT 使用并在上场前拆除。

### 7.2 ESP32-S3 到 SN65HVD230 接线

| ESP32-S3 | SN65HVD230 | 说明 |
|---|---|---|
| `3V3` | `VCC` | 仅 3.3V；不要接 5V |
| `GND` | `GND` | 逻辑地，同时接机器人控制系统公共地 |
| `GPIO5` | `D` / `TXD` | TWAI TX；监听模式下不会主动发送 CAN 帧 |
| `GPIO4` | `R` / `RXD` | TWAI RX |
| `GND` | `RS` | 高速模式；模块已固定下拉时无需重复连接 |
| - | `CANH` | 接机器人黄色 CAN-H |
| - | `CANL` | 接机器人绿色 CAN-L |

```text
ESP32-S3                 SN65HVD230                 FRC CAN
3V3  -----------------> VCC
GND  -----------------> GND ---------------------> Robot GND
GPIO5 (TWAI TX) ------> D / TXD
GPIO4 (TWAI RX) <------ R / RXD
GND  -----------------> RS
                         CANH ---------------------> Yellow CAN-H
                         CANL ---------------------> Green CAN-L
```

### 7.3 接入总线

- 探针以短支线并联到现有 CAN 主干，建议支线不超过 30 cm。
- 机器人断电后，CAN-H 与 CAN-L 之间应约为 60Ω，表示总线两端各有一个 120Ω 终端。
- **探针位于主干中间时，SN65HVD230 模块上的 120Ω 电阻必须拆除或断开。** 常见标记为 `R120`、`121` 或 `TERM` 跳帽。
- 只有独立台架中探针位于物理总线末端时才启用 120Ω；不能让总线出现第三个终端。
- 先断开机器人主电源完成接线并测量 H-L 电阻，再上电。CAN-H/CAN-L 接反时不会得到有效帧。
- 固件使用 `TWAI_MODE_LISTEN_ONLY`，不会发送 ACK、错误帧或业务帧。不要改成 normal mode，除非另行完成发送权限和 FRC 安全评审。

### 7.4 烧录配置

修改固件顶部的 `WIFI_SSID`、`WIFI_PASS`、`GATEWAY_URL`、`GATEWAY_TOKEN` 和 `DEVICES`。其中 token 来自树莓派 `/etc/pit-os/gateway.env`，设备表必须与机器人真实 CAN ID 对应。

Arduino IDE 选择对应 ESP32-S3 开发板，安装依赖后烧录，串口波特率为 `115200`。正常启动会显示：

```text
TWAI listen-only started: RX=4 TX=5 1Mbps
```

浏览器打开 `/pit/can`，应在 2 秒内看到探针状态、总线负载、帧率、累计接收帧、接收丢帧、控制器错误和设备在线表。温度列保持 `—`，因为被动探针不能通用解析不同厂商的私有温度帧。

TunerX/REV Hardware Client 仍用于设备配置、固件升级和厂商级诊断；ESP32-S3 探针只负责常驻被动监控。

### 7.5 USB 串口调试与监测

优先直接使用 ESP32-S3 开发板的 USB 口，不需要额外连接 UART 线：

```text
电脑 USB-A/USB-C ──数据线── ESP32-S3 USB/UART 或 USB 端口
```

Arduino IDE 建议设置：

```text
USB CDC On Boot: Enabled
Serial Monitor: 115200 baud, 8 data bits, no parity, 1 stop bit
Line ending: Newline 或 Both NL & CR
```

带 CH340/CP2102 的开发板连接标注 `UART` 的 USB 口；使用原生 USB CDC 时连接原生 USB 口并启用 `USB CDC On Boot`。不要把外部 USB-TTL 模块接到 GPIO4/GPIO5，这两个引脚已用于 TWAI CAN。

| 本地命令 | 功能 |
|---|---|
| `help` | 显示命令列表 |
| `status` | 显示探针、TWAI、Wi-Fi 和网关状态 |
| `stats` | 显示累计帧、丢帧和控制器错误 |
| `devices` | 显示配置设备及最后心跳时间 |
| `trace 10` | 抓取接下来 10 个原始 CAN 帧到 USB 串口，允许 1–100 |
| `clear` | 清零串口命令数和输出行数 |
| `log 检查左驱动` | 写入人工调试标记并镜像到 PIT-OS |
| `reboot` | 重启探针，仅本地 USB 串口允许 |

原始帧示例：

```text
[    128432] FRAME EXT ID=0x02040141 DLC=8 DATA=01 00 7F 22 00 00 10 A4
```

网页 `/pit/can` 提供固定白名单按钮：状态、统计、设备、抓取 10 帧、清零。网页不能执行任意文本或远程重启。原始帧只输出到本地 USB 串口，网页仅显示抓取开始与完成事件，避免逐帧转发拖慢 CAN 采集。

---

## 8. WebSocket 通道契约

| Topic（上行 → 树莓派） | 载荷 | 来源 |
|---|---|---|
| `pit/esp32-a/units/{unit}` | `{name,note,status,level,pct}` | ESP32-A |
| `pit/esp32-a/compartments/{id}` | `{label,qty,state}` | ESP32-A |
| `pit/esp32-b/power/{ch}` | `{name,zone,volts,amps,watts,on}` | ESP32-B |
| `pit/esp32-b/battery/{id}` | `{pct,charging,volts}` | ESP32-B |
| `pit/esp32-b/env` | `{tempC,humidity}` | ESP32-B |
| `pit/can/devices` | `[{id,name,model,mech,on,latencyMs,tempC,lastHeartbeat}]` | ESP32-S3 CAN 探针 / 旧 can-bridge |
| `pit/can/status` | `{...,serialConnected,serialBaud,serialCommands,serialLines,lastSerialActivityAt,updatedAt}` | ESP32-S3 CAN 探针 |
| `pit/can/log` | `{at,level,source,message}` | ESP32-S3 CAN 探针 |
| `pit/vision/status/{stationId}` | `{online,ready,device,width,height,error,updatedAt}`，retained | vision-scan |
| `pit/vision/scan` | `{scanId,sessionId,qr,stationId,capturedAt}`，非 retained | vision-scan |
| `pit/toolbox/status` | `online` / `offline` | 5 抽屉灯控制器在线状态 |
| `pit/toolbox/tool-leds/status` | `{revision,applied,drawerCount:5}` | 5 抽屉灯控制器 |

| Topic（下行 → 分控） | 载荷 | 用途 |
|---|---|---|
| `pit/control/power/{ch}` | `{on}` | 继电器开关 |
| `pit/control/toolbox/locate/{drawer}` | `{blink:true}` | D1-D5 抽屉 LED 闪烁寻物 |
| `pit/control/locate-unit/{unit}` | `{blink:true}` | 整单元 LED 提示 |
| `pit/control/toolbox/tool-leds` | `{revision,drawerCount:5,drawers:[{ledIndex,drawer,state,toolCount}]}`，retained | 5 抽屉完整状态快照 |
| `pit/control/vision/session/{stationId}` | `{sessionId,operation,createdAt,expiresAt}`，retained；完成后清除 | Dabai DC 扫码会话 |
| `pit/control/can/serial` | `{command:"status|stats|devices|trace-10|clear"}` | ESP32-S3 远程串口白名单命令 |

---

## 9. 分控固件

- `firmware/esp32-a-cabinet/` — 储存柜分控（HX711 ×8 + WS2812 ×64 + 门磁 ×8 + WebSocket）
- `firmware/esp32-toolbox-5drawer/` — 5 抽屉普通 LED 控制器（GPIO13/14/16/17/18）
- `firmware/esp32-b-power/` — 配电箱分控（继电器 ×8 + ACS712 ×8 + 电池电压 ×4 + DS18B20 + WebSocket）
- `firmware/esp32-s3-can-monitor/` — 1 Mbps TWAI 只监听 CAN 探针（SN65HVD230 + WebSocket）
- `scripts/vision-scan.py` — 视觉扫码服务（OpenCV + pyzbar + WebSocket）
- `scripts/can-bridge.js` — 旧 USB-CAN/SocketCAN 兼容桥，ESP32-S3 方案不需要运行

ESP32 固件依赖 `ArduinoWebsockets` 和 `ArduinoJson`。烧录前将 `GATEWAY_URL` 指向树莓派 `8765`，并将 `GATEWAY_TOKEN` 设置为 `/etc/pit-os/gateway.env` 中的 token。

同一 Dabai DC RGB 节点不能由扫码器和独立 FFmpeg 进程同时打开。RTMP 功能由 `vision-scan.py` 保持唯一 V4L2 所有权，并把已采集帧通过容量为 1 的后台队列送入 FFmpeg。`PIT_CAMERA_RTMP_URL` 为空可完全禁用推流；推流失败不会终止扫码。
