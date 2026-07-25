/*
 * ESP32 five ordinary LED bench test.
 * No Wi-Fi, MQTT, camera, or third-party Arduino libraries are required.
 */

const uint8_t LED_COUNT = 5;
const uint8_t LED_PINS[LED_COUNT] = {13, 14, 16, 17, 18};

void setAllLeds(bool on) {
  for (uint8_t i = 0; i < LED_COUNT; i++) {
    digitalWrite(LED_PINS[i], on ? HIGH : LOW);
  }
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < LED_COUNT; i++) {
    pinMode(LED_PINS[i], OUTPUT);
  }
  setAllLeds(false);
  Serial.println("ESP32 five-LED test started");
}

void loop() {
  for (uint8_t i = 0; i < LED_COUNT; i++) {
    setAllLeds(false);
    digitalWrite(LED_PINS[i], HIGH);
    Serial.printf("LED %u ON (GPIO %u)\n", i + 1, LED_PINS[i]);
    delay(800);
  }

  Serial.println("ALL FIVE ON");
  setAllLeds(true);
  delay(2000);

  Serial.println("ALL FIVE OFF");
  setAllLeds(false);
  delay(1000);
}
