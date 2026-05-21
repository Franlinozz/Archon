#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/archon}"
cd "$APP_DIR"
git pull --ff-only
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
pm2 reload ecosystem.config.cjs --update-env
pm2 save
