#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/subreready-client"

if [[ ! -d "$CLIENT/node_modules" ]]; then
  echo "Client deps missing. Run: ./scripts/setup.sh"
  exit 1
fi

cd "$CLIENT"
echo "Starting client at http://localhost:5173 (proxies /api -> :8000)"
exec npm run dev
