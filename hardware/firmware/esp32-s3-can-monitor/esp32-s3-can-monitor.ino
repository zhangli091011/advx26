/* PIT-OS ESP32-S3 passive FRC CAN monitor (1 Mbps, listen-only). */
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include "driver/twai.h"
using namespace websockets;

const char* WIFI_SSID = "PIT-NET";
const char* WIFI_PASS = "your-password";
const char* GATEWAY_URL = "ws://192.168.66.34:8765";
const char* GATEWAY_TOKEN = "replace-with-gateway-token";
const char* PROBE_ID = "esp32-s3-can-main";

constexpr gpio_num_t CAN_RX_PIN = GPIO_NUM_4;
constexpr gpio_num_t CAN_TX_PIN = GPIO_NUM_5;
constexpr uint32_t CAN_BITRATE = 1000000;
constexpr uint32_t REPORT_INTERVAL_MS = 500;
constexpr uint32_t DEVICE_TIMEOUT_MS = 1500;
constexpr uint32_t SERIAL_BAUD = 115200;
constexpr size_t SERIAL_LINE_LIMIT = 96;

struct DeviceConfig { uint8_t id; const char* name; const char* model; const char* mech; };
const DeviceConfig DEVICES[] = {
  {1, "DRIVE-L1", "TalonFX (Kraken)", "左驱动"},
  {2, "DRIVE-R1", "TalonFX (Kraken)", "右驱动"},
  {11, "INTAKE", "SparkMax + NEO", "进气"},
  {21, "SHOOTER", "TalonFX x2", "射手"},
  {31, "CLIMB", "SparkMax + NEO", "攀爬"},
  {60, "PDH", "REV PDH", "电源分配"},
};
constexpr size_t DEVICE_COUNT = sizeof(DEVICES) / sizeof(DEVICES[0]);

struct DeviceRuntime { uint32_t lastSeen; uint32_t previousSeen; };
DeviceRuntime deviceRuntime[DEVICE_COUNT] = {};
WebsocketsClient gateway;
bool gatewayReady = false;
uint32_t lastConnectAttempt = 0;
uint32_t lastReport = 0;
uint32_t reportFrames = 0;
uint32_t reportBits = 0;
uint32_t totalFrames = 0;
uint64_t serverEpochAtSync = 0;
uint32_t millisAtSync = 0;
uint32_t lastBusErrors = 0;
twai_state_t previousState = TWAI_STATE_STOPPED;
String serialLine;
uint16_t traceRemaining = 0;
uint32_t serialCommands = 0;
uint32_t serialLines = 0;
uint64_t lastSerialActivityAt = 0;

uint64_t epochMs() {
  if (!serverEpochAtSync) return millis();
  return uint64_t(serverEpochAtSync) + uint32_t(millis() - millisAtSync);
}

void sendEnvelope(const char* channel, const String& payload, bool retain) {
  if (!gatewayReady) return;
  DynamicJsonDocument envelope(payload.length() + 512);
  envelope["type"] = "publish";
  envelope["messageId"] = String(millis());
  envelope["channel"] = channel;
  envelope["payload"] = payload;
  envelope["retain"] = retain;
  String output;
  serializeJson(envelope, output);
  gateway.send(output);
}

void publishLog(const char* level, const String& message, const char* source = "system") {
  StaticJsonDocument<512> body;
  body["at"] = epochMs();
  body["level"] = level;
  body["source"] = source;
  body["message"] = message;
  String payload;
  serializeJson(body, payload);
  sendEnvelope("pit/can/log", payload, false);
}

void serialLog(const char* level, const String& message, bool mirror = true) {
  Serial.printf("[%10lu] %-5s %s\n", millis(), level, message.c_str());
  serialLines++;
  lastSerialActivityAt = epochMs();
  if (mirror) publishLog(level, message, "serial");
}

const char* stateName(twai_state_t state) {
  if (state == TWAI_STATE_RUNNING) return "running";
  if (state == TWAI_STATE_BUS_OFF) return "bus-off";
  if (state == TWAI_STATE_STOPPED) return "stopped";
  return "unknown";
}

void publishSnapshot() {
  twai_status_info_t status;
  if (twai_get_status_info(&status) != ESP_OK) return;
  uint32_t elapsed = millis() - lastReport;
  if (!elapsed) elapsed = 1;
  float frameRate = reportFrames * 1000.0f / elapsed;
  float utilization = min(100.0f, reportBits * 100000.0f / (CAN_BITRATE * elapsed));

  StaticJsonDocument<1536> devicesDocument;
  JsonArray devices = devicesDocument.to<JsonArray>();
  uint32_t now = millis();
  for (size_t index = 0; index < DEVICE_COUNT; index++) {
    JsonObject device = devices.createNestedObject();
    const DeviceConfig& config = DEVICES[index];
    const DeviceRuntime& runtime = deviceRuntime[index];
    bool online = runtime.lastSeen && uint32_t(now - runtime.lastSeen) < DEVICE_TIMEOUT_MS;
    device["id"] = String(config.id < 10 ? "0" : "") + String(config.id);
    device["name"] = config.name;
    device["model"] = config.model;
    device["mech"] = config.mech;
    device["on"] = online;
    device["latencyMs"] = online && runtime.previousSeen ? runtime.lastSeen - runtime.previousSeen : 0;
    device["tempC"] = nullptr;
    device["lastHeartbeat"] = runtime.lastSeen ? epochMs() - uint32_t(now - runtime.lastSeen) : 0;
  }
  String devicesPayload;
  serializeJson(devicesDocument, devicesPayload);
  sendEnvelope("pit/can/devices", devicesPayload, true);

  StaticJsonDocument<768> statusDocument;
  statusDocument["probeId"] = PROBE_ID;
  statusDocument["online"] = true;
  statusDocument["bitrate"] = CAN_BITRATE;
  statusDocument["frameRate"] = frameRate;
  statusDocument["utilizationPct"] = utilization;
  statusDocument["rxFrames"] = totalFrames;
  statusDocument["rxDropped"] = status.rx_missed_count + status.rx_overrun_count;
  statusDocument["busErrors"] = status.bus_error_count;
  statusDocument["controllerState"] = stateName(status.state);
  statusDocument["wifiRssi"] = WiFi.RSSI();
  statusDocument["serialConnected"] = bool(Serial);
  statusDocument["serialBaud"] = SERIAL_BAUD;
  statusDocument["serialCommands"] = serialCommands;
  statusDocument["serialLines"] = serialLines;
  statusDocument["lastSerialActivityAt"] = lastSerialActivityAt;
  statusDocument["updatedAt"] = epochMs();
  String statusPayload;
  serializeJson(statusDocument, statusPayload);
  sendEnvelope("pit/can/status", statusPayload, true);

  if (status.state != previousState) {
    serialLog(status.state == TWAI_STATE_BUS_OFF ? "error" : "info", "TWAI state changed to " + String(stateName(status.state)));
    previousState = status.state;
  }
  if (status.bus_error_count > lastBusErrors) {
    serialLog("warn", "CAN controller errors increased to " + String(status.bus_error_count));
    lastBusErrors = status.bus_error_count;
  }
  reportFrames = 0;
  reportBits = 0;
  lastReport = now;
}

void onGatewayMessage(WebsocketsMessage incoming) {
  StaticJsonDocument<768> message;
  if (deserializeJson(message, incoming.data())) return;
  const char* type = message["type"] | "";
  if (!strcmp(type, "welcome")) {
    gatewayReady = true;
    serverEpochAtSync = message["serverTime"].as<uint64_t>();
    millisAtSync = millis();
    gateway.send("{\"type\":\"subscribe\",\"channels\":[\"pit/control/can/#\"]}");
    serialLog("info", "ESP32-S3 CAN probe connected in listen-only mode");
    publishSnapshot();
    return;
  }
  if (strcmp(type, "event")) return;
  String channel = message["channel"].as<String>();
  String payload = message["payload"].as<String>();
  if (channel != "pit/control/can/serial") return;
  StaticJsonDocument<256> command;
  if (deserializeJson(command, payload)) return;
  String name = command["command"] | "";
  if (name == "trace-10") name = "trace 10";
  handleSerialCommand(name, true);
}

void connectGateway() {
  if (millis() - lastConnectAttempt < 2000) return;
  lastConnectAttempt = millis();
  gatewayReady = false;
  if (WiFi.status() != WL_CONNECTED) return;
  if (!gateway.connect(GATEWAY_URL)) return;
  String hello = "{\"type\":\"hello\",\"clientId\":\"" + String(PROBE_ID) + "\",\"role\":\"can\",\"token\":\"" + String(GATEWAY_TOKEN) + "\"}";
  gateway.send(hello);
}

void recordFrame(const twai_message_t& frame) {
  totalFrames++;
  reportFrames++;
  // Conservative estimate includes arbitration, CRC, ACK, EOF and bit stuffing.
  reportBits += uint32_t((frame.extd ? 67 : 47) + frame.data_length_code * 10) * 12 / 10;
  if (traceRemaining) {
    Serial.printf("[%10lu] FRAME %s ID=0x%08lX DLC=%u DATA=", millis(), frame.extd ? "EXT" : "STD", frame.identifier, frame.data_length_code);
    for (uint8_t index = 0; index < frame.data_length_code; index++) Serial.printf("%02X%s", frame.data[index], index + 1 == frame.data_length_code ? "" : " ");
    Serial.println();
    serialLines++;
    lastSerialActivityAt = epochMs();
    traceRemaining--;
    if (!traceRemaining) serialLog("info", "CAN frame trace complete");
  }
  uint8_t deviceId = frame.identifier & 0x3f;
  for (size_t index = 0; index < DEVICE_COUNT; index++) {
    if (DEVICES[index].id != deviceId) continue;
    deviceRuntime[index].previousSeen = deviceRuntime[index].lastSeen;
    deviceRuntime[index].lastSeen = millis();
    break;
  }
}

void printStatus() {
  twai_status_info_t status;
  if (twai_get_status_info(&status) != ESP_OK) {
    serialLog("error", "TWAI status unavailable");
    return;
  }
  serialLog("info", "probe=" + String(PROBE_ID) + " twai=" + stateName(status.state) + " wifi=" + String(WiFi.RSSI()) + "dBm gateway=" + (gatewayReady ? "online" : "offline"));
}

void printStats() {
  twai_status_info_t status;
  if (twai_get_status_info(&status) != ESP_OK) return serialLog("error", "TWAI status unavailable");
  serialLog("info", "rx=" + String(totalFrames) + " dropped=" + String(status.rx_missed_count + status.rx_overrun_count) + " errors=" + String(status.bus_error_count));
}

void printDevices() {
  uint32_t now = millis();
  for (size_t index = 0; index < DEVICE_COUNT; index++) {
    const DeviceConfig& device = DEVICES[index];
    uint32_t age = deviceRuntime[index].lastSeen ? now - deviceRuntime[index].lastSeen : UINT32_MAX;
    serialLog("info", "CAN " + String(device.id) + " " + device.name + " " + (age < DEVICE_TIMEOUT_MS ? "online" : "offline") + " age=" + (age == UINT32_MAX ? String("never") : String(age) + "ms"));
  }
}

void printHelp() {
  serialLog("info", "commands: help | status | stats | devices | trace <1-100> | clear | log <text> | reboot", false);
}

void handleSerialCommand(String command, bool remote) {
  command.trim();
  command.toLowerCase();
  if (!command.length()) return;
  serialCommands++;
  lastSerialActivityAt = epochMs();
  serialLog("info", String(remote ? "remote> " : "serial> ") + command);
  if (command == "help") return printHelp();
  if (command == "status") return printStatus();
  if (command == "stats") return printStats();
  if (command == "devices") return printDevices();
  if (command == "clear") {
    serialCommands = 0;
    serialLines = 0;
    return serialLog("info", "serial counters cleared");
  }
  if (command.startsWith("trace ")) {
    int count = command.substring(6).toInt();
    if (count < 1 || count > 100) return serialLog("warn", "trace count must be 1-100");
    traceRemaining = count;
    return serialLog("info", "capturing " + String(count) + " CAN frames to USB serial only");
  }
  if (command.startsWith("log ") && !remote) return serialLog("info", command.substring(4));
  if (command == "reboot" && !remote) {
    serialLog("warn", "rebooting probe", false);
    delay(100);
    ESP.restart();
  }
  serialLog("warn", "unknown or forbidden command; type help");
}

void pollSerial() {
  while (Serial.available()) {
    char input = char(Serial.read());
    if (input == '\r') continue;
    if (input == '\n') {
      handleSerialCommand(serialLine, false);
      serialLine = "";
      continue;
    }
    if (input == '\b' || input == 127) {
      if (serialLine.length()) serialLine.remove(serialLine.length() - 1);
      continue;
    }
    if (input >= 32 && input <= 126 && serialLine.length() < SERIAL_LINE_LIMIT) serialLine += input;
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(300);
  Serial.println("\nPIT-OS ESP32-S3 CAN monitor");
  printHelp();
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  twai_general_config_t general = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_LISTEN_ONLY);
  general.rx_queue_len = 128;
  general.alerts_enabled = TWAI_ALERT_BUS_OFF | TWAI_ALERT_BUS_RECOVERED | TWAI_ALERT_RX_QUEUE_FULL;
  twai_timing_config_t timing = TWAI_TIMING_CONFIG_1MBITS();
  twai_filter_config_t filter = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if (twai_driver_install(&general, &timing, &filter) != ESP_OK || twai_start() != ESP_OK) {
    serialLog("error", "TWAI startup failed");
  } else {
    serialLog("info", "TWAI listen-only started: RX=" + String(CAN_RX_PIN) + " TX=" + String(CAN_TX_PIN) + " 1Mbps");
  }

  gateway.onMessage(onGatewayMessage);
  gateway.onEvent([](WebsocketsEvent event, String) {
    if (event == WebsocketsEvent::ConnectionClosed) gatewayReady = false;
  });
  lastReport = millis();
}

void loop() {
  pollSerial();
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  if (!gateway.available()) connectGateway();
  gateway.poll();

  twai_message_t frame;
  while (twai_receive(&frame, 0) == ESP_OK) recordFrame(frame);
  uint32_t alerts = 0;
  if (twai_read_alerts(&alerts, 0) == ESP_OK && alerts & TWAI_ALERT_RX_QUEUE_FULL) {
    serialLog("error", "TWAI RX queue full; reduce processing load or inspect bus traffic");
  }
  if (gatewayReady && millis() - lastReport >= REPORT_INTERVAL_MS) publishSnapshot();
  delay(1);
}
