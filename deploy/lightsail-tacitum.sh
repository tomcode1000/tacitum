#!/usr/bin/env bash
# Adds Tacitum to the existing Lightsail server (the one already running Detour behind Caddy).
# Run on the server (Lightsail "Connect using SSH"):
#   curl -fsSL https://raw.githubusercontent.com/tomcode1000/tacitum/main/deploy/lightsail-tacitum.sh | bash
#
# What it does, without touching Detour:
#   - clones github.com/tomcode1000/tacitum to /opt/tacitum and installs its dependencies
#   - runs the website on 127.0.0.1:4201 and the adverse-media miner on 127.0.0.1:4202
#   - installs the pool screener service (starts only once PRIVATE_KEY is set in /opt/tacitum/.env)
#   - APPENDS two sites to Caddy (HTTPS via Let's Encrypt), validates, and restores the old
#     Caddyfile if validation fails
set -euo pipefail

APP=/opt/tacitum
IP_DASHED="$(curl -fsS https://checkip.amazonaws.com | tr -d '\n' | tr . -)"
SITE="${TACITUM_SITE:-tacitum.${IP_DASHED}.sslip.io}"
MINER="${TACITUM_MINER:-adverse.${IP_DASHED}.sslip.io}"
echo "site:  https://$SITE"
echo "miner: https://$MINER"

command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -; sudo apt-get install -y nodejs; }
command -v caddy >/dev/null || { echo "Caddy is not installed; run Detour's lightsail-setup.sh first or install Caddy."; exit 1; }
command -v git >/dev/null || sudo apt-get install -y git

if [ ! -d "$APP/.git" ]; then
  sudo git clone https://github.com/tomcode1000/tacitum.git "$APP"
  sudo chown -R "$USER":"$USER" "$APP"
else
  git -C "$APP" pull --ff-only
fi
cd "$APP"
npm ci --omit=dev --no-audit --no-fund

# Settings file: key names only. The screener needs the pool operator key, typed here with nano.
if [ ! -f "$APP/.env" ]; then
  cat > "$APP/.env" <<ENV
# Pool operator key (screens deposits and approves them). Leave empty to run only the site and miner.
PRIVATE_KEY=
TACITUM_HOME=data
TACITUM_KEYS=keys
ENV
fi
chmod 600 "$APP/.env"

unit() { # name, description, command, port-or-empty
  sudo tee "/etc/systemd/system/$1.service" >/dev/null <<UNIT
[Unit]
Description=$2
After=network-online.target

[Service]
User=$USER
WorkingDirectory=$APP
ExecStart=$3
Restart=always
RestartSec=5
Environment=NODE_ENV=production
${4:+Environment=PORT=$4}

[Install]
WantedBy=multi-user.target
UNIT
}
unit tacitum-web "Tacitum website" "/usr/bin/node scripts/serve-web.mjs" 4201
unit tacitum-miner "Tacitum adverse-media miner" "/usr/bin/node miner/server.mjs" 4202
unit tacitum-screener "Tacitum pool screener" "/usr/bin/node scripts/pool-screen.mjs --watch" ""
sudo systemctl daemon-reload
sudo systemctl enable --now tacitum-web tacitum-miner
if grep -q '^PRIVATE_KEY=0x' "$APP/.env"; then sudo systemctl enable --now tacitum-screener; else echo "screener installed but not started (no PRIVATE_KEY in $APP/.env)"; fi

# Caddy: append our two sites once, validate, roll back on failure.
CF=/etc/caddy/Caddyfile
if ! grep -q "$SITE" "$CF"; then
  sudo cp "$CF" "$CF.bak-tacitum-$(date +%s)"
  sudo tee -a "$CF" >/dev/null <<CADDY

# --- Tacitum (added by deploy/lightsail-tacitum.sh) ---
$SITE {
  encode gzip
  reverse_proxy 127.0.0.1:4201
}
$MINER {
  encode gzip
  reverse_proxy 127.0.0.1:4202
}
CADDY
  if ! sudo caddy validate --config "$CF" --adapter caddyfile; then
    LATEST="$(ls -t $CF.bak-tacitum-* | head -1)"
    sudo cp "$LATEST" "$CF"
    echo "Caddy config did not validate; restored $LATEST. Detour is untouched."
    exit 1
  fi
fi
sudo systemctl reload caddy

sleep 3
echo
echo "local checks:"
curl -fsS -o /dev/null -w "  website  %{http_code}\n" http://127.0.0.1:4201/ || echo "  website  not answering"
curl -fsS -w "\n" http://127.0.0.1:4202/api/health || echo "  miner not answering"
echo
echo "Done. Open https://$SITE (the HTTPS certificate can take a minute on first visit)."
echo "Update later with: bash $APP/deploy/update-tacitum.sh"
