#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/pit-session-broker
STATE_DIR=/var/lib/pit-session-broker
ENV_FILE=/etc/pit-session-broker.env
KEY_FILE=/etc/pit-session-broker.device-key
NGINX_EXTENSION=/www/server/panel/vhost/nginx/extension/server/pit-session-broker.conf

if ! id pit-session >/dev/null 2>&1; then
  useradd --system --home "$STATE_DIR" --shell /usr/sbin/nologin pit-session
fi

install -d -m 0755 "$APP_DIR"
install -d -m 0700 -o pit-session -g pit-session "$STATE_DIR"

if [[ ! -s "$KEY_FILE" ]]; then
  umask 077
  openssl rand -base64 48 | tr -d '=+/\n' > "$KEY_FILE"
fi
chmod 0600 "$KEY_FILE"

API_KEY=$(cat "$KEY_FILE")
umask 077
cat > "$ENV_FILE" <<EOF
PIT_SESSION_API_KEY=$API_KEY
SESSION_FILE=$STATE_DIR/session.json
CREDENTIALS_FILE=$STATE_DIR/credentials.json
SESSION_REFRESH_MS=21600000
PORT=18765
EOF
chmod 0600 "$ENV_FILE"

install -m 0644 "$APP_DIR/pit-session-broker.service" /etc/systemd/system/pit-session-broker.service
install -d -m 0755 "$(dirname "$NGINX_EXTENSION")"
install -m 0644 "$APP_DIR/nginx-location.conf" "$NGINX_EXTENSION"

systemctl daemon-reload
systemctl enable --now pit-session-broker.service
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload
