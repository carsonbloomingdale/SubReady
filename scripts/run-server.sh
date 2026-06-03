#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/subreready-server"
VENV="$SERVER/venv"

if [[ ! -d "$VENV" ]]; then
  echo "Virtualenv missing. Run: ./scripts/setup.sh"
  exit 1
fi

# shellcheck source=/dev/null
source "$VENV/bin/activate"

if [[ -f "$SERVER/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$SERVER/.env"
  set +a
fi

cd "$SERVER"
echo "Starting API at http://localhost:8000"
exec python run_server.py
