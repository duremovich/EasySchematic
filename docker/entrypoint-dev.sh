#!/bin/sh
set -e

REPO_URL="${REPO_URL:-https://github.com/duremovich/EasySchematic.git}"
BRANCH="${BRANCH:-master}"

if [ ! -d "/app/.git" ]; then
  echo "[dev] Cloning $REPO_URL @ $BRANCH ..."
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" /app
else
  echo "[dev] Pulling latest @ $BRANCH ..."
  git -C /app fetch origin "$BRANCH"
  git -C /app reset --hard "origin/$BRANCH"
fi

echo "[dev] Installing dependencies..."
cd /app
npm ci --legacy-peer-deps

echo "[dev] Generating fallback data..."
npm run generate-fallback

echo "[dev] Starting Vite on :5173 ..."
exec npx vite --host 0.0.0.0 --port 5173
