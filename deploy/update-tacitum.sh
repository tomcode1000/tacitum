#!/usr/bin/env bash
# Pull the latest Tacitum and restart its services. Run on the server: bash /opt/tacitum/deploy/update-tacitum.sh
set -euo pipefail
cd /opt/tacitum
git pull --ff-only
npm ci --omit=dev --no-audit --no-fund
sudo systemctl restart tacitum-web tacitum-miner
systemctl is-enabled tacitum-screener >/dev/null 2>&1 && sudo systemctl restart tacitum-screener || true
sudo systemctl --no-pager --lines=0 status tacitum-web tacitum-miner | grep -E "●|Active"
