#!/usr/bin/env bash
# Rox Taxi — nightly self-update from GitHub (run by the rox-auto-update systemd timer).
# Only acts when GitHub has new commits. If the new build or backend fails, it rolls back.
set -uo pipefail

APP_DIR="${ROX_APP_DIR:-/home/rox/app}"
SERVICE="${ROX_BACKEND_SERVICE:-rox-api}"
LOG=/var/log/rox-auto-update.log
OWNER="$(stat -c %U "$APP_DIR")"
exec >>"$LOG" 2>&1
echo; echo "===== $(date '+%F %T') auto-update ====="

as_owner() { runuser -u "$OWNER" -- env GIT_TERMINAL_PROMPT=0 HOME="/home/$OWNER" "$@"; }
backend_ok() {
  for _ in $(seq 1 20); do
    curl -fsS --max-time 5 http://127.0.0.1:8001/api/site-config >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

cd "$APP_DIR" || { echo "!! $APP_DIR missing"; exit 1; }
as_owner git fetch --quiet origin || { echo "!! git fetch failed (GitHub login?)"; exit 1; }
BRANCH="$(as_owner git rev-parse --abbrev-ref HEAD)"
BEFORE="$(as_owner git rev-parse HEAD)"
REMOTE="$(as_owner git rev-parse "origin/$BRANCH")"
if [[ "$BEFORE" == "$REMOTE" ]]; then echo "Already up to date ($BEFORE)"; exit 0; fi

as_owner git merge --ff-only --quiet "origin/$BRANCH" || { echo "!! Local changes block the update; nothing changed"; exit 1; }
echo "Updated $BEFORE -> $REMOTE"
as_owner git --no-pager log --oneline "$BEFORE..$REMOTE"
CHANGED="$(as_owner git diff --name-only "$BEFORE" "$REMOTE")"

rollback() {
  echo "!! $1 — rolling back to $BEFORE"
  as_owner git reset --hard --quiet "$BEFORE"
  systemctl restart "$SERVICE"
  exit 1
}

if grep -q '^backend/requirements.txt$' <<<"$CHANGED"; then
  as_owner "$APP_DIR/backend/venv/bin/pip" install -q -r backend/requirements.txt \
    --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ || rollback "pip install failed"
fi

if grep -q '^frontend/' <<<"$CHANGED"; then
  cd "$APP_DIR/frontend"
  if grep -qE '^frontend/(package.json|yarn.lock)$' <<<"$CHANGED"; then
    as_owner yarn install --frozen-lockfile --silent || rollback "yarn install failed"
  fi
  rm -rf build.new
  as_owner env BUILD_PATH=build.new NODE_OPTIONS="--max-old-space-size=1536" yarn build >/dev/null \
    && [[ -f build.new/index.html ]] || { rm -rf build.new; rollback "website build failed (live site untouched)"; }
  rm -rf build.old; [[ -d build ]] && mv build build.old; mv build.new build
  cd "$APP_DIR"
fi

systemctl restart "$SERVICE"
if ! backend_ok; then
  [[ -d frontend/build.old ]] && { rm -rf frontend/build; mv frontend/build.old frontend/build; }
  rollback "backend did not start"
fi
systemctl reload nginx 2>/dev/null || true
echo "Done ✓ site running $REMOTE"
