/*
 * PIT-OS ESP32-A — 16U 储存柜分控
 * 功能：HX711 称重 ×8 + WS2812 格位 LED ×64 + 柜门磁 ×8 + MQTT
 * 通信：WiFi → MQTT Broker（树莓派 5）
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <HX711.h>
#include <FastLED.h>

/* ---------- 配置（部署前修改） ---------- */
const char* WIFI_SSID   = "PIT-NET";
const char* WIFI_PASS   = "your-password";
const char* MQTT_HOST   = "192.168.1.10";   // 树莓派 IP
const uint16_t MQTT_PORT = 1883;
const char* DEVICE_ID   = "esp32-a";

/* ---------- 引脚映射（见 hardware/README.md §3） ---------- */
// HX711 ×8：DT 各一，SCK 共用
const uint8_t HX_DT[8]  = {32, 33, 25, 26, 27, 14, 12, 13};
const uint8_t HX_SCK    = 15;
// WS2812 ×64（每格 1 颗，U1-U8 各 8 颗串联）
const uint8_t LED_PIN   = 22;
const uint16_t LED_NUM  = 64;
// 柜门磁 ×8
const uint8_t DOOR[8]   = {34, 35, 36, 39, 4, 16, 17, 5};

/* ---------- 单元元数据 ---------- */
const char* UNIT_NAMES[8] = {
  "手动工具抽屉", "电动工具抽屉", "批头 · 钻头耗材", "螺丝螺母格柜",
  "接头 · 线材",   "扎带 · 耗材",   "电工仪表",       "维修临时托盘",
};
const char* UNIT_NOTES[8] = {
  "内六角 / 扳手 / 钳", "电螺丝刀 / 热风枪", "PH / TX / 内六角批头", "M3 / M4 / M5 / 垫片",
  "Anderson / XT60 / 线", "扎带 / 热缩管 / 胶带", "万用表 / 夹表", "按工序分组收纳",
};

WiFiClient espClient;
PubSubClient mqtt(espClient);
HX711 scales[8];
CRGB leds[LED_NUM];

/* 格位 LED 索引：unit(0-7) * 8 + slot(0-7) */
uint16_t ledIndex(uint8_t unit, uint8_t slot) { return unit * 8 + slot; }

/* 定位闪烁状态 */
struct Blink { int16_t unit; int16_t slot; uint32_t until; };
Blink blinkState = { -1, -1, 0 };

/* 称重校准（部署时用已知砝码校准） */
float CAL_FACTOR[8] = { 420.f, 420.f, 420.f, 420.f, 420.f, 420.f, 420.f, 420.f };
long  TARE[8]       = { 0, 0, 0, 0, 0, 0, 0, 0 };

void publish(const char* topic, const String& payload, bool retain = true) {
  mqtt.publish(topic, payload.c_str(), retain);
}

void publishUnit(uint8_t i) {
  char topic[64];
  snprintf(topic, sizeof(topic), "pit/esp32-a/units/U%d", i + 1);
  float w = scales[i].get_units(5);  // 克
  int pct = constrain((int)(w / 8.0f), 0, 100);  // 粗略映射，按实际满载重量调整
  String level = pct < 20 ? "low" : "ok";
  String status = pct < 20 ? "库存偏低" : "库存正常";
  String payload = "{";
  payload += "\"name\":\"" + String(UNIT_NAMES[i]) + "\",";
  payload += "\"note\":\"" + String(UNIT_NOTES[i]) + "\",";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"level\":\"" + level + "\",";
  payload += "\"pct\":" + String(pct);
  payload += "}";
  publish(topic, payload);
}

void publishToolState(const char* slot, const char* name, const char* unit,
                      const char* state, const char* who = "", const char* time = "") {
  char topic[64];
  snprintf(topic, sizeof(topic), "pit/esp32-a/tools/%s", slot);
  String payload = "{";
  payload += "\"name\":\"" + String(name) + "\",";
  payload += "\"unit\":\"" + String(unit) + "\",";
  payload += "\"state\":\"" + String(state) + "\"";
  if (strlen(who))  payload += ",\"who\":\"" + String(who) + "\"";
  if (strlen(time)) payload += ",\"time\":\"" + String(time) + "\"";
  payload += "}";
  publish(topic, payload);
}

/* MQTT 下行：定位闪烁 / 控制 */
void onMqtt(char* topic, byte* payload, unsigned int len) {
  String t(topic);
  String p;
  for (unsigned int i = 0; i < len; i++) p += (char)payload[i];

  if (t.startsWith("pit/control/locate/")) {
    // pit/control/locate/U1-03 → 单元 1 格位 3
    String slot = t.substring(strlen("pit/control/locate/"));
    int dash = slot.indexOf('-');
    if (dash > 0) {
      blinkState.unit = slot.substring(1, dash).toInt() - 1;   // "U1"→0
      blinkState.slot = slot.substring(dash + 1).toInt() - 1;
      blinkState.until = millis() + 15000;
    }
  } else if (t.startsWith("pit/control/locate-unit/")) {
    String unit = t.substring(strlen("pit/control/locate-unit/"));
    blinkState.unit = unit.substring(1).toInt() - 1;
    blinkState.slot = -1;   // 整单元
    blinkState.until = millis() + 15000;
  }
}

void reconnect() {
  while (!mqtt.connected()) {
    if (mqtt.connect(DEVICE_ID, nullptr, nullptr, "pit/esp32-a/status", 1, true, "offline")) {
      publish("pit/esp32-a/status", "online");
      mqtt.subscribe("pit/control/locate/#");
      mqtt.subscribe("pit/control/locate-unit/#");
    } else {
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqtt);

  for (uint8_t i = 0; i < 8; i++) {
    scales[i].begin(HX_DT[i], HX_SCK);
    scales[i].set_scale(CAL_FACTOR[i]);
    scales[i].set_offset(TARE[i]);
    pinMode(DOOR[i], INPUT_PULLUP);
  }
  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, LED_NUM);
  FastLED.setBrightness(80);
}

uint32_t lastReport = 0;
void loop() {
  if (!mqtt.connected()) reconnect();
  mqtt.loop();

  /* 每 2s 上报称重与单元状态 */
  if (millis() - lastReport > 2000) {
    lastReport = millis();
    for (uint8_t i = 0; i < 8; i++) publishUnit(i);
  }

  /* LED 渲染：定位目标闪烁黄，其余按库存状态 */
  bool blinkOn = (millis() / 400) % 2 == 0;
  for (uint8_t u = 0; u < 8; u++) {
    for (uint8_t s = 0; s < 8; s++) {
      uint16_t idx = ledIndex(u, s);
      if (blinkState.until > millis() &&
          (blinkState.unit == (int16_t)u && (blinkState.slot == -1 || blinkState.slot == (int16_t)s))) {
        leds[idx] = blinkOn ? CRGB::Yellow : CRGB::Black;
      } else {
        leds[idx] = CRGB(0, 8, 0);  // 微亮待机
      }
    }
  }
  FastLED.show();
}
