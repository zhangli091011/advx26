/* PIT-OS ordinary LED controller: two-LED bench test, ten-slot protocol. */
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "PIT-NET";
const char* WIFI_PASS = "your-password";
const char* MQTT_HOST = "192.168.1.10";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "pit-device";
const char* MQTT_PASS = "change-this-password";
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

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

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
  mqtt.publish("pit/toolbox/tool-leds/status", payload.c_str(), false);
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

void onMessage(char* topic, byte* payload, unsigned int length) {
  String name(topic);
  if (name == "pit/control/toolbox/tool-leds") {
    applySnapshot(payload, length);
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

void connectMqtt() {
  while (!mqtt.connected()) {
    if (mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS, "pit/toolbox/status", 1, true, "offline")) {
      mqtt.publish("pit/toolbox/status", "online", true);
      mqtt.subscribe("pit/control/toolbox/tool-leds", 1);
      mqtt.subscribe("pit/control/locate/#", 1);
    } else {
      delay(2000);
    }
  }
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
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(2048);
}

void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();
  showLeds();
  delay(20);
}
