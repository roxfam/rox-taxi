#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Rox Taxi — one-shot installer for nightly Mongo → Mega.io backups.
#
# What it does:
#   1. Installs `megatools` (apt) if missing
#   2. Prompts for your Mega.io email + password + writes /etc/rox-mega.ini
#   3. Prompts for Mongo settings + writes /etc/rox-backup.env
#   4. Runs backup-mongo-mega.sh once as a smoke test (fails fast if creds bad)
#   5. Installs a systemd timer that runs the backup nightly at 03:15 UTC
#
# Usage on the VPS:
#   sudo bash scripts/install-backup-cron.sh
#
# Mega.io setup (get this before running the installer):
#   1. Sign up: https://mega.io/register  (free 20 GB, no credit card)
#   2. Have your email + password ready
#
# TIP: Mega charges "storage over quota" only if you exceed 20 GB. Nightly
# Rox Taxi dumps are ~10-50 MB, so 30 days ≈ 1.5 GB — well under the free tier.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "▶ Elevating with sudo…"; exec sudo "$0" "$@"
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-mongo-mega.sh"
CONF=/etc/rox-backup.env
MEGA_CONF=/etc/rox-mega.ini

log()  { echo -e "\033[1;34m▶\033[0m $*"; }
ok()   { echo -e "\033[1;32m✔\033[0m $*"; }
warn() { echo -e "\033[1;33m⚠\033[0m $*"; }
ask()  { local var="$1" prompt="$2" secret="${3:-}"; local val=""
  while [[ -z "$val" ]]; do
    if [[ "$secret" == "secret" ]]; then read -rsp "$prompt: " val; echo
    else read -rp "$prompt: " val; fi
  done
  printf -v "$var" '%s' "$val"
}

[[ -f "$BACKUP_SCRIPT" ]] || { echo "backup-mongo-mega.sh not found at $BACKUP_SCRIPT"; exit 1; }
chmod +x "$BACKUP_SCRIPT"

# 1 · megatools
if ! command -v megaput >/dev/null; then
  log "Installing megatools…"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq megatools
  ok "megatools installed: $(megaput --version 2>&1 | head -n1)"
fi
command -v mongodump >/dev/null || { echo "❌ mongodump missing. Install mongodb-database-tools."; exit 1; }

# 2 · Mega credentials
if [[ -f "$MEGA_CONF" ]]; then
  read -rp "$MEGA_CONF already exists. Overwrite? [y/N]: " ov_mega
else
  ov_mega=y
fi
if [[ "$ov_mega" =~ ^[Yy]$ ]]; then
  echo
  echo "Enter your Mega.io login (sign up free at https://mega.io/register — 20 GB, no card):"
  ask MEGA_EMAIL    "  Mega email"
  ask MEGA_PASSWORD "  Mega password" secret

  umask 077
  cat > "$MEGA_CONF" <<EOF
[Login]
Username = $MEGA_EMAIL
Password = $MEGA_PASSWORD
EOF
  chmod 600 "$MEGA_CONF"
  ok "Wrote $MEGA_CONF (root:root 0600)"
fi

# 3 · Backup env config
if [[ -f "$CONF" ]]; then
  read -rp "$CONF already exists. Overwrite? [y/N]: " ov_conf
else
  ov_conf=y
fi
if [[ "$ov_conf" =~ ^[Yy]$ ]]; then
  echo
  read -rp "  Mongo DB name [test_database]: " MONGO_DB; MONGO_DB="${MONGO_DB:-test_database}"
  read -rp "  Mongo URI [mongodb://127.0.0.1:27017]: " MONGO_URI; MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"
  read -rp "  Mega remote folder [/Root/rox-taxi-backups]: " MEGA_REMOTE_DIR; MEGA_REMOTE_DIR="${MEGA_REMOTE_DIR:-/Root/rox-taxi-backups}"
  read -rp "  Retention days [30]: " BACKUP_RETENTION_DAYS; BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

  umask 077
  cat > "$CONF" <<EOF
# Rox Taxi backup config — auto-generated $(date -u)
# Owned by root, 0600. Edit with: sudo nano $CONF
MONGO_URI="$MONGO_URI"
MONGO_DB="$MONGO_DB"
MEGA_REMOTE_DIR="$MEGA_REMOTE_DIR"
BACKUP_RETENTION_DAYS="$BACKUP_RETENTION_DAYS"
EOF
  chmod 600 "$CONF"
  ok "Wrote $CONF (root:root 0600)"
fi

# 4 · Smoke test — verify Mega login before scheduling anything
log "Verifying Mega login…"
if megals --config "$MEGA_CONF" / >/dev/null 2>&1; then
  ok "Mega login works."
else
  echo "❌ Mega login failed. Check the email/password in $MEGA_CONF and re-run this installer."
  exit 1
fi

log "Running one-shot backup as a smoke test…"
if bash "$BACKUP_SCRIPT"; then
  ok "First backup uploaded successfully."
else
  echo "❌ Smoke test failed. Fix values in $CONF or $MEGA_CONF and re-run."
  exit 1
fi

# 5 · systemd timer
SERVICE=/etc/systemd/system/rox-backup.service
TIMER=/etc/systemd/system/rox-backup.timer

cat > "$SERVICE" <<EOF
[Unit]
Description=Rox Taxi nightly MongoDB → Mega.io backup
After=network-online.target mongod.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$BACKUP_SCRIPT
User=root
Nice=10
IOSchedulingClass=idle
EOF

cat > "$TIMER" <<EOF
[Unit]
Description=Nightly Rox Taxi backup at 03:15 UTC

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=15min
Unit=rox-backup.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now rox-backup.timer >/dev/null
ok "Nightly backup enabled — runs at 03:15 UTC daily."
echo
echo "Next steps:"
echo "  • Verify:  systemctl list-timers rox-backup.timer"
echo "  • Logs:    tail -n 40 /var/log/rox-backup.log"
echo "  • Run now: sudo systemctl start rox-backup.service"
echo "  • Browse:  megals --config $MEGA_CONF /Root/rox-taxi-backups"
echo "  • Restore: see BACKUP_MEGA.md → Restore section"
