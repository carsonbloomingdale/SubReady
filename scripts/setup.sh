#!/usr/bin/env bash
# One-time (or repeat) local setup for SubReady: Python server, Node client, git hygiene.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/subreready-server"
CLIENT="$ROOT/subreready-client"
VENV="$SERVER/venv"

echo "==> SubReady setup (root: $ROOT)"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd git
require_cmd python3

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm not found. Install from https://nodejs.org/ or: brew install node"
  exit 1
fi

if ! command -v tesseract >/dev/null 2>&1; then
  echo "WARNING: tesseract not found. Image uploads need OCR."
  echo "  Install with: brew install tesseract"
fi

echo "==> Python virtualenv + dependencies"
if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi
# shellcheck source=/dev/null
source "$VENV/bin/activate"
pip install --upgrade pip

# Install API + parser deps first (fast). llama-cpp builds separately.
pip install \
  fastapi==0.104.1 \
  uvicorn==0.24.0 \
  pydantic==2.5.3 \
  pydantic-settings==2.1.0 \
  python-multipart==0.0.6 \
  pypdf==4.0.1 \
  Pillow==10.2.0 \
  pytesseract==0.3.10

if ! python -c "import llama_cpp" 2>/dev/null; then
  echo "==> Installing llama-cpp-python (may take a few minutes to compile)..."
  if ! pip install 'llama-cpp-python>=0.2.86' --prefer-binary; then
    echo "Build failed. Install build tools, then re-run setup:"
    echo "  xcode-select --install"
    echo "  brew install cmake ninja"
    exit 1
  fi
fi

if [[ ! -f "$SERVER/.env" ]] && [[ -f "$ROOT/.env.example" ]]; then
  cp "$ROOT/.env.example" "$SERVER/.env"
  echo "Created $SERVER/.env from .env.example"
fi

mkdir -p "$SERVER/model"
if [[ ! -f "$SERVER/model/Qwen3-4B-Q4_K_M.gguf" ]]; then
  echo "WARNING: Model not found at $SERVER/model/Qwen3-4B-Q4_K_M.gguf"
  echo "  Download your Qwen GGUF and place it there, or set SUBREADY_MODEL_PATH in .env"
fi

echo "==> Client dependencies"
(cd "$CLIENT" && npm install)

echo "==> Git: stop tracking venv if it was committed"
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git -C "$ROOT" ls-files --error-unmatch subreready-server/venv >/dev/null 2>&1; then
    git -C "$ROOT" rm -r --cached subreready-server/venv 2>/dev/null || true
    echo "  Removed subreready-server/venv from git index (files kept on disk)."
  fi
fi

echo ""
echo "Setup complete."
echo "  Run server:  ./scripts/run-server.sh"
echo "  Run client:  ./scripts/run-client.sh"
echo "  Git remote:  $(git -C "$ROOT" remote get-url origin 2>/dev/null || echo 'not configured')"
