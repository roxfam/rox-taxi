#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Rox Taxi — one-shot app deployer
#
# Runs AFTER scripts/bootstrap-vps.sh has installed system packages.
# This script does everything else needed to reach a live HTTPS site:
#   1. Clone the repo to /home/rox/app (or update it in place)
#   2. Generate JWT_SECRET_KEY (openssl rand -hex 32)
#   3. Prompt for admin email + password
#   4. Write backend/.env with the 7 Tier-1 bootstrap keys
#   5. Write frontend/.env with REACT_APP_BACKEND_URL
#   6. pip install backend deps + yarn install + yarn build (with 1.5GB heap cap)
#   7. Install the rox-api systemd service + enable it
#   8. Write the Nginx site config + reload
#   9. Request Let's Encrypt cert + auto-renew
#
# Usage:
#   bash scripts/deploy-app.sh <github-repo-url> <domain>
#
# Example:
#   bash scripts/deploy-app.sh https://github.com/rox/rox-taxi.git roxtaxi.com
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

log()  { echo -e "\n\033[1;34m▶\033[0m $*"; }
ok()   { echo -e "\033[1;32m✔\033[0m $*"; }
warn() { echo -e "\033[1;33m⚠\033[0m $*"; }
fail() { echo -e "\033[1;31m✘\033[0m $*"; exit 1; }

REPO_URL="${1:-}"
DOMAIN="${2:-}"
[[ -z "$REPO_URL" || -z "$DOMAIN" ]] && fail "Usage: bash scripts/deploy-app.sh <github-repo-url> <domain>"

[[ $EUID -eq 0 ]] && fail "Do not run as root — run as the sudo user (e.g. 'rox')."
command -v sudo >/dev/null || fail "sudo not installed."

APP_USER="$(whoami)"
APP_DIR="/home/${APP_USER}/app"
WWW_DOMAIN="www.${DOMAIN}"

# ─── 1 · Clone or update ────────────────────────────────────────────
if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Cloning repo to $APP_DIR ..."
  git clone "$REPO_URL" "$APP_DIR"
else
  log "Updating existing checkout at $APP_DIR ..."
  git -C "$APP_DIR" pull --ff-only
fi
cd "$APP_DIR"

# ─── 2 · Prompt for admin creds ─────────────────────────────────────
log "Configure the admin owner account (used once at first login):"
read -rp "  Admin email: " ADMIN_EMAIL
read -rsp "  Admin password (min 8 chars): " ADMIN_PASSWORD; echo
[[ ${#ADMIN_PASSWORD} -lt 8 ]] && fail "Password too short (min 8 chars)."

# Generate JWT secret if not already set
JWT_SECRET_KEY="$(openssl rand -hex 32)"

# ─── 3 · Write backend/.env ─────────────────────────────────────────
log "Writing backend/.env with Tier-1 bootstrap keys..."
cat > "$APP_DIR/backend/.env" <<EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="rox_taxi_prod"
JWT_SECRET_KEY="${JWT_SECRET_KEY}"
ADMIN_EMAIL="${ADMIN_EMAIL}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
PUBLIC_SITE_URL="https://${DOMAIN}"
CORS_ORIGINS="https://${DOMAIN},https://${WWW_DOMAIN}"
EOF
chmod 600 "$APP_DIR/backend/.env"
ok "backend/.env written (chmod 600)"

# ─── 4 · Write frontend/.env ────────────────────────────────────────
cat > "$APP_DIR/frontend/.env" <<EOF
REACT_APP_BACKEND_URL=https://${DOMAIN}
EOF
ok "frontend/.env written"

# ─── 5 · Backend deps ───────────────────────────────────────────────
log "Installing backend Python deps..."
cd "$APP_DIR/backend"
if [[ ! -d venv ]]; then
  python3.11 -m venv venv
fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ --quiet
deactivate
ok "Backend deps installed"

# ─── 6 · Frontend build (with 1.5GB heap cap for 2GB VPS) ───────────
log "Installing frontend deps + building..."
cd "$APP_DIR/frontend"
yarn install --frozen-lockfile
NODE_OPTIONS="--max-old-space-size=1536" yarn build
[[ -f "$APP_DIR/frontend/build/index.html" ]] || fail "yarn build did not produce build/index.html"
ok "Frontend built"

# ─── 7 · systemd service ────────────────────────────────────────────
log "Installing rox-api systemd service..."
sudo tee /etc/systemd/system/rox-api.service > /dev/null <<EOF
[Unit]
Description=Rox Taxi FastAPI backend
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=${APP_DIR}/backend/.env
ExecStart=${APP_DIR}/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable rox-api >/dev/null
sudo systemctl restart rox-api
sleep 3
sudo systemctl is-active --quiet rox-api || {
  sudo journalctl -u rox-api -n 40
  fail "rox-api did not start — see logs above"
}
ok "rox-api service running"

# ─── 8 · Nginx site config (HTTP first, certbot will add HTTPS) ─────
log "Writing Nginx site config..."
sudo tee /etc/nginx/sites-available/roxtaxi > /dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};
    client_max_body_size 25M;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout                 90s;
    }

    root ${APP_DIR}/frontend/build;
    index index.html;

    location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    location /static/      { expires 365d; add_header Cache-Control "public, immutable"; }
    location = /sw.js      { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    location /             { try_files \$uri \$uri/ /index.html; }
}
EOF

sudo ln -sf /etc/nginx/sites-available/roxtaxi /etc/nginx/sites-enabled/roxtaxi
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
ok "Nginx reloaded — site live over HTTP"

# Quick sanity check before certbot rewrites the config
sleep 2
if curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}" | grep -qE "^(200|301|302)$"; then
  ok "HTTP smoke test passed"
else
  warn "HTTP smoke test failed — DNS may not have propagated yet."
  warn "Continue with certbot below only once 'dig +short ${DOMAIN}' returns your VPS IP."
  read -rp "Continue with certbot anyway? [y/N] " GO
  [[ "${GO,,}" == "y" ]] || fail "Aborted before certbot. Re-run this script once DNS is live."
fi

# ─── 9 · TLS via Let's Encrypt ──────────────────────────────────────
log "Requesting Let's Encrypt certificate (certbot)..."
sudo certbot --nginx -d "$DOMAIN" -d "$WWW_DOMAIN" \
     --email "$ADMIN_EMAIL" --agree-tos --no-eff-email --redirect --non-interactive
sudo systemctl reload nginx
ok "HTTPS active — auto-renew via certbot.timer"

# ─── Done ───────────────────────────────────────────────────────────
echo
echo -e "\033[1;32m═══════════════════════════════════════════════════════════════\033[0m"
echo -e "\033[1;32m  🎉  Rox Taxi is live at https://${DOMAIN}\033[0m"
echo -e "\033[1;32m═══════════════════════════════════════════════════════════════\033[0m"
echo
echo "  Admin login:   https://${DOMAIN}/admin/login"
echo "  Admin email:   ${ADMIN_EMAIL}"
echo
echo "  Next steps:"
echo "    1) Log in as admin"
echo "    2) Open Admin → Manage → Tokens tab"
echo "    3) Paste your Stripe, Twilio, SendGrid, Emergent LLM, AviationStack,"
echo "       Facebook keys (see DEPLOYMENT.md → Appendix for each 'where to get')"
echo "    4) No restart needed — every token takes effect within seconds of Save"
echo
