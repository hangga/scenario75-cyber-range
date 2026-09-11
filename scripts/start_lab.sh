#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/start_lab.sh"
  exit 1
fi

mkdir -p /opt/admin/logs
cp -a "$ROOT"/. /opt/scenario75/

cd /opt/scenario75
./scripts/generate_logs.sh

docker compose up -d --build

echo
echo "Scenario75 is running."
echo "HTTP :3075"
echo "SSH  :2275"
echo "Logs: /opt/admin/logs"
