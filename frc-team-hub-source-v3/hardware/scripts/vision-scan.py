#!/usr/bin/env python3
"""Dabai DC QR scanner using the PIT-OS WebSocket device gateway."""
import json
import os
import signal
import threading
import time
import uuid

import cv2
import websocket
from pyzbar.pyzbar import decode

GATEWAY_URL = os.environ.get("PIT_GATEWAY_URL", "ws://127.0.0.1:8765")
GATEWAY_TOKEN = os.environ.get("PIT_GATEWAY_TOKEN", "")
STATION_ID = os.environ.get("PIT_TOOL_STATION_ID", "main").strip()
CAMERA_DEVICE = os.environ.get("PIT_CAMERA_DEVICE", os.environ.get("PIT_CAMERA_INDEX", "0")).strip()
CAMERA_WIDTH = int(os.environ.get("PIT_CAMERA_WIDTH", "1280"))
CAMERA_HEIGHT = int(os.environ.get("PIT_CAMERA_HEIGHT", "720"))
CAMERA_FPS = int(os.environ.get("PIT_CAMERA_FPS", "30"))
DEBOUNCE_SEC = float(os.environ.get("PIT_SCAN_DEBOUNCE_SEC", "2"))

SESSION_CHANNEL = f"pit/control/vision/session/{STATION_ID}"
STATUS_CHANNEL = f"pit/vision/status/{STATION_ID}"
SCAN_CHANNEL = "pit/vision/scan"


class Gateway:
    def __init__(self, on_event):
        self.on_event = on_event
        self.socket = None
        self.connected = False
        self.running = True
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()

    def _run(self):
        delay = 1
        while self.running:
            try:
                socket = websocket.create_connection(GATEWAY_URL, timeout=10, enable_multithread=True)
                socket.settimeout(15)
                self.socket = socket
                socket.send(json.dumps({"type": "hello", "clientId": f"vision-{STATION_ID}", "role": "vision", "token": GATEWAY_TOKEN}))
                welcome = json.loads(socket.recv())
                if welcome.get("type") != "welcome":
                    raise RuntimeError("gateway authentication failed")
                socket.send(json.dumps({"type": "subscribe", "channels": [SESSION_CHANNEL]}))
                self.connected = True
                delay = 1
                while self.running:
                    try:
                        message = json.loads(socket.recv())
                    except websocket.WebSocketTimeoutException:
                        socket.ping()
                        continue
                    if message.get("type") == "event":
                        self.on_event(message.get("channel"), message.get("payload", ""))
            except Exception as error:
                print(f"[vision] gateway disconnected: {error}", flush=True)
            finally:
                self.connected = False
                if self.socket:
                    self.socket.close()
                self.socket = None
            if self.running:
                time.sleep(delay)
                delay = min(10, delay * 2)

    def publish(self, channel, payload, retain=False):
        if not self.connected or not self.socket:
            return False
        message = {"type": "publish", "messageId": str(uuid.uuid4()), "channel": channel, "payload": payload, "retain": retain}
        try:
            with self.lock:
                self.socket.send(json.dumps(message, ensure_ascii=False))
            return True
        except Exception:
            self.connected = False
            return False

    def close(self):
        self.running = False
        if self.socket:
            self.socket.close()


class Scanner:
    def __init__(self):
        if not STATION_ID or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for char in STATION_ID):
            raise ValueError("PIT_TOOL_STATION_ID contains invalid characters")
        self.running = True
        self.capture = None
        self.session = None
        self.last_seen = {}
        self.last_status_at = 0.0
        self.gateway = Gateway(self.on_event)

    def status_payload(self, online, ready, error=None, width=None, height=None):
        return json.dumps({"online": online, "ready": ready, "stationId": STATION_ID, "backend": "v4l2", "device": CAMERA_DEVICE,
                           "width": width, "height": height, "error": error, "updatedAt": int(time.time() * 1000)}, ensure_ascii=False)

    def publish_status(self, ready, error=None, width=None, height=None):
        self.gateway.publish(STATUS_CHANNEL, self.status_payload(True, ready, error, width, height), True)
        self.last_status_at = time.monotonic()

    def on_event(self, channel, payload):
        if channel != SESSION_CHANNEL:
            return
        if not payload:
            self.session = None
            self.last_seen.clear()
            return
        try:
            value = json.loads(payload)
            now = int(time.time() * 1000)
            if not isinstance(value.get("sessionId"), str) or value.get("operation") not in ("checkout", "return"):
                raise ValueError("invalid session")
            if not isinstance(value.get("createdAt"), int) or not isinstance(value.get("expiresAt"), int):
                raise ValueError("invalid timestamps")
            if value["expiresAt"] <= now or value["expiresAt"] <= value["createdAt"]:
                raise ValueError("expired session")
            self.session = value
            self.last_seen.clear()
        except (ValueError, json.JSONDecodeError, TypeError):
            self.session = None

    def open_camera(self):
        source = int(CAMERA_DEVICE) if CAMERA_DEVICE.isdigit() else CAMERA_DEVICE
        capture = cv2.VideoCapture(source, cv2.CAP_V4L2)
        if not capture.isOpened():
            capture.release()
            return None
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
        capture.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
        ok, frame = capture.read()
        if not ok or frame is None or len(frame.shape) != 3 or frame.shape[2] < 3:
            capture.release()
            return None
        self.publish_status(True, width=int(frame.shape[1]), height=int(frame.shape[0]))
        return capture

    def publish_scan(self, qr):
        if not self.session:
            return
        captured_at = int(time.time() * 1000)
        if captured_at > self.session["expiresAt"]:
            self.session = None
            self.last_seen.clear()
            return
        payload = json.dumps({"scanId": str(uuid.uuid4()), "sessionId": self.session["sessionId"], "qr": qr,
                              "stationId": STATION_ID, "capturedAt": captured_at}, ensure_ascii=False)
        if self.gateway.publish(SCAN_CHANNEL, payload):
            print(f"[{time.strftime('%H:%M:%S')}] scan {qr}", flush=True)

    def run(self):
        self.gateway.start()
        while self.running:
            if self.capture is None:
                self.capture = self.open_camera()
                if self.capture is None:
                    self.publish_status(False, "Dabai DC RGB stream unavailable")
                    time.sleep(2)
                    continue
            ok, frame = self.capture.read()
            if not ok or frame is None:
                self.publish_status(False, "camera frame read failed")
                self.capture.release()
                self.capture = None
                time.sleep(1)
                continue
            if time.monotonic() - self.last_status_at >= 10:
                self.publish_status(True, width=int(frame.shape[1]), height=int(frame.shape[0]))
            if not self.session:
                time.sleep(0.03)
                continue
            now = time.monotonic()
            for code in decode(frame):
                qr = code.data.decode("utf-8", errors="ignore").strip()
                if not qr or now - self.last_seen.get(qr, 0) < DEBOUNCE_SEC:
                    continue
                self.last_seen[qr] = now
                self.publish_scan(qr)
                break
        self.close()

    def close(self):
        if self.capture is not None:
            self.capture.release()
        self.gateway.publish(STATUS_CHANNEL, self.status_payload(False, False, "service stopped"), True)
        self.gateway.close()


def main():
    scanner = Scanner()
    signal.signal(signal.SIGTERM, lambda *_args: setattr(scanner, "running", False))
    signal.signal(signal.SIGINT, lambda *_args: setattr(scanner, "running", False))
    scanner.run()


if __name__ == "__main__":
    main()
