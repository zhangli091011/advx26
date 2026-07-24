#!/usr/bin/env python3
"""Decode tool QR codes and publish raw, non-retained scan events."""
import json
import os
import time
import uuid

import cv2
import paho.mqtt.client as mqtt
from pyzbar.pyzbar import decode

MQTT_HOST = os.environ.get("PIT_MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.environ.get("PIT_MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("PIT_MQTT_USERNAME")
MQTT_PASS = os.environ.get("PIT_MQTT_PASSWORD")
CAMERA_INDEX = int(os.environ.get("PIT_CAMERA_INDEX", "0"))
STATION_ID = os.environ.get("PIT_TOOL_STATION_ID", "main")
DEBOUNCE_SEC = 5.0

client = mqtt.Client(client_id="pit-vision")
if MQTT_USER:
    client.username_pw_set(MQTT_USER, MQTT_PASS)
client.will_set("pit/vision/status", "offline", qos=1, retain=True)
client.connect(MQTT_HOST, MQTT_PORT, 60)
client.publish("pit/vision/status", "online", qos=1, retain=True)
client.loop_start()

last_seen: dict[str, float] = {}

def publish_scan(qr: str):
    payload = {
        "scanId": str(uuid.uuid4()),
        "qr": qr,
        "stationId": STATION_ID,
        "capturedAt": int(time.time() * 1000),
    }
    client.publish("pit/vision/scan", json.dumps(payload, ensure_ascii=False), qos=1, retain=False)
    print(f"[{time.strftime('%H:%M:%S')}] scan {qr}")

cap = cv2.VideoCapture(CAMERA_INDEX)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

print("PIT-OS vision-scan started")
while True:
    ok, frame = cap.read()
    if not ok:
        time.sleep(0.2)
        continue
    for code in decode(frame):
        qr = code.data.decode("utf-8", errors="ignore").strip()
        now = time.time()
        if not qr or now - last_seen.get(qr, 0) < DEBOUNCE_SEC:
            continue
        last_seen[qr] = now
        publish_scan(qr)

cap.release()
