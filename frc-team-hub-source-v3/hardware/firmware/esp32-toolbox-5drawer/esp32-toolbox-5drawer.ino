/* PIT-OS five-drawer tool indicator controller. */
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
using namespace websockets;

const char* WIFI_SSID = "PIT-NET";
const char* WIFI_PASS = "your-password";
const char* GATEWAY_URL = "ws://192.168.66.34:8765";
const char* GATEWAY_TOKEN = "replace-with-gateway-token";
const char* DEVICE_ID = "esp32-toolbox-5drawer";

const uint8_t DRAWER_COUNT = 5;
const uint8_t LED_PINS[DRAWER_COUNT] = {13, 14, 16, 17, 18};

enum DrawerState : uint8_t { UNCONFIGURED, ALL_IN, TOOL_OUT, TOOL_LOST };
DrawerState drawerStates[DRAWER_COUNT];
uint32_t desiredRevision = 0;
int8_t locatingDrawer = -1;
uint32_t locatingUntil = 0;

WebsocketsClient gateway;
bool gatewayReady = false;
uint32_t lastConnectAttempt = 0;
uint32_t lastHeartbeat = 0;

void publishGateway(const char* channel, const String& payload, bool retain = false) {
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

void setLed(uint8_t index, bool on) { digitalWrite(LED_PINS[index], on ? HIGH : LOW); }

void selfTestLeds() {
  for (uint8_t i = 0; i < DRAWER_COUNT; i++) { setLed(i, true); delay(350); setLed(i, false); }
  for (uint8_t i = 0; i < DRAWER_COUNT; i++) setLed(i, true);
  delay(700);
  for (uint8_t i = 0; i < DRAWER_COUNT; i++) setLed(i, false);
}

void showLeds() {
  bool slow = (millis() / 700) % 2 == 0;
  bool fast = (millis() / 180) % 2 == 0;
  for (uint8_t i = 0; i < DRAWER_COUNT; i++) {
    if (locatingDrawer == i && locatingUntil > millis()) setLed(i, fast);
    else if (drawerStates[i] == ALL_IN) setLed(i, true);
    else if (drawerStates[i] == TOOL_OUT) setLed(i, slow);
    else if (drawerStates[i] == TOOL_LOST) setLed(i, fast);
    else setLed(i, false);
  }
  if (locatingUntil <= millis()) locatingDrawer = -1;
}

void publishAppliedRevision() {
  String payload = "{\"revision\":" + String(desiredRevision) + ",\"applied\":true,\"drawerCount\":5}";
  publishGateway("pit/toolbox/tool-leds/status", payload);
}

void applySnapshot(const String& payload) {
  StaticJsonDocument<1536> document;
  if (deserializeJson(document, payload)) return;
  uint32_t revision = document["revision"] | 0;
  if (revision < desiredRevision || (document["drawerCount"] | 0) != DRAWER_COUNT) return;
  JsonArray drawers = document["drawers"].as<JsonArray>();
  if (drawers.size() != DRAWER_COUNT) return;
  DrawerState nextStates[DRAWER_COUNT];
  uint8_t seen = 0;
  for (JsonObject item : drawers) {
    int index = item["ledIndex"] | -1;
    const char* drawer = item["drawer"] | "";
    const char* state = item["state"] | "";
    String expectedDrawer = String("D") + String(index + 1);
    if (index < 0 || index >= DRAWER_COUNT || expectedDrawer != drawer || (seen & (1U << index))) return;
    seen |= 1U << index;
    if (!strcmp(state, "in")) nextStates[index] = ALL_IN;
    else if (!strcmp(state, "out")) nextStates[index] = TOOL_OUT;
    else if (!strcmp(state, "lost")) nextStates[index] = TOOL_LOST;
    else if (!strcmp(state, "unconfigured")) nextStates[index] = UNCONFIGURED;
    else return;
  }
  if (seen != ((1U << DRAWER_COUNT) - 1)) return;
  for (uint8_t i = 0; i < DRAWER_COUNT; i++) drawerStates[i] = nextStates[i];
  desiredRevision = revision;
  publishAppliedRevision();
}

void onGatewayMessage(WebsocketsMessage incoming) {
  StaticJsonDocument<2048> envelope;
  if (deserializeJson(envelope, incoming.data())) return;
  const char* type = envelope["type"] | "";
  if (!strcmp(type, "welcome")) {
    gatewayReady = true;
    gateway.send("{\"type\":\"subscribe\",\"channels\":[\"pit/control/toolbox/#\"]}");
    publishGateway("pit/toolbox/status", "online", true);
    return;
  }
  if (strcmp(type, "event")) return;
  String channel = envelope["channel"].as<String>();
  if (channel == "pit/control/toolbox/tool-leds") applySnapshot(envelope["payload"].as<String>());
  else if (channel.startsWith("pit/control/toolbox/locate/D")) {
    int number = channel.substring(strlen("pit/control/toolbox/locate/D")).toInt();
    if (number >= 1 && number <= DRAWER_COUNT) { locatingDrawer = number - 1; locatingUntil = millis() + 15000; }
  }
}

void connectGateway() {
  if (millis() - lastConnectAttempt < 2000) return;
  lastConnectAttempt = millis();
  gatewayReady = false;
  if (!gateway.connect(GATEWAY_URL)) return;
  gateway.send("{\"type\":\"hello\",\"clientId\":\"" + String(DEVICE_ID) + "\",\"role\":\"toolbox\",\"token\":\"" + String(GATEWAY_TOKEN) + "\"}");
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < DRAWER_COUNT; i++) { pinMode(LED_PINS[i], OUTPUT); setLed(i, false); }
  selfTestLeds();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  gateway.onMessage(onGatewayMessage);
  gateway.onEvent([](WebsocketsEvent event, String) { if (event == WebsocketsEvent::ConnectionClosed) gatewayReady = false; });
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  if (!gateway.available()) connectGateway();
  gateway.poll();
  if (gatewayReady && millis() - lastHeartbeat >= 5000) {
    lastHeartbeat = millis();
    publishGateway("pit/toolbox/status", "online", true);
  }
  showLeds();
  delay(20);
}
