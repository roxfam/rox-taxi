#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Rox Taxi — nightly MongoDB → Backblaze B2 backup
#
# What it does:
#   1. Runs `mongodump` on the local Rox Taxi DB
#   2. Tars + gzips the dump into /var/backups/rox-mongo/<date>.tgz
#   3. Uploads the archive to a Backblaze B2 bucket (via the `b2` CLI)
#   4. Prunes local + remote backups older than BACKUP_RETENTION_DAYS
#
# Reads config from /etc/rox-backup.env (created by install-backup-cron.sh).
# Expected keys:
#   MONGO_URI                — usually mongodb://127.0.0.1:27017
#   MONGO_DB                 — Rox Taxi database name
#   B2_APPLICATION_KEY_ID    — from Backblaze → App Keys
#   B2_APPLICATION_KEY       — from Backblaze → App Keys
#   B2_BUCKET                — the bucket you created (e.g. rox-taxi-backups)
#   BACKUP_RETENTION_DAYS    — default 30
#
# Every step logs to /var/log/rox-backup.log so you can see what happened
# each morning in one place.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

CONF="${ROX_BACKUP_CONF:-/etc/rox-backup.env}"
LOG="${ROX_BACKUP_LOG:-/var/log/rox-backup.log}"
LOCAL_DIR="${ROX_BACKUP_DIR:-/var/backups/rox-mongo}"

# --- helpers ---------------------------------------------------------
ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG"; }
die() { log "ERROR: $*"; exit 1; }

# --- load config -----------------------------------------------------
[[ -f "$CONF" ]] || die "Config not found: $CONF (run scripts/install-backup-cron.sh first)"
# shellcheck disable=SC1090
set -a; source "$CONF"; set +a

: "${MONGO_URI:?MONGO_URI missing in $CONF}"
: "${MONGO_DB:?MONGO_DB missing in $CONF}"
: "${B2_APPLICATION_KEY_ID:?B2_APPLICATION_KEY_ID missing in $CONF}"
: "${B2_APPLICATION_KEY:?B2_APPLICATION_KEY missing in $CONF}"
: "${B2_BUCKET:?B2_BUCKET missing in $CONF}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

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

# --- 3. b2 upload ----------------------------------------------------
if ! command -v b2 >/dev/null; then
  die "b2 CLI not installed. Run: sudo pip install --upgrade b2"
fi

# Authorize is idempotent — cached creds in ~/.b2_account_info.
log "▶ b2 authorize"
b2 account authorize "$B2_APPLICATION_KEY_ID" "$B2_APPLICATION_KEY" >/dev/null 2>&1 \
  || b2 authorize-account "$B2_APPLICATION_KEY_ID" "$B2_APPLICATION_KEY" >/dev/null 2>&1 \
  || die "b2 authorize failed"

REMOTE_NAME="mongo/$(basename "$ARCHIVE")"
log "▶ upload → b2://$B2_BUCKET/$REMOTE_NAME"
b2 file upload --quiet "$B2_BUCKET" "$ARCHIVE" "$REMOTE_NAME" >/dev/null 2>&1 \
  || b2 upload-file --quiet "$B2_BUCKET" "$ARCHIVE" "$REMOTE_NAME" >/dev/null 2>&1 \
  || die "b2 upload failed"
log "✔ upload ok"

# --- 4. prune --------------------------------------------------------
log "▶ prune local backups older than ${BACKUP_RETENTION_DAYS}d"
find "$LOCAL_DIR" -maxdepth 1 -type f -name 'rox-mongo-*.tgz' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete \
  | while read -r p; do log "  removed local $p"; done || true

# B2 lifecycle rules on the bucket handle remote retention best — but as a
# safety net, we also delete objects older than the retention window here.
CUTOFF_EPOCH=$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +%s000 2>/dev/null || echo 0)
if [[ "$CUTOFF_EPOCH" != "0" ]]; then
  log "▶ prune B2 objects older than ${BACKUP_RETENTION_DAYS}d (cutoff=${CUTOFF_EPOCH})"
  b2 ls --json "$B2_BUCKET" "mongo/" 2>/dev/null \
    | python3 -c "
import json,sys
cutoff=int('${CUTOFF_EPOCH}')
try:
    data=json.load(sys.stdin)
except Exception:
    data=[]
for row in data:
    ts=row.get('uploadTimestamp',0)
    if ts and ts < cutoff:
        print(row['fileName'])
" 2>/dev/null | while read -r f; do
      [[ -z "$f" ]] && continue
      b2 rm "b2://$B2_BUCKET/$f" >/dev/null 2>&1 \
        || b2 delete-file-version "$f" "$(b2 file-info "b2://$B2_BUCKET/$f" 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["fileId"])' 2>/dev/null)" >/dev/null 2>&1 \
        || true
      log "  removed remote $f"
    done
fi

log "✔ backup complete ($SIZE) → b2://$B2_BUCKET/$REMOTE_NAME"
