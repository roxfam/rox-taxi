#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Rox Taxi — VPS bootstrap (2GB Namecheap Pulsar Ubuntu 22.04+)
#
# Usage on a blank server:
#   ssh rox@<VPS_IP>
#   curl -fsSL https://raw.githubusercontent.com/<you>/rox-taxi/main/scripts/bootstrap-vps.sh | bash
#
# What it does (idempotent — safe to re-run):
#   1. Adds 2GB swap (yarn build OOMs on 2GB RAM without it)
#   2. Sets swappiness=10 so Mongo doesn't get paged out
#   3. Installs Node 20, Python 3.11, Nginx, certbot, MongoDB 7, yarn, git, ufw, fail2ban
#   4. Caps MongoDB WiredTiger cache at 512MB (default is too much for 2GB VPS)
#   5. Configures UFW to allow SSH + Nginx only
#
# After this finishes, continue with QUICKSTART_NAMECHEAP_2GB.md step 5 (DNS).
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

log() { echo -e "\033[1;34m▶\033[0m $*"; }
ok()  { echo -e "\033[1;32m✔\033[0m $*"; }

if [[ $EUID -eq 0 ]]; then
  echo "❌ Do not run as root. Run as a normal sudo user (rox) — the script uses sudo where needed."
  exit 1
fi
if ! command -v sudo >/dev/null; then
  echo "❌ sudo not installed. Log in as root once: apt install -y sudo && usermod -aG sudo $(whoami)"
  exit 1
fi

# 1 · Swap (critical for 2GB RAM)
if ! swapon --show 2>/dev/null | grep -q /swapfile; then
  log "Creating 2GB swap file (critical for yarn build on 2GB RAM)..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  ok "Swap active ($(free -h | awk '/Swap:/ {print $2}'))"
else
  ok "Swap already active"
fi
if ! grep -q 'vm.swappiness=10' /etc/sysctl.conf; then
  echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf >/dev/null
  sudo sysctl -p >/dev/null
  ok "swappiness=10 applied"
fi

# 2 · Apt update
log "Updating apt cache..."
sudo apt update -q
sudo apt upgrade -y -q

# 3 · Node 20 LTS
if ! command -v node >/dev/null || [[ $(node -v | sed 's/v//' | cut -d. -f1) -lt 20 ]]; then
  log "Installing Node 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt install -y nodejs
fi
ok "Node $(node -v)"

# 4 · System packages
log "Installing Python 3.11, Nginx, certbot, git, ufw, fail2ban..."
sudo apt install -y python3.11 python3.11-venv python3.11-dev build-essential \
                    git ufw fail2ban nginx certbot python3-certbot-nginx htop

# 5 · yarn
if ! command -v yarn >/dev/null; then
  log "Installing yarn..."
  sudo npm install -g yarn
fi
ok "yarn $(yarn --version)"

# 6 · MongoDB 7
if ! command -v mongod >/dev/null; then
  log "Installing MongoDB 7..."
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
       sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -sc)/mongodb-org/7.0 multiverse" | \
       sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list >/dev/null
  sudo apt update -q
  sudo apt install -y mongodb-org
fi
sudo systemctl enable --now mongod

# 7 · Cap Mongo cache at 512MB (default = half RAM = too much on 2GB VPS)
if ! grep -q 'cacheSizeGB' /etc/mongod.conf; then
  log "Capping MongoDB WiredTiger cache at 512MB..."
  sudo sed -i '/^storage:/a\  wiredTiger:\n    engineConfig:\n      cacheSizeGB: 0.5' /etc/mongod.conf
  sudo systemctl restart mongod
fi
ok "MongoDB running with 512MB cache"

# 8 · Firewall
log "Configuring UFW firewall (SSH + Nginx only)..."
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow "Nginx Full" >/dev/null
sudo ufw --force enable >/dev/null
ok "UFW active — ports 22, 80, 443 open"

# 9 · fail2ban
sudo systemctl enable --now fail2ban >/dev/null 2>&1 || true
ok "fail2ban active (SSH brute-force protection)"

echo
echo -e "\033[1;32m═══════════════════════════════════════════════════════════════\033[0m"
echo -e "\033[1;32m  ✅  System ready. Continue with QUICKSTART step 5 (DNS).\033[0m"
echo -e "\033[1;32m═══════════════════════════════════════════════════════════════\033[0m"
echo
echo "  Node:     $(node -v)"
echo "  Python:   $(python3.11 --version)"
echo "  yarn:     $(yarn --version)"
echo "  Swap:     $(free -h | awk '/Swap:/ {print $2}')"
echo
echo "  Next steps:"
echo "    1) Point roxtaxi.com A records at $(curl -s ifconfig.me 2>/dev/null || echo '<this VPS IP>')"
echo "    2) git clone <your-repo> /home/$(whoami)/app"
echo "    3) Follow QUICKSTART_NAMECHEAP_2GB.md from step 7 (env vars)"
echo
