#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
NODE_MAJOR="20"
SOLC_VERSIONS=("0.8.20" "0.8.24" "0.8.26")
if [[ $EUID -ne 0 ]]; then echo "Run as root on the VM." >&2; exit 1; fi
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release build-essential python3 python3-pip python3-venv pipx redis-server caddy git unzip
install -d -m 0755 /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/nodesource.gpg ]]; then curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg; fi
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
apt-get update && apt-get install -y nodejs
corepack enable && corepack prepare pnpm@9.12.3 --activate
npm install -g pm2
pipx ensurepath
export PATH="$PATH:/root/.local/bin"
if ! command -v slither >/dev/null 2>&1; then pipx install slither-analyzer; else pipx upgrade slither-analyzer || true; fi
if ! command -v solc-select >/dev/null 2>&1; then pipx inject slither-analyzer solc-select || true; fi
for version in "${SOLC_VERSIONS[@]}"; do solc-select install "$version" || true; done
solc-select use 0.8.24
systemctl enable --now redis-server
systemctl enable --now caddy
cat <<SUMMARY
Archon provision summary
node: $(node -v)
pnpm: $(pnpm -v)
python: $(python3 --version)
pipx: $(pipx --version)
slither: $(slither --version 2>/dev/null || true)
solc: $(solc --version | head -1)
redis: $(redis-server --version)
caddy: $(caddy version)
pm2: $(pm2 -v)
SUMMARY
