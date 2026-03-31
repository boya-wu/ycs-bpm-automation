#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[bootstrap] repo: $ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[bootstrap] ERROR: node not found. Please install Node.js (LTS) first."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[bootstrap] ERROR: npm not found. Please reinstall Node.js (includes npm)."
  exit 1
fi

echo "[bootstrap] node: $(node -v)"
echo "[bootstrap] npm:  $(npm -v)"

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    echo "[bootstrap] .env not found, creating from .env.example"
    cp ".env.example" ".env"
    echo "[bootstrap] NOTE: Please edit .env and set PLAYWRIGHT_BPM_PASSWORD, etc."
  else
    echo "[bootstrap] WARN: .env and .env.example not found. Continue anyway."
  fi
fi

if [[ -f "package-lock.json" ]]; then
  echo "[bootstrap] installing deps with npm ci"
  npm ci
else
  echo "[bootstrap] package-lock.json not found; using npm install"
  npm install
fi

echo "[bootstrap] installing Playwright browsers"
npx playwright install

echo "[bootstrap] done"

