# Rox Taxi — Ubuntu 24.04 · PuTTY · No-AVX CPU · Complete Install

For older/cheaper VPS CPUs without AVX, official MongoDB 5.0+ (including 8.0)
crashes with "Illegal instruction (core dumped)". Use one of these two paths:

- **Path A — Percona Server for MongoDB 7.0** (drop-in replacement, no AVX
  required, installs identically to MongoDB, same wire protocol). Recommended
  for a self-hosted setup.
- **Path B — MongoDB Atlas free tier** (cloud database, zero CPU concerns).
  Recommended if you'd rather skip DB admin entirely.

Both paths reach the same working `https://roxtaxi.com` in ~50 min total.

---

## Before you start (PuTTY basics)

- **Paste in PuTTY**: right-click inside the terminal window (or Shift+Insert)
- **Copy from PuTTY**: just select text with the mouse — it auto-copies
- **Ctrl+C** aborts a running command (safe if something hangs)
- Keep this doc open in a browser tab so you can copy blocks one at a time

---

## 1 · SSH in with PuTTY, create a normal user

Open PuTTY:
- **Host Name**: your VPS IP (from Namecheap dashboard)
- **Port**: 22 · **Connection type**: SSH
- Click **Open**. Accept the security alert on first connect.
- Login as: `root` · password: from Namecheap dashboard

Then:

```bash
apt update && apt upgrade -y
adduser rox                           # pick a strong password (you'll type it 3 times)
usermod -aG sudo rox
mkdir -p /home/rox/.ssh
chown -R rox:rox /home/rox/.ssh

# Log out root, log in as rox from PuTTY
exit
```

Open a new PuTTY session as `rox` with the password you just set.

**✔** `whoami` prints `rox`.

---

## 2 · Add 2GB swap (yarn build needs this)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
free -h                               # confirm Swap: 2.0Gi row
```

---

## 3 · System dependencies

### 3a · Wait for cloud-init to release the apt lock

```bash
while sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
  echo "Waiting for apt..."; sleep 5
done
```

### 3b · Add deadsnakes PPA (Python 3.11 isn't in Ubuntu 24.04 default repos)

```bash
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
```

### 3c · Install Python 3.11 + Node 20 + Nginx + certbot + git + firewall

```bash
sudo apt install -y python3.11 python3.11-venv python3.11-dev build-essential \
                    git ufw fail2ban nginx certbot python3-certbot-nginx htop

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# yarn
sudo npm install -g yarn
```

**✔** `node -v` → v20.x · `python3.11 --version` → Python 3.11.x

---

## 4 · Database — Pick Path A OR Path B

### 🅰 Path A · Percona Server for MongoDB 7.0 (no AVX needed)

100% wire-compatible with the app. Same commands, same clients, same driver.

```bash
# Add Percona's repo (works on Ubuntu 24.04 "noble")
curl -O https://repo.percona.com/apt/percona-release_latest.generic_all.deb
sudo apt install -y ./percona-release_latest.generic_all.deb
rm percona-release_latest.generic_all.deb

# Enable the psmdb-70 (Percona Server for MongoDB 7.0) repo
sudo percona-release setup psmdb-70
sudo apt update

# Install
sudo apt install -y percona-server-mongodb
sudo systemctl enable --now mongod

# Verify it started (no "Illegal instruction" now)
sudo systemctl status mongod          # should show "active (running)"
mongosh --eval "db.stats()"           # should connect and print JSON
```

**Cap the cache at 512MB for a 2GB VPS:**

```bash
sudo sed -i '/^storage:/a\  wiredTiger:\n    engineConfig:\n      cacheSizeGB: 0.5' /etc/mongod.conf
sudo systemctl restart mongod
```

Your `MONGO_URL` stays `mongodb://localhost:27017` — no changes anywhere else.

**Skip to step 5.**

### 🅱 Path B · MongoDB Atlas (zero local install)

If Path A gives you any trouble, use the cloud instead:

1. Open **https://www.mongodb.com/cloud/atlas/register** in your browser
2. Sign up (free) → click **Build a Database** → choose **M0 Free** cluster
3. Pick region **AWS us-east-1** (or closest to Nassau) → click **Create**
4. **Network Access → Add IP Address** → **Allow Access from Anywhere** (0.0.0.0/0)
   (Or add your VPS IP for a tighter setup — get it with `curl ifconfig.me` on the VPS)
5. **Database Access → Add New User** → username `rox`, password (save it!)
6. Back on cluster page: **Connect → Drivers → Python 3.11** → copy the connection string
   - It looks like: `mongodb+srv://rox:<password>@cluster0.abc.mongodb.net/?retryWrites=true&w=majority`
7. **Replace `<password>`** with the password from step 5

You'll paste this into `backend/.env` at step 7. **No local Mongo needed — skip to step 5.**

---

## 5 · Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw --force enable
```

---

## 6 · Point roxtaxi.com at the VPS

In **Namecheap dashboard → Domain List → Manage → Advanced DNS**:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `@` | your VPS IP | Automatic |
| A Record | `www` | your VPS IP | Automatic |

Verify from the VPS (wait 5-30 min for DNS):

```bash
dig +short roxtaxi.com                # should print your VPS IP
```

---

## 7 · Clone the code (via GitHub CLI — no password prompts)

```bash
sudo apt install -y gh
gh auth login
# Answer:  GitHub.com  →  HTTPS  →  Yes (authenticate git)  →  Login with a web browser
# Copy the 8-digit code, open the URL on your PC, paste code, click Authorize.

gh repo clone <your-github-user>/rox-taxi /home/rox/app
cd /home/rox/app
```

---

## 8 · Write the .env files

### backend/.env

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Fill in exactly these 7 keys:

```env
MONGO_URL="mongodb://localhost:27017"          # Path A (Percona)
# MONGO_URL="mongodb+srv://rox:PASSWORD@cluster0.abc.mongodb.net/?retryWrites=true&w=majority"   # Path B (Atlas)
DB_NAME="rox_taxi_prod"
JWT_SECRET_KEY="<paste output of: openssl rand -hex 32>"
ADMIN_EMAIL="roxfam2509@gmail.com"
ADMIN_PASSWORD="<pick a strong one>"
PUBLIC_SITE_URL="https://roxtaxi.com"
CORS_ORIGINS="https://roxtaxi.com,https://www.roxtaxi.com"
```

Generate the JWT secret first with `openssl rand -hex 32`, paste the 64-char
output into the file. Save with **Ctrl+O, Enter, Ctrl+X**.

### frontend/.env

```bash
cp frontend/.env.example frontend/.env
nano frontend/.env
```

Set exactly:

```env
REACT_APP_BACKEND_URL=https://roxtaxi.com
```

No trailing slash.

---

## 9 · Install app dependencies + build

```bash
# Backend
cd /home/rox/app/backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
deactivate

# Frontend — use the swap you added in step 2
cd /home/rox/app/frontend
yarn install --frozen-lockfile
NODE_OPTIONS="--max-old-space-size=1536" yarn build
```

**✔** `ls /home/rox/app/frontend/build/index.html` exists.

---

## 10 · Backend as a systemd service

```bash
sudo tee /etc/systemd/system/rox-api.service > /dev/null <<'EOF'
[Unit]
Description=Rox Taxi FastAPI backend
After=network.target mongod.service

[Service]
Type=simple
User=rox
Group=rox
WorkingDirectory=/home/rox/app/backend
EnvironmentFile=/home/rox/app/backend/.env
ExecStart=/home/rox/app/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now rox-api
sudo journalctl -u rox-api -n 30      # look for "Application startup complete."
```

**✔** `curl -s http://127.0.0.1:8001/api/ | head -c 200` returns JSON.

---

## 11 · Nginx

```bash
sudo tee /etc/nginx/sites-available/roxtaxi > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name roxtaxi.com www.roxtaxi.com;
    client_max_body_size 25M;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout                 90s;
    }

    root /home/rox/app/frontend/build;
    index index.html;

    location = /index.html  { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    location /static/       { expires 365d; add_header Cache-Control "public, immutable"; }
    location = /sw.js       { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    location /              { try_files $uri $uri/ /index.html; }
}
EOF

sudo ln -sf /etc/nginx/sites-available/roxtaxi /etc/nginx/sites-enabled/roxtaxi
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Open `http://roxtaxi.com` in your browser — the homepage should load.

---

## 12 · Let's Encrypt HTTPS

```bash
sudo certbot --nginx -d roxtaxi.com -d www.roxtaxi.com \
     --email roxfam2509@gmail.com --agree-tos --no-eff-email --redirect
```

Visit **https://roxtaxi.com** — full HTTPS. 🎉

---

## 13 · First admin login + paste Tier-2 tokens

```bash
curl -X POST https://roxtaxi.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"roxfam2509@gmail.com","password":"<ADMIN_PASSWORD>"}'
# → {"token":"eyJ...","email":"roxfam2509@gmail.com"}
```

Then in a browser: `https://roxtaxi.com/admin/login` → sign in → **Admin →
Manage → Tokens tab** → paste each Tier-2 key (Stripe, Twilio, SendGrid,
Emergent LLM, AviationStack, Facebook). No restart needed for any of them.

Test each: book a taxi with card `4242 4242 4242 4242`, open the chat bubble
(Claude), approve a gallery photo (Facebook).

**You're live.** 🎉

---

## Troubleshooting the tricky bits

| Symptom | Fix |
|---|---|
| **"Illegal instruction (core dumped)" on `mongod`** | You installed the official MongoDB (needs AVX). Remove it: `sudo apt remove -y mongodb-org` → use **Path A (Percona)** or **Path B (Atlas)** above |
| **Path A: `E: Unable to locate package percona-server-mongodb`** | Rerun `sudo percona-release setup psmdb-70 && sudo apt update` |
| **`Illegal instruction` on `mongosh`** | mongosh binary also uses AVX. Install the legacy shell instead: `sudo apt install -y percona-server-mongodb-shell` then use `mongo` (not `mongosh`) |
| **Atlas: `Server selection timed out`** | Your VPS IP isn't whitelisted. Atlas → Network Access → Add `0.0.0.0/0` or your VPS IP |
| **Yarn build "Killed" mid-build** | Confirm 2GB swap is on (`free -h` should show 2Gi swap). If not, redo step 2 |
| **certbot fails "DNS problem: no A record"** | Wait longer for DNS. `dig +short roxtaxi.com` must return your VPS IP first |
| **`502 Bad Gateway` at `/api/...`** | `sudo journalctl -u rox-api -n 100` — almost always a bad `.env` value |

---

## Daily ops

| Task | Command |
|---|---|
| Live API logs | `sudo journalctl -u rox-api -f` |
| Pull new code + rebuild | `cd ~/app && git pull && cd frontend && NODE_OPTIONS="--max-old-space-size=1536" yarn build && sudo systemctl restart rox-api` |
| Backup Mongo (Path A) | `mongodump --db rox_taxi_prod --out ~/backups/$(date +%F)` |
| Backup Mongo (Path B) | Atlas dashboard → Backup (automatic on M0) |

— Rox Taxi Service & Tours · Nassau, Bahamas
