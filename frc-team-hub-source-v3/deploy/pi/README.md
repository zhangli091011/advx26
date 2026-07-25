# Raspberry Pi 5 kiosk deployment

This target uses Raspberry Pi OS Lite 64-bit, Next.js standalone, Cage, and the
system Chromium package. It does not install Electron or a desktop environment.

## Build on Linux ARM64

Build on the target Pi or another Linux ARM64 machine. Native Next.js
dependencies from Windows or x64 Linux are not compatible.

```sh
npm ci
export NEXT_PUBLIC_PIT_DEVICE_PROFILE=pi5
npm run pi:build
```

The release is written to `dist-pi/pit-os`. It contains the standalone server,
static assets, public assets, and a release manifest. Local `.env` and `data`
files are removed.

## Install

Node.js 20 or newer must already be available as `/usr/bin/node`.

```sh
sudo deploy/pi/install.sh dist-pi/pit-os
```

The installer creates two locked service users and installs:

- `pit-device-gateway.service`: authenticated WebSocket gateway on port 8765
- `pit-os.service`: Next.js on `127.0.0.1:3000`
- `pit-kiosk.service`: Cage and Chromium on HDMI/DRM
- `/var/lib/pit-os`: persistent application configuration
- `/etc/pit-os/pit-os.env`: optional server environment overrides

Useful checks:

```sh
systemctl status pit-device-gateway.service pit-os.service pit-kiosk.service --no-pager
journalctl -u pit-device-gateway.service -u pit-os.service -u pit-kiosk.service -f
curl --fail http://127.0.0.1:3000/api/health
```

To run headless without a display, disable only the kiosk:

```sh
sudo systemctl disable --now pit-kiosk.service
```
