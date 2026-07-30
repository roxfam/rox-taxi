#!/usr/bin/env bash
# ─── Rox Taxi — one-shot VPS bootstrap ──────────────────────────────────
# Installs EVERY piece of software this app needs onto a fresh Ubuntu VPS.
# Run this ONCE after your first SSH login to a brand-new Namecheap Pulsar.
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/rox-taxi/main/scripts/bootstrap-vps.sh | sudo bash
#   OR (safer):
#   ssh root@<VPS_IP>
#   cd /root && wget https://raw.githubusercontent.com/<you>/rox-taxi/main/scripts/bootstrap-vps.sh
#   chmod +x bootstrap-vps.sh
#   sudo ./bootstrap-vps.sh
#
# After this finishes, follow DEPLOYMENT.md from section 4 onwards.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
   echo "Please run as root:  sudo ./bootstrap-vps.sh"
   exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Rox Taxi VPS bootstrap — this will install:"
echo ""
echo "    • Node 20 LTS         (for the frontend build)"
echo "    • Python 3.11 + venv  (for the FastAPI backend)"
echo "    • MongoDB 7           (production database)"
echo "    • Nginx               (reverse proxy + static server)"
echo "    • Certbot             (Let's Encrypt HTTPS)"
echo "    • UFW firewall        (port 22/80/443 only)"
echo "    • fail2ban            (SSH brute-force protection)"
echo "    • yarn                (frontend package manager)"
echo "    • git + build tools   (compile + version control)"
echo "    • 2 GB swap file      (for yarn build on 2GB RAM Pulsar)"
echo ""
echo "  Estimated time: 8-15 minutes."
echo "═══════════════════════════════════════════════════════════════"
echo ""
read -p "Continue? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── 1. System update ────────────────────────────────────────────────
echo ""; echo "▶ [1/9] Updating apt package index …"
apt update
apt upgrade -y

# ── 2. Base tools ──────────────────────────────────────────────────
echo ""; echo "▶ [2/9] Installing base tools (git, build-essential, curl, gnupg, ufw, fail2ban, htop) …"
apt install -y git build-essential curl gnupg lsb-release ca-certificates ufw fail2ban htop

# ── 3. Node 20 LTS ─────────────────────────────────────────────────
echo ""; echo "▶ [3/9] Installing Node 20 LTS + yarn …"
if ! command -v node >/dev/null || ! node -v | grep -q "v20"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
npm install -g yarn --force
echo "   node $(node -v),  yarn $(yarn -v)"

# ── 4. Python 3.11 ─────────────────────────────────────────────────
echo ""; echo "▶ [4/9] Installing Python 3.11 …"
apt install -y python3.11 python3.11-venv python3.11-dev python3-pip
python3.11 --version

# ── 5. MongoDB 7 ───────────────────────────────────────────────────
echo ""; echo "▶ [5/9] Installing MongoDB 7 …"
if ! command -v mongod >/dev/null; then
    curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor --yes
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -sc)/mongodb-org/7.0 multiverse" \
        > /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt update
    apt install -y mongodb-org
fi
systemctl enable --now mongod
sleep 3
systemctl is-active --quiet mongod && echo "   MongoDB running ✓" || { echo "   MongoDB failed to start"; journalctl -u mongod -n 30; exit 1; }

# ── 6. Nginx + Certbot ─────────────────────────────────────────────
echo ""; echo "▶ [6/9] Installing Nginx + certbot …"
apt install -y nginx certbot python3-certbot-nginx
systemctl enable --now nginx

# ── 7. UFW firewall ────────────────────────────────────────────────
echo ""; echo "▶ [7/9] Configuring UFW firewall …"
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable
ufw status verbose

# ── 8. fail2ban SSH protection ─────────────────────────────────────
echo ""; echo "▶ [8/9] Enabling fail2ban …"
systemctl enable --now fail2ban

# ── 9. 2 GB swap file (Pulsar has 2 GB RAM — yarn build needs it) ──
echo ""; echo "▶ [9/9] Adding 2 GB swap file …"
if ! swapon --show | grep -q "/swapfile"; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "   Swap active ✓"
else
    echo "   Swap already active."
fi

# ── done ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ Bootstrap complete."
echo ""
echo "  Installed versions:"
echo "    node    $(node -v 2>/dev/null || echo missing)"
echo "    yarn    $(yarn -v 2>/dev/null || echo missing)"
echo "    python  $(python3.11 --version 2>/dev/null || echo missing)"
echo "    mongod  $(mongod --version 2>/dev/null | head -1 | awk '{print $3}' || echo missing)"
echo "    nginx   $(nginx -v 2>&1 | awk -F/ '{print $2}')"
echo "    certbot $(certbot --version 2>&1 | awk '{print $2}')"
echo ""
echo "  Next steps (see DEPLOYMENT.md for full detail):"
echo ""
echo "    1. Create the non-root 'rox' user:"
echo "         adduser rox && usermod -aG sudo rox"
echo ""
echo "    2. Clone the repo into /home/rox/app:"
echo "         su - rox"
echo "         git clone https://github.com/<you>/rox-taxi.git app"
echo ""
echo "    3. Fill in backend/.env and frontend/.env from the *.example files."
echo ""
echo "    4. Install app dependencies:"
echo "         cd ~/app/backend && python3.11 -m venv venv"
echo "         source venv/bin/activate && pip install -r requirements.txt"
echo "         pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/"
echo "         cd ~/app/frontend && yarn install --frozen-lockfile && yarn build"
echo ""
echo "    5. Install the systemd service (see DEPLOYMENT.md § 8),"
echo "       configure Nginx (§ 9), and run certbot (§ 10)."
echo ""
echo "═══════════════════════════════════════════════════════════════"
