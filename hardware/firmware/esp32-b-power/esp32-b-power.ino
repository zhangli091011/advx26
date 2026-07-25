/*
 * PIT-OS ESP32-B — 电源配电箱分控
 * 功能：8 路继电器 + 8 路 ACS712 电流检测 + 4 路电池电压 + DS18B20 温度 ×2
 * 通信：WiFi → WebSocket 设备网关（树莓派 5）
 */
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
using namespace websockets;

/* ---------- 配置（部署前修改） ---------- */
const char* WIFI_SSID   = "PIT-NET";
const char* WIFI_PASS   = "your-password";
const char* GATEWAY_URL = "ws://192.168.66.34:8765";
const char* GATEWAY_TOKEN = "replace-with-gateway-token";
const char* DEVICE_ID   = "esp32-b";

/* ---------- 引脚映射（见 hardware/README.md §4） ---------- */
const uint8_t RELAY[8]   = {23, 22, 21, 19, 18, 5, 17, 16};      // CH1–CH8
const uint8_t CURRENT[8] = {36, 39, 34, 35, 32, 33, 25, 26};     // ACS712 ×8
const uint8_t BAT_ADC[4] = {27, 14, 12, 13};                     // 电池分压 ×4
const uint8_t ONEWIRE    = 4;                                     // DS18B20 单总线

/* ---------- 通道元数据 ---------- */
const char* CH_NAMES[8] = {
  "工作台插座 AC", "电池充电器 ×4", "笔记本平台", "机器人调试电源",
  "显示屏 · 面板", "照明 LED 灯带", "备用 USB-C PD", "备用插座",
};
const char* CH_ZONES[8] = {
  "工作台", "充电区", "算法位", "检修位", "箱体", "箱体", "工作台", "—",
};
const float CH_VOLTS[8] = { 220, 24, 20, 12, 12, 12, 20, 0 };
const float MAX_CURRENT_AMPS = 16.0f;

WebsocketsClient gateway;
bool gatewayReady = false;
uint32_t lastConnectAttempt = 0;
OneWire oneWire(ONEWIRE);
DallasTemperature sensors(&oneWire);

bool chState[8] = { true, true, true, false, true, true, true, false };

void publishGateway(const char* channel, const String& payload, bool retain = true) {
  if (!gatewayReady) return;
  StaticJsonDocument<1024> message;
  message["type"] = "publish";
  message["messageId"] = String(millis());
  message["channel"] = channel;
  message["payload"] = payload;
  message["retain"] = retain;
  String output;
  serializeJson(message, output);
  gateway.send(output);
}

/* ACS712-20A：灵敏度 100mV/A，零点约 Vcc/2 */
float readCurrent(uint8_t ch) {
  uint32_t sum = 0;
  for (int i = 0; i < 32; i++) { sum += analogRead(CURRENT[ch]); delayMicroseconds(200); }
  float adc = sum / 32.0f;
  float volts = adc * (3.3f / 4095.0f);
  float amps = (volts - 2.5f) / 0.1f;
  return amps > 0.05f ? amps : 0.0f;
}

/* 电池分压 100k+22k → 倍率 ~5.545 */
float readBatteryVolts(uint8_t i) {
  uint32_t sum = 0;
  for (int k = 0; k < 16; k++) { sum += analogRead(BAT_ADC[i]); delayMicroseconds(200); }
  float adc = sum / 16.0f;
  return adc * (3.3f / 4095.0f) * 5.545f;
}

void applyRelay(uint8_t ch) {
  digitalWrite(RELAY[ch], chState[ch] ? HIGH : LOW);
}

void publishChannel(uint8_t ch) {
  float amps = chState[ch] ? readCurrent(ch) : 0.0f;
  if (chState[ch] && amps > MAX_CURRENT_AMPS) {
    chState[ch] = false;
    applyRelay(ch);
  }
  float watts = amps * CH_VOLTS[ch];
  char topic[64];
  snprintf(topic, sizeof(topic), "pit/esp32-b/power/CH%d", ch + 1);
  String payload = "{";
  payload += "\"name\":\"" + String(CH_NAMES[ch]) + "\",";
  payload += "\"zone\":\"" + String(CH_ZONES[ch]) + "\",";
  payload += "\"volts\":" + String(CH_VOLTS[ch], 0) + ",";
  payload += "\"amps\":" + String(amps, 1) + ",";
  payload += "\"watts\":" + String(watts, 0) + ",";
  payload += "\"on\":" + String(chState[ch] ? "true" : "false");
  payload += "}";
  publishGateway(topic, payload);
}

void publishBattery(uint8_t i) {
  float v = readBatteryVolts(i);
  int pct = constrain((int)((v - 10.5f) / (13.2f - 10.5f) * 100.0f), 0, 100);
  bool charging = chState[1] && v < 12.8f;   // CH2 充电区开启且未满
  char topic[64];
  snprintf(topic, sizeof(topic), "pit/esp32-b/battery/BAT-%d", i + 1);
  String payload = "{";
  payload += "\"pct\":" + String(pct) + ",";
  payload += "\"charging\":" + String(charging ? "true" : "false") + ",";
  payload += "\"volts\":" + String(v, 1);
  payload += "}";
  publishGateway(topic, payload);
}

void publishEnv() {
  sensors.requestTemperatures();
  float t0 = sensors.getTempCByIndex(0);
  float t1 = sensors.getTempCByIndex(1);
  String payload = "{";
  payload += "\"tempC\":" + String(t0, 1) + ",";
  payload += "\"humidity\":null";  // 未安装湿度传感器
  payload += "}";
  publishGateway("pit/esp32-b/env", payload);

  /* 温度安全：>45°C 开风扇（CH6 复用示例），>60°C 全部断电 */
  if (t0 > 60.0f) {
    for (uint8_t c = 0; c < 8; c++) { chState[c] = false; applyRelay(c); }
  }
}

void onGatewayMessage(WebsocketsMessage incoming) {
  StaticJsonDocument<1024> envelope;
  if (deserializeJson(envelope, incoming.data())) return;
  const char* type = envelope["type"] | "";
  if (!strcmp(type, "welcome")) {
    gatewayReady = true;
    gateway.send("{\"type\":\"subscribe\",\"channels\":[\"pit/control/power/#\"]}");
    publishGateway("pit/esp32-b/status", "online", true);
    return;
  }
  if (strcmp(type, "event")) return;
  String t = envelope["channel"].as<String>();
  String p = envelope["payload"].as<String>();
  if (t.startsWith("pit/control/power/")) {
    String ch = t.substring(strlen("pit/control/power/"));   // "CH4"
    int idx = ch.substring(2).toInt() - 1;
    if (idx >= 0 && idx < 8) {
      StaticJsonDocument<128> command;
      if (deserializeJson(command, p) || !command["on"].is<bool>()) return;
      chState[idx] = command["on"].as<bool>();
      applyRelay(idx);
      publishChannel(idx);   // 立即回显
    }
  }
}

void connectGateway() {
  if (millis() - lastConnectAttempt < 2000) return;
  lastConnectAttempt = millis();
  gatewayReady = false;
  if (!gateway.connect(GATEWAY_URL)) return;
  gateway.send("{\"type\":\"hello\",\"clientId\":\"esp32-b\",\"role\":\"power\",\"token\":\"" + String(GATEWAY_TOKEN) + "\"}");
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 8; i++) {
    pinMode(RELAY[i], OUTPUT);
    applyRelay(i);
  }
  analogReadResolution(12);
  sensors.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  gateway.onMessage(onGatewayMessage);
  gateway.onEvent([](WebsocketsEvent event, String) { if (event == WebsocketsEvent::ConnectionClosed) gatewayReady = false; });
}

uint32_t lastReport = 0;
void loop() {
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  if (!gateway.available()) connectGateway();
  gateway.poll();

  if (millis() - lastReport > 2000) {
    lastReport = millis();
    for (uint8_t c = 0; c < 8; c++) publishChannel(c);
    for (uint8_t b = 0; b < 4; b++) publishBattery(b);
    publishEnv();
  }
}
