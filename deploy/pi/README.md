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
- `pit-vision-scan.service`: Dabai DC QR scanner for tool check-in/out
- `pit-media.service`: MediaMTX RTMP ingest and WebRTC playback
- `/var/lib/pit-os`: persistent application configuration
- `/etc/pit-os/pit-os.env`: optional server environment overrides
- `/etc/pit-os/vision-scan.env`: camera device and scanner settings
- `/etc/pit-os/media.env`: generated RTMP publisher credentials
- `/etc/pit-os/mediamtx.yml`: RTMP/WebRTC server paths and permissions

After first install, set `PIT_CAMERA_DEVICE` in `/etc/pit-os/vision-scan.env`
to the stable Dabai DC RGB `/dev/v4l/by-id/...` path, then restart
`pit-vision-scan.service`. The default value `0` is only a discovery fallback.

Useful checks:

```sh
systemctl status pit-device-gateway.service pit-media.service pit-os.service pit-kiosk.service pit-vision-scan.service --no-pager
journalctl -u pit-device-gateway.service -u pit-media.service -u pit-os.service -u pit-kiosk.service -u pit-vision-scan.service -f
curl --fail http://127.0.0.1:3000/api/health
```

To run headless without a display, disable only the kiosk:

```sh
sudo systemctl disable --now pit-kiosk.service
```

## RTMP cameras

The installer pins MediaMTX `v1.19.3`, verifies the official SHA-256 manifest, and installs it as `pit-media.service`.

Ports:

- `1935/tcp`: authenticated RTMP ingest for `cam2`, `cam3`, and `cam4`
- `8889/tcp`: WebRTC signaling and player
- `8189/udp` and `8189/tcp`: WebRTC media
- `9997/tcp`: MediaMTX control API, bound to loopback only

The Dabai DC stream is produced by the scanner process itself, so only one process opens its V4L2 device. The scanner sends frames to FFmpeg through a one-frame queue; slow encoding drops old video frames rather than blocking QR recognition.

Read external publisher credentials with root access:

```sh
sudo cat /etc/pit-os/media.env
```

Configure OBS or an RTMP camera with a URL such as:

```text
rtmp://pit-publisher:PASSWORD@PI-IP:1935/cam2
```

Configure display labels in `/etc/pit-os/pit-os.env`:

```sh
PIT_CAMERA_SOURCES_JSON='[{"id":"dabai","label":"Dabai DC"},{"id":"cam2","label":"Driver Camera"},{"id":"cam3","label":"Workshop"},{"id":"cam4","label":"Field"}]'
```

Then restart `pit-os.service`. Source IDs must match the four paths in `/etc/pit-os/mediamtx.yml`. Do not expose ports `1935`, `8889`, or `8189` to the internet; restrict them to the trusted PIT LAN.
