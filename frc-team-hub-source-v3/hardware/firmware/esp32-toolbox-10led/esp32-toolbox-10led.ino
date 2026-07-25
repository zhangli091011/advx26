/* PIT-OS ordinary LED controller: two-LED bench test, ten-slot protocol. */
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
using namespace websockets;

const char* WIFI_SSID = "PIT-NET";
const char* WIFI_PASS = "your-password";
const char* GATEWAY_URL = "ws://192.168.66.34:8765";
const char* GATEWAY_TOKEN = "replace-with-gateway-token";
const char* DEVICE_ID = "esp32-toolbox-2led-test";

// Keep the server protocol at ten slots, but drive only the first two LEDs.
const uint8_t PROTOCOL_SLOT_COUNT = 10;
const uint8_t PHYSICAL_LED_COUNT = 2;
const uint8_t LED_PINS[PHYSICAL_LED_COUNT] = {13, 14};

enum SlotState : uint8_t { UNCONFIGURED, IN_STOCK, CHECKED_OUT, LOST };
SlotState slotStates[PHYSICAL_LED_COUNT];
uint32_t desiredRevision = 0;
int8_t locatingIndex = -1;
uint32_t locatingUntil = 0;

WebsocketsClient gateway;
bool gatewayReady = false;
uint32_t lastConnectAttempt = 0;
uint32_t lastHeartbeat = 0;

void publishGateway(const char* channel, const String& payload, bool retain = false) {
  if (!gatewayReady) return;
  StaticJsonDocument<2304> message;
  message["type"] = "publish";
  message["messageId"] = String(millis());
  message["channel"] = channel;
  message["payload"] = payload;
  message["retain"] = retain;
  String output;
  serializeJson(message, output);
  gateway.send(output);
}

void setLed(uint8_t index, bool on) {
  digitalWrite(LED_PINS[index], on ? HIGH : LOW);
}

void selfTestLeds() {
  for (uint8_t i = 0; i < PHYSICAL_LED_COUNT; i++) {
    setLed(i, true);
    delay(500);
    setLed(i, false);
  }
  for (uint8_t i = 0; i < PHYSICAL_LED_COUNT; i++) setLed(i, true);
  delay(700);
  for (uint8_t i = 0; i < PHYSICAL_LED_COUNT; i++) setLed(i, false);
}

void showLeds() {
  bool slow = (millis() / 700) % 2 == 0;
  bool fast = (millis() / 180) % 2 == 0;
  for (uint8_t i = 0; i < PHYSICAL_LED_COUNT; i++) {
    if (locatingIndex == i && locatingUntil > millis()) {
      setLed(i, fast);
    } else if (slotStates[i] == IN_STOCK) {
      setLed(i, true);
    } else if (slotStates[i] == CHECKED_OUT) {
      setLed(i, slow);
    } else if (slotStates[i] == LOST) {
      setLed(i, fast);
    } else {
      setLed(i, false);
    }
  }
  if (locatingUntil <= millis()) locatingIndex = -1;
}

void publishAppliedRevision() {
  String payload = "{\"revision\":" + String(desiredRevision) + ",\"applied\":true}";
  publishGateway("pit/toolbox/tool-leds/status", payload);
}

void applySnapshot(byte* payload, unsigned int length) {
  StaticJsonDocument<1536> document;
  if (deserializeJson(document, payload, length)) return;
  uint32_t revision = document["revision"] | 0;
  if (revision < desiredRevision) return;
  JsonArray slots = document["slots"].as<JsonArray>();
  if (slots.size() != PROTOCOL_SLOT_COUNT) return;
  SlotState nextStates[PHYSICAL_LED_COUNT];
  uint16_t seen = 0;
  for (JsonObject item : slots) {
    int index = item["ledIndex"] | -1;
    const char* state = item["state"] | "unconfigured";
    if (index < 0 || index >= PROTOCOL_SLOT_COUNT) return;
    if (index >= PHYSICAL_LED_COUNT) continue;
    if (seen & (1U << index)) return;
    seen |= 1U << index;
    if (!strcmp(state, "in")) nextStates[index] = IN_STOCK;
    else if (!strcmp(state, "out")) nextStates[index] = CHECKED_OUT;
    else if (!strcmp(state, "lost")) nextStates[index] = LOST;
    else if (!strcmp(state, "unconfigured")) nextStates[index] = UNCONFIGURED;
    else return;
  }
  if (seen != ((1U << PHYSICAL_LED_COUNT) - 1)) return;
  for (uint8_t i = 0; i < PHYSICAL_LED_COUNT; i++) slotStates[i] = nextStates[i];
  desiredRevision = revision;
  publishAppliedRevision();
}

void onGatewayMessage(WebsocketsMessage incoming) {
  StaticJsonDocument<2304> envelope;
  if (deserializeJson(envelope, incoming.data())) return;
  const char* type = envelope["type"] | "";
  if (!strcmp(type, "welcome")) {
    gatewayReady = true;
    gateway.send("{\"type\":\"subscribe\",\"channels\":[\"pit/control/toolbox/#\",\"pit/control/locate/#\"]}");
    publishGateway("pit/toolbox/status", "online", true);
    return;
  }
  if (strcmp(type, "event")) return;
  String name = envelope["channel"].as<String>();
  String body = envelope["payload"].as<String>();
  if (name == "pit/control/toolbox/tool-leds") {
    applySnapshot((byte*)body.c_str(), body.length());
    return;
  }
  if (name.startsWith("pit/control/locate/U1-")) {
    int number = name.substring(strlen("pit/control/locate/U1-")).toInt();
    if (number >= 1 && number <= PHYSICAL_LED_COUNT) {
      locatingIndex = number - 1;
      locatingUntil = millis() + 15000;
    }
  }
}

void connectGateway() {
  if (millis() - lastConnectAttempt < 2000) return;
  lastConnectAttempt = millis();
  gatewayReady = false;
  if (!gateway.connect(GATEWAY_URL)) return;
  String hello = "{\"type\":\"hello\",\"clientId\":\"" + String(DEVICE_ID) + "\",\"role\":\"toolbox\",\"token\":\"" + String(GATEWAY_TOKEN) + "\"}";
  gateway.send(hello);
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < PHYSICAL_LED_COUNT; i++) {
    pinMode(LED_PINS[i], OUTPUT);
    digitalWrite(LED_PINS[i], LOW);
  }
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
