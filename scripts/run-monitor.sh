#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p "logs"

if [[ ! -f ".env" ]]; then
  echo "[run-monitor] ERROR: .env not found. Create it from .env.example first."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[run-monitor] ERROR: node not found."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[run-monitor] ERROR: npm not found."
  exit 1
fi

echo "[run-monitor] start: $(date '+%Y-%m-%d %H:%M:%S')"
echo "[run-monitor] cwd: $ROOT_DIR"

# Prefer npm script (stable entrypoint)
npm run -s monitor:workitem

echo "[run-monitor] end: $(date '+%Y-%m-%d %H:%M:%S')"

