#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Rox Taxi — one-shot installer for nightly Mongo → Backblaze B2 backups.
#
# What it does:
#   1. Installs the `b2` CLI (pip)
#   2. Prompts for your Backblaze credentials + writes /etc/rox-backup.env
#   3. Runs backup-mongo-b2.sh once as a smoke test (fails fast if creds bad)
#   4. Installs a systemd timer that runs the backup nightly at 03:15 UTC
#
# Usage on the VPS:
#   sudo bash scripts/install-backup-cron.sh
#
# Backblaze B2 setup (get these before running the installer):
#   1. https://www.backblaze.com/b2/sign-up.html  (free 10GB tier)
#   2. Buckets → Create Bucket   → e.g. rox-taxi-backups  (Private)
#   3. Buckets → Lifecycle Rules → "Keep only the last version"
#   4. App Keys → Add a New Application Key
#        Name: rox-taxi-nightly-backup
#        Allow access to bucket: rox-taxi-backups
#        Type: Read and Write
#      Copy the keyID and applicationKey — you only see them once.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "▶ Elevating with sudo…"; exec sudo "$0" "$@"
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-mongo-b2.sh"

log() { echo -e "\033[1;34m▶\033[0m $*"; }
ok()  { echo -e "\033[1;32m✔\033[0m $*"; }
ask() { local var="$1" prompt="$2" secret="${3:-}"; local val=""
  while [[ -z "$val" ]]; do
    if [[ "$secret" == "secret" ]]; then read -rsp "$prompt: " val; echo
    else read -rp "$prompt: " val; fi
  done
  printf -v "$var" '%s' "$val"
}

[[ -f "$BACKUP_SCRIPT" ]] || { echo "backup-mongo-b2.sh not found at $BACKUP_SCRIPT"; exit 1; }
chmod +x "$BACKUP_SCRIPT"

# 1 · b2 CLI
if ! command -v b2 >/dev/null; then
  log "Installing Backblaze B2 CLI…"
  pip3 install --upgrade b2 --quiet
  ok "b2 installed: $(b2 version | head -n1)"
fi
# Also needs mongodump — Ubuntu Mongo package installs it by default.
command -v mongodump >/dev/null || { echo "❌ mongodump missing. Install mongodb-database-tools."; exit 1; }

# 2 · Prompt + write config
CONF=/etc/rox-backup.env
if [[ -f "$CONF" ]]; then
  read -rp "$CONF already exists. Overwrite? [y/N]: " ov
  [[ "$ov" =~ ^[Yy]$ ]] || { ok "Keeping existing config."; }
fi
if [[ ! -f "$CONF" || "$ov" =~ ^[Yy]$ ]]; then
  echo
  echo "Enter your Backblaze B2 credentials (see the header of this script for how to get them):"
  ask B2_APPLICATION_KEY_ID   "  keyID"
  ask B2_APPLICATION_KEY      "  applicationKey" secret
  ask B2_BUCKET               "  bucket name" 
  read -rp "  Mongo DB name [test_database]: " MONGO_DB; MONGO_DB="${MONGO_DB:-test_database}"
  read -rp "  Mongo URI [mongodb://127.0.0.1:27017]: " MONGO_URI; MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"
  read -rp "  Retention days [30]: " BACKUP_RETENTION_DAYS; BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

  umask 077
  cat > "$CONF" <<EOF
# Rox Taxi backup config — auto-generated $(date -u)
# Owned by root, 0600. Edit with: sudo nano $CONF
MONGO_URI="$MONGO_URI"
MONGO_DB="$MONGO_DB"
B2_APPLICATION_KEY_ID="$B2_APPLICATION_KEY_ID"
B2_APPLICATION_KEY="$B2_APPLICATION_KEY"
B2_BUCKET="$B2_BUCKET"
BACKUP_RETENTION_DAYS="$BACKUP_RETENTION_DAYS"
EOF
  chmod 600 "$CONF"
  ok "Wrote $CONF (root:root 0600)"
fi

# 3 · Smoke test — run backup once
log "Running one-shot backup to verify config…"
if bash "$BACKUP_SCRIPT"; then
  ok "First backup uploaded successfully."
else
  echo "❌ Smoke test failed. Fix credentials in $CONF and re-run this installer."
  exit 1
fi

# 4 · Install systemd timer
SERVICE=/etc/systemd/system/rox-backup.service
TIMER=/etc/systemd/system/rox-backup.timer

cat > "$SERVICE" <<EOF
[Unit]
Description=Rox Taxi nightly MongoDB → Backblaze B2 backup
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
echo "  • Restore: see BACKUP_BACKBLAZE.md → Restore section"
