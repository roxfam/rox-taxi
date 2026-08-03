#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Rox Taxi — nightly MongoDB → Mega.io backup
#
# What it does:
#   1. Runs `mongodump` on the local Rox Taxi DB
#   2. Tars + gzips the dump into /var/backups/rox-mongo/<date>.tgz
#   3. Uploads the archive to Mega.io using `megaput`
#   4. Prunes local + remote backups older than BACKUP_RETENTION_DAYS
#
# Reads Mega credentials from a config file (defaults to /etc/rox-mega.ini).
# Format (auto-created by install-backup-cron.sh):
#     [Login]
#     Username = you@example.com
#     Password = your-mega-password
#
# Reads Mongo + retention config from /etc/rox-backup.env:
#     MONGO_URI, MONGO_DB, MEGA_REMOTE_DIR, BACKUP_RETENTION_DAYS
#
# Logs every step to /var/log/rox-backup.log so you can see what happened
# each morning in one place.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

CONF="${ROX_BACKUP_CONF:-/etc/rox-backup.env}"
MEGA_CONF="${ROX_MEGA_CONF:-/etc/rox-mega.ini}"
LOG="${ROX_BACKUP_LOG:-/var/log/rox-backup.log}"
LOCAL_DIR="${ROX_BACKUP_DIR:-/var/backups/rox-mongo}"

ts()   { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log()  { echo "[$(ts)] $*" | tee -a "$LOG"; }
die()  { log "ERROR: $*"; exit 1; }

[[ -f "$CONF"      ]] || die "Config not found: $CONF (run scripts/install-backup-cron.sh first)"
[[ -f "$MEGA_CONF" ]] || die "Mega login not found: $MEGA_CONF (run scripts/install-backup-cron.sh first)"

# shellcheck disable=SC1090
set -a; source "$CONF"; set +a

: "${MONGO_URI:?MONGO_URI missing in $CONF}"
: "${MONGO_DB:?MONGO_DB missing in $CONF}"
MEGA_REMOTE_DIR="${MEGA_REMOTE_DIR:-/Root/rox-taxi-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

command -v megaput >/dev/null   || die "megaput not installed. Run: sudo apt install megatools"
command -v mongodump >/dev/null || die "mongodump not installed. Install mongodb-database-tools."

mkdir -p "$LOCAL_DIR" "$(dirname "$LOG")"

# --- 1. mongodump ----------------------------------------------------
STAMP="$(date -u '+%Y%m%d-%H%M%S')"
DUMP_DIR="$(mktemp -d)"
ARCHIVE="$LOCAL_DIR/rox-mongo-${STAMP}.tgz"
trap 'rm -rf "$DUMP_DIR"' EXIT

log "▶ mongodump start db=$MONGO_DB → $DUMP_DIR"
mongodump --uri="$MONGO_URI" --db="$MONGO_DB" --out="$DUMP_DIR" --quiet \
  || die "mongodump failed"
log "✔ mongodump ok"

# --- 2. compress -----------------------------------------------------
log "▶ compress → $ARCHIVE"
tar -C "$DUMP_DIR" -czf "$ARCHIVE" "$MONGO_DB" \
  || die "tar failed"
SIZE=$(du -h "$ARCHIVE" | cut -f1)
log "✔ archive ready ($SIZE)"

# --- 3. mega upload --------------------------------------------------
# Ensure remote directory exists (idempotent — ignore "already exists" error).
megamkdir --config "$MEGA_CONF" "$MEGA_REMOTE_DIR" >/dev/null 2>&1 || true

log "▶ upload → mega:${MEGA_REMOTE_DIR}/$(basename "$ARCHIVE")"
if megaput --config "$MEGA_CONF" --path "$MEGA_REMOTE_DIR/" --disable-previews "$ARCHIVE"; then
  log "✔ upload ok"
else
  die "megaput failed — check Mega credentials in $MEGA_CONF and free space at mega.io"
fi

# --- 4. prune local --------------------------------------------------
log "▶ prune local backups older than ${BACKUP_RETENTION_DAYS}d"
find "$LOCAL_DIR" -maxdepth 1 -type f -name 'rox-mongo-*.tgz' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete 2>/dev/null \
  | while read -r p; do log "  removed local $p"; done || true

# --- 5. prune remote (Mega) ------------------------------------------
# megatools doesn't expose the mtime cleanly, so we parse the YYYYMMDD out of
# each filename we created (`rox-mongo-YYYYMMDD-HHMMSS.tgz`) and delete anything
# older than the retention window.
log "▶ prune Mega backups older than ${BACKUP_RETENTION_DAYS}d"
CUTOFF="$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" '+%Y%m%d')"
megals --config "$MEGA_CONF" "$MEGA_REMOTE_DIR" 2>/dev/null | while read -r remote_path; do
  fname="$(basename "$remote_path")"
  [[ "$fname" =~ ^rox-mongo-([0-9]{8})-([0-9]{6})\.tgz$ ]] || continue
  file_date="${BASH_REMATCH[1]}"
  if [[ "$file_date" < "$CUTOFF" ]]; then
    if megarm --config "$MEGA_CONF" "$remote_path" >/dev/null 2>&1; then
      log "  removed remote $fname"
    fi
  fi
done

log "✔ backup complete ($SIZE) → mega:${MEGA_REMOTE_DIR}/$(basename "$ARCHIVE")"
