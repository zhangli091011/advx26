#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo deploy/pi/install.sh dist-pi/pit-os" >&2
  exit 1
fi

RELEASE_DIR="${1:-}"
if [ -z "$RELEASE_DIR" ] || [ ! -f "$RELEASE_DIR/server.js" ] || [ ! -f "$RELEASE_DIR/release.json" ]; then
  echo "Expected a Pi release directory containing server.js and release.json" >&2
  exit 1
fi

if [ "$(uname -m)" != "aarch64" ]; then
  echo "This release can only be installed on aarch64 Raspberry Pi OS" >&2
  exit 1
fi

NODE_MAJOR="$(/usr/bin/node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required before installation" >&2
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends cage chromium curl seatd

id pit-os >/dev/null 2>&1 || useradd --system --home /var/lib/pit-os --shell /usr/sbin/nologin pit-os
id pit-kiosk >/dev/null 2>&1 || useradd --system --home /var/lib/pit-kiosk --shell /usr/sbin/nologin pit-kiosk
usermod -aG video,render,input pit-kiosk

VERSION="$(/usr/bin/node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$RELEASE_DIR/release.json")"
TARGET="/opt/pit-os/releases/$VERSION"
systemctl stop pit-kiosk.service pit-os.service pit-device-gateway.service 2>/dev/null || true
install -d -o root -g root /opt/pit-os/releases /etc/pit-os /usr/local/lib/pit-os
install -d -o pit-os -g pit-os -m 0750 /var/lib/pit-os
install -d -o pit-kiosk -g pit-kiosk -m 0750 /var/lib/pit-kiosk
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -a "$RELEASE_DIR/." "$TARGET/"
ln -sfn "$TARGET" /opt/pit-os/current

install -m 0644 "$SCRIPT_DIR/pit-os.service" /etc/systemd/system/pit-os.service
install -m 0644 "$SCRIPT_DIR/pit-device-gateway.service" /etc/systemd/system/pit-device-gateway.service
install -m 0644 "$SCRIPT_DIR/pit-kiosk.service" /etc/systemd/system/pit-kiosk.service
install -m 0755 "$SCRIPT_DIR/wait-for-server.sh" /usr/local/lib/pit-os/wait-for-server.sh
if [ ! -f /etc/pit-os/pit-os.env ]; then
  install -m 0640 -o root -g pit-os /dev/null /etc/pit-os/pit-os.env
fi
if [ ! -s /etc/pit-os/gateway.env ]; then
  TOKEN="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  printf 'PIT_GATEWAY_TOKEN=%s\n' "$TOKEN" > /etc/pit-os/gateway.env
  chown root:pit-os /etc/pit-os/gateway.env
  chmod 0640 /etc/pit-os/gateway.env
fi

systemctl daemon-reload
systemctl disable --now mosquitto.service 2>/dev/null || true
DEBIAN_FRONTEND=noninteractive apt-get purge -y mosquitto mosquitto-clients 2>/dev/null || true
systemctl enable --now seatd.service pit-device-gateway.service pit-os.service pit-kiosk.service
echo "PIT OS $VERSION installed. Open http://127.0.0.1:3000/pit"
