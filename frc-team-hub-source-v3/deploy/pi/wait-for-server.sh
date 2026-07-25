#!/bin/sh
set -eu

until curl --fail --silent --max-time 2 http://127.0.0.1:3000/api/health >/dev/null; do
  sleep 1
done
