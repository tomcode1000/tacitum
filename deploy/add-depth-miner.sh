#!/usr/bin/env bash
# Adds the Solana pool-depth miner to the Lightsail server that already runs Tacitum (and Detour).
# Run on the server:  bash /opt/tacitum/deploy/add-depth-miner.sh   (after git pull in /opt/tacitum)
# Runs depth-miner/server.mjs on 127.0.0.1:4203 and APPENDS one Caddy site; restores the old
# Caddyfile if it does not validate. Touches nothing else.
set -euo pipefail
APP=/opt/tacitum
IP_DASHED="$(curl -fsS https://checkip.amazonaws.com | tr -d '\n' | tr . -)"
SITE="${DEPTH_SITE:-depth.${IP_DASHED}.sslip.io}"
echo "depth miner: https://$SITE"
git -C "$APP" pull --ff-only

sudo tee /etc/systemd/system/tacitum-depth.service >/dev/null <<UNIT
[Unit]
Description=Tacitum Solana pool-depth miner
After=network-online.target

[Service]
User=$USER
WorkingDirectory=$APP
ExecStart=/usr/bin/node depth-miner/server.mjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=4203

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now tacitum-depth
sudo systemctl restart tacitum-depth

CF=/etc/caddy/Caddyfile
if ! grep -q "$SITE" "$CF"; then
  sudo cp "$CF" "$CF.bak-depth-$(date +%s)"
  sudo tee -a "$CF" >/dev/null <<CADDY

# --- Tacitum pool-depth miner (added by deploy/add-depth-miner.sh) ---
$SITE {
  encode gzip
  reverse_proxy 127.0.0.1:4203
}
CADDY
  if ! sudo caddy validate --config "$CF" --adapter caddyfile; then
    LATEST="$(ls -t $CF.bak-depth-* | head -1)"
    sudo cp "$LATEST" "$CF"
    echo "Caddy config did not validate; restored $LATEST. Nothing else changed."
    exit 1
  fi
fi
sudo systemctl reload caddy
sleep 3
curl -fsS -w "\n" http://127.0.0.1:4203/api/health || echo "depth miner not answering locally"
echo "public check (certificate can take a minute):"
curl -fsS -m 40 "https://$SITE/api/depth?pool=8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo&chain=solana" | head -c 400; echo
