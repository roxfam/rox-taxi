#!/usr/bin/env bash
# ─── Rox Taxi — post-deploy smoke test ───────────────────────────────
# Run this ON THE VPS (or any machine that can reach the public URL) AFTER
# certbot completes and Nginx serves HTTPS.
#
# Verifies:
#   1. Frontend HTML loads over HTTPS with the correct title
#   2. /api/site-config returns 200 + valid JSON
#   3. /api/tours, /api/rentals, /api/taxi-services return non-empty arrays
#   4. Admin login returns a JWT
#   5. /api/live-stats reachable (used by social-proof chip)
#
# Usage:
#   chmod +x scripts/vps-smoke-test.sh
#   ./scripts/vps-smoke-test.sh                    # defaults to roxtaxi.com
#   ./scripts/vps-smoke-test.sh https://staging.roxtaxi.com
#
# Admin credentials: reads from ~/app/backend/.env if present, else prompts.

set -euo pipefail

BASE_URL="${1:-https://roxtaxi.com}"
PASS=0
FAIL=0

C_RESET='\033[0m'
C_OK='\033[0;32m'
C_FAIL='\033[0;31m'
C_INFO='\033[0;36m'
C_DIM='\033[0;90m'

echo ""
echo -e "${C_INFO}═══════════════════════════════════════════════════════════${C_RESET}"
echo -e "${C_INFO}  Rox Taxi — production smoke test${C_RESET}"
echo -e "${C_INFO}  Target: $BASE_URL${C_RESET}"
echo -e "${C_INFO}═══════════════════════════════════════════════════════════${C_RESET}"

check() {
  local label="$1"; shift
  echo -en "  ${C_DIM}▸${C_RESET} $label ... "
  if "$@" >/tmp/smoke.out 2>/tmp/smoke.err; then
    echo -e "${C_OK}✓${C_RESET}"
    PASS=$((PASS+1))
  else
    echo -e "${C_FAIL}✗${C_RESET}"
    echo -e "    ${C_FAIL}stdout:${C_RESET} $(head -c 300 /tmp/smoke.out)"
    echo -e "    ${C_FAIL}stderr:${C_RESET} $(head -c 300 /tmp/smoke.err)"
    FAIL=$((FAIL+1))
  fi
}

# ── 1. Frontend index.html ─────────────────────────────────────────
check "Frontend index (HTTPS + title)" bash -c "
  curl -sSf --max-time 10 '$BASE_URL/' | grep -qi 'rox taxi'
"

# ── 2. /api/site-config ────────────────────────────────────────────
check "Backend /api/site-config" bash -c "
  curl -sSf --max-time 10 '$BASE_URL/api/site-config' \
    | python3 -c 'import sys, json; d=json.load(sys.stdin); assert isinstance(d, dict) and (\"phone\" in d or \"facebook_url\" in d or \"tripadvisor_url\" in d), d'
"

# ── 3. Catalog endpoints ───────────────────────────────────────────
check "Backend /api/tours (non-empty)" bash -c "
  curl -sSf --max-time 10 '$BASE_URL/api/tours' \
    | python3 -c 'import sys, json; d=json.load(sys.stdin); assert isinstance(d, list) and len(d) > 0, len(d)'
"

check "Backend /api/rentals (non-empty)" bash -c "
  curl -sSf --max-time 10 '$BASE_URL/api/rentals' \
    | python3 -c 'import sys, json; d=json.load(sys.stdin); assert isinstance(d, list) and len(d) > 0, len(d)'
"

check "Backend /api/taxi-services (non-empty)" bash -c "
  curl -sSf --max-time 10 '$BASE_URL/api/taxi-services' \
    | python3 -c 'import sys, json; d=json.load(sys.stdin); assert isinstance(d, list) and len(d) > 0, len(d)'
"

check "Backend /api/live-stats" bash -c "
  curl -sSf --max-time 10 '$BASE_URL/api/live-stats' \
    | python3 -c 'import sys, json; d=json.load(sys.stdin); assert isinstance(d, dict), d'
"

# ── 4. Admin login ─────────────────────────────────────────────────
ENV_FILE="${HOME}/app/backend/.env"
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
if [[ -f "$ENV_FILE" ]]; then
  ADMIN_EMAIL=$(grep -E '^ADMIN_EMAIL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
fi
if [[ -z "$ADMIN_EMAIL" ]]; then
  read -rp "  Admin email: " ADMIN_EMAIL
fi
read -rsp "  Admin password (input hidden): " ADMIN_PASSWORD
echo ""

check "Admin login returns JWT" bash -c "
  curl -sSf --max-time 10 -X POST '$BASE_URL/api/auth/login' \
    -H 'Content-Type: application/json' \
    -d '{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}' \
    | python3 -c 'import sys, json; d=json.load(sys.stdin); assert d.get(\"token\",\"\").startswith(\"eyJ\"), d'
"

# ── 5. TLS certificate freshness ────────────────────────────────────
check "TLS cert valid + not expired" bash -c "
  echo | openssl s_client -servername ${BASE_URL#https://} -connect ${BASE_URL#https://}:443 2>/dev/null \
    | openssl x509 -noout -checkend 604800
"
# 604800s = 7 days — warns if cert expires in less than a week.

# ── 6. HTTPS redirect ───────────────────────────────────────────────
check "HTTP → HTTPS redirect" bash -c "
  code=\$(curl -o /dev/null -s -w '%{http_code}' --max-time 10 'http://${BASE_URL#https://}/')
  [[ \"\$code\" == '301' || \"\$code\" == '302' || \"\$code\" == '308' ]]
"

# ── Summary ─────────────────────────────────────────────────────────
echo ""
echo -e "${C_INFO}═══════════════════════════════════════════════════════════${C_RESET}"
TOTAL=$((PASS+FAIL))
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "  ${C_OK}✓ All $TOTAL checks passed. Rox Taxi is live.${C_RESET}"
  echo ""
  echo -e "  Next: open ${C_OK}$BASE_URL${C_RESET} in a browser and confirm:"
  echo -e "    • Homepage loads with the gold logo"
  echo -e "    • /taxi, /tours, /rentals show catalog"
  echo -e "    • /admin/login accepts your credentials"
  echo -e "    • Book a \$1 taxi (or use test-mode Stripe) end to end"
  exit 0
else
  echo -e "  ${C_FAIL}✗ $FAIL of $TOTAL checks FAILED.${C_RESET}"
  echo ""
  echo -e "  Debug next steps:"
  echo -e "    ${C_DIM}sudo journalctl -u rox-api -n 100${C_RESET}   # backend logs"
  echo -e "    ${C_DIM}sudo nginx -t && sudo systemctl reload nginx${C_RESET}"
  echo -e "    ${C_DIM}sudo systemctl status rox-api mongod${C_RESET}"
  echo -e "    ${C_DIM}dig +short ${BASE_URL#https://}${C_RESET}     # DNS sanity"
  exit 1
fi
