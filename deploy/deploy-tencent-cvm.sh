#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/todesk}"
REPO_URL="${REPO_URL:-git@github.com:SSQLQIANBB/toDesk.git}"
BRANCH="${BRANCH:-master}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker first." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not installed. Install docker compose first." >&2
  exit 1
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "Created $APP_DIR/.env. Edit secrets, then rerun this script or docker compose up -d --build." >&2
  exit 2
fi

docker compose up -d --build
docker compose ps
