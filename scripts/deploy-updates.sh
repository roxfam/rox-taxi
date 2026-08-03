#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Rox Taxi — one-shot updater for the LIVE VPS.
#
# Pulls the latest code, reinstalls anything new, rebuilds the frontend
# (with 1.5GB heap cap for 2GB VPS), and restarts the backend so
# secrets_store + route changes take effect. Idempotent.
#
# Usage on the VPS:
#   cd ~/rox-taxi
#   bash scripts/deploy-updates.sh
#
# Overrides (env vars):
#   ROX_BACKEND_SERVICE   default: rox-backend
#   ROX_APP_DIR           default: current directory
#   SKIP_YARN_INSTALL     set to 1 to skip `yarn install` (faster reruns)
#   SKIP_PIP             set to 1 to skip pip install (faster reruns)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${ROX_APP_DIR:-$(pwd)}"
BACKEND_SVC="${ROX_BACKEND_SERVICE:-rox-backend}"

log()  { echo -e "\033[1;34m▶\033[0m $*"; }
ok()   { echo -e "\033[1;32m✔\033[0m $*"; }
warn() { echo -e "\033[1;33m⚠\033[0m $*"; }
die()  { echo -e "\033[1;31m✖\033[0m $*"; exit 1; }

[[ -d "$APP_DIR/.git" ]] || die "$APP_DIR is not a git checkout (set ROX_APP_DIR)"
cd "$APP_DIR"

# 1 · Pull latest
log "git pull"
BEFORE=$(git rev-parse HEAD)
git pull --ff-only
AFTER=$(git rev-parse HEAD)
if [[ "$BEFORE" == "$AFTER" ]]; then
  ok "Already up to date ($AFTER)"
else
  ok "Updated $BEFORE → $AFTER"
  git --no-pager log --oneline "$BEFORE..$AFTER" | sed 's/^/    /'
fi

# 2 · Backend deps (skip if nothing changed in requirements.txt)
if [[ "${SKIP_PIP:-0}" != "1" ]] && git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null | grep -q '^backend/requirements.txt$'; then
  log "requirements.txt changed — pip install"
  if [[ -d "$APP_DIR/venv" ]]; then
    "$APP_DIR/venv/bin/pip" install -q --upgrade pip
    "$APP_DIR/venv/bin/pip" install -q -r backend/requirements.txt \
      --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
  else
    pip3 install -q -r backend/requirements.txt \
      --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
  fi
  ok "Backend deps up to date"
else
  ok "Skipping pip install (requirements.txt unchanged)"
fi

# 3 · Frontend deps + build
cd "$APP_DIR/frontend"
if [[ "${SKIP_YARN_INSTALL:-0}" != "1" ]] && git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null | grep -q '^frontend/package.json$'; then
  log "package.json changed — yarn install"
  yarn install --frozen-lockfile 2>&1 | tail -n 3
  ok "Frontend deps up to date"
else
  ok "Skipping yarn install (package.json unchanged)"
fi

log "yarn build (with 1.5GB heap cap for 2GB VPS)"
NODE_OPTIONS="--max-old-space-size=1536" yarn build 2>&1 | tail -n 5
ok "Frontend built → frontend/build/"

# 4 · Restart backend + reload Nginx
cd "$APP_DIR"
if systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | grep -qx "${BACKEND_SVC}.service"; then
  log "Restarting $BACKEND_SVC"
  sudo systemctl restart "$BACKEND_SVC"
  sleep 2
  if systemctl is-active --quiet "$BACKEND_SVC"; then
    ok "$BACKEND_SVC is active"
  else
    warn "$BACKEND_SVC failed to start — check: sudo journalctl -u $BACKEND_SVC -n 40"
  fi
else
  warn "systemd unit '$BACKEND_SVC' not found. Skipping backend restart."
  warn "Restart your backend manually, or set ROX_BACKEND_SERVICE=<your-unit-name>."
fi

log "sudo nginx -t && systemctl reload nginx"
sudo nginx -t 2>&1 | tail -n 2 || die "Nginx config invalid — fix before proceeding."
sudo systemctl reload nginx
ok "Nginx reloaded"

# 5 · Smoke test
log "Smoke test: /api/site-config"
if curl -fsS --max-time 10 http://127.0.0.1:8001/api/site-config >/dev/null 2>&1 \
  || curl -fsS --max-time 10 http://127.0.0.1/api/site-config >/dev/null 2>&1; then
  ok "Backend responding OK"
else
  warn "Backend didn't respond within 10s. Check logs."
fi

echo
ok "Deployment complete."
echo "    Frontend: refresh https://roxtaxi.com in incognito"
echo "    Backend logs:  sudo journalctl -u $BACKEND_SVC -n 40 -f"
