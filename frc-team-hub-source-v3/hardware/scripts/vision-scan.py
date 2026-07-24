#!/usr/bin/env python3
"""
PIT-OS 视觉扫码服务 — 工具二维码入库/借出识别
运行于树莓派 5，USB 摄像头对准借还工位托盘。
识别二维码（内容如 TOOL-U1-03）→ 发布 MQTT 事件。
依赖：opencv-python, pyzbar, paho-mqtt（libzbar0）
"""
import time
import cv2
import paho.mqtt.client as mqtt
from pyzbar.pyzbar import decode

MQTT_HOST = "127.0.0.1"
MQTT_PORT = 1883
CAMERA_INDEX = 0
DEBOUNCE_SEC = 2.0  # 同一码防抖

# 工具二维码 → 元数据（也可改为从后端 API 拉取）
TOOL_DB = {
    "TOOL-U1-01": {"slot": "U1-01", "name": "内六角套装 1.5-10mm", "unit": "U1"},
    "TOOL-U1-02": {"slot": "U1-02", "name": "尖嘴钳 6寸", "unit": "U1"},
    "TOOL-U1-03": {"slot": "U1-03", "name": "活动扳手 8寸", "unit": "U1"},
    "TOOL-U2-01": {"slot": "U2-01", "name": "电动螺丝刀", "unit": "U2"},
    "TOOL-U2-02": {"slot": "U2-02", "name": "热风枪", "unit": "U2"},
    "TOOL-U3-01": {"slot": "U3-01", "name": "批头套装 PH/TX 32件", "unit": "U3"},
    "TOOL-U7-01": {"slot": "U7-01", "name": "万用表 UT61E+", "unit": "U7"},
    "TOOL-U7-02": {"slot": "U7-02", "name": "夹式电流表", "unit": "U7"},
}

client = mqtt.Client(client_id="pit-vision")
client.connect(MQTT_HOST, MQTT_PORT, 60)
client.loop_start()

# 当前借出登记表：qr → state（真实部署应持久化到后端 DB）
tool_state = {qr: "in" for qr in TOOL_DB}
last_seen: dict[str, float] = {}

def publish(topic: str, payload: dict):
    import json
    client.publish(topic, json.dumps(payload, ensure_ascii=False), qos=1, retain=True)

def on_qr(qr: str):
    tool = TOOL_DB.get(qr)
    now = time.strftime("%H:%M:%S")
    if not tool:
        publish("pit/vision/scan", {"msg": f"未登记二维码：{qr}", "kind": "err"})
        return
    # 翻转状态：in → out（借出），out/lost → in（归还）
    prev = tool_state.get(qr, "in")
    new = "out" if prev == "in" else "in"
    tool_state[qr] = new
    action = "借出" if new == "out" else "归还"
    kind = "warn" if new == "out" else "ok"
    publish(f"pit/esp32-a/tools/{tool['slot']}", {
        "name": tool["name"], "unit": tool["unit"], "state": new,
        **({"who": "扫码", "time": now} if new == "out" else {}),
        "qr": qr,
    })
    publish("pit/vision/scan", {
        "msg": f"{action}「{tool['name']}」→ {'自动入位 ' + tool['slot'] if new == 'in' else '借出登记'}",
        "kind": kind,
    })
    print(f"[{now}] {action} {tool['name']} ({tool['slot']})")

cap = cv2.VideoCapture(CAMERA_INDEX)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

print("PIT-OS vision-scan 已启动，等待二维码…")
while True:
    ok, frame = cap.read()
    if not ok:
        time.sleep(0.2)
        continue
    for code in decode(frame):
        qr = code.data.decode("utf-8", errors="ignore").strip()
        now = time.time()
        if now - last_seen.get(qr, 0) < DEBOUNCE_SEC:
            continue
        last_seen[qr] = now
        on_qr(qr)
    # 无显示环境下注释掉下一行；调试时可开启
    # cv2.imshow("pit-vision", frame); cv2.waitKey(1)

cap.release()
