#!/usr/bin/env bash
# Rox Taxi — turn on nightly self-updates from GitHub (3:30 AM Nassau time).
# Usage on the VPS:  sudo bash /home/rox/app/scripts/install-auto-update.sh
set -euo pipefail
[[ $EUID -eq 0 ]] || exec sudo bash "$0" "$@"

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="${ROX_BACKEND_SERVICE:-rox-api}"
[[ -d "$APP_DIR/.git" ]] || { echo "!! $APP_DIR is not a GitHub copy"; exit 1; }
systemctl cat "$SERVICE" >/dev/null 2>&1 || { echo "!! Backend service '$SERVICE' not found"; exit 1; }
chmod +x "$APP_DIR/scripts/auto-update.sh"

cat > /etc/systemd/system/rox-auto-update.service <<EOF
[Unit]
Description=Rox Taxi nightly update from GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=ROX_APP_DIR=$APP_DIR
Environment=ROX_BACKEND_SERVICE=$SERVICE
ExecStart=/bin/bash $APP_DIR/scripts/auto-update.sh
Nice=10
EOF

cat > /etc/systemd/system/rox-auto-update.timer <<EOF
[Unit]
Description=Run Rox Taxi update nightly at 3:30 AM Nassau time

[Timer]
OnCalendar=*-*-* 03:30:00 America/Nassau
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now rox-auto-update.timer >/dev/null
echo "✔ Nightly updates ON (3:30 AM Nassau). Running one update now…"
systemctl start rox-auto-update.service || true
tail -n 15 /var/log/rox-auto-update.log
echo
echo "Next run: $(systemctl list-timers rox-auto-update.timer --no-legend | awk '{print $1, $2, $3}')"
echo "History:  tail -n 40 /var/log/rox-auto-update.log"
