# Rox Taxi — Namecheap VPS 2GB Quick-Start (Blank Ubuntu)

Complete install for a **Namecheap Pulsar VPS** (2GB RAM · Ubuntu 22.04 blank).
Total time: **~45 min**. Every block is copy-paste-safe. Where it says
`<...>` you must edit the value.

> **Full reference:** everything below plus troubleshooting, backups, and the
> two-tier secrets model is in `DEPLOYMENT.md`. This file is the fast path.

---

## Before you start — buy / know these

| Item | Where |
|---|---|
| Domain `roxtaxi.com` | Namecheap → Domain List |
| VPS root password + IP | Namecheap → Dashboard → your Pulsar server |
| Nothing else | Every 3rd-party key (Stripe, Twilio, SendGrid, Emergent LLM, Facebook, AviationStack) is pasted in **Admin → Tokens** AFTER the server is running — you don't need any of them today |

---

## 1 · SSH in and harden

```bash
# From your Mac/PC — paste your VPS's IP
ssh root@<VPS_IP>

# You are now root. Update + create a normal user
apt update && apt upgrade -y
adduser rox                           # pick a strong password
usermod -aG sudo rox
# copy your SSH key over (or skip if password login is fine)
rsync --archive --chown=rox:rox ~/.ssh /home/rox

# Log out of root, log in as rox
exit
ssh rox@<VPS_IP>
```

**✔ Checkpoint:** `whoami` prints `rox`.

---

## 2 · Add 2GB swap (CRITICAL on 2GB Pulsar — yarn build OOMs without it)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# reduce swappiness so Mongo doesn't get paged out under normal load
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
free -h                               # should show Swap: 2.0Gi
```

**✔ Checkpoint:** `free -h` shows a 2Gi swap row.

---

## 3 · System dependencies (one big block)

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Python 3.11 + build tooling
sudo apt install -y python3.11 python3.11-venv python3.11-dev build-essential git ufw fail2ban nginx certbot python3-certbot-nginx

# yarn (never swap for npm)
sudo npm install -g yarn

# MongoDB 7
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -sc)/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

**✔ Checkpoint:** `node -v` → v20.x · `python3.11 --version` → 3.11.x · `mongosh --eval "db.stats()"` connects.

### 2GB tuning — cap MongoDB's WiredTiger cache at 512MB

Default = half of RAM. On a 2GB box that leaves too little for Node/Nginx/Python.

```bash
sudo sed -i '/^storage:/a\  wiredTiger:\n    engineConfig:\n      cacheSizeGB: 0.5' /etc/mongod.conf
sudo systemctl restart mongod
sudo systemctl status mongod          # should be "active (running)"
```

---

## 4 · Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw --force enable
```

Ports 8001 (backend) and 27017 (Mongo) stay closed to the internet — only localhost hits them.

---

## 5 · Point roxtaxi.com at the VPS

In **Namecheap → Domain List → Manage → Advanced DNS**:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `@` | `<VPS_IP>` | Automatic |
| A Record | `www` | `<VPS_IP>` | Automatic |

Wait 5–30 min then verify from the VPS:

```bash
dig +short roxtaxi.com                # should print your VPS IP
```

**✔ Checkpoint:** `dig +short roxtaxi.com` prints your VPS IP.

---

## 6 · Pull the code

```bash
cd /home/rox
git clone https://github.com/<your-github-user>/rox-taxi.git app
cd app
```

If your source lives in Emergent, use the **Save to GitHub** button in the
chat input to push, then clone from the new repo.

---

## 7 · Tier-1 (bootstrap) env vars — the only 7 you need before boot

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Fill in ONLY these 7 lines (leave everything else blank — the Tier-2 keys
are pasted in Admin → Tokens after the server is running):

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="rox_taxi_prod"
JWT_SECRET="paste-output-of-openssl-rand-hex-32-here"

ADMIN_EMAIL="roxfam2509@gmail.com"
ADMIN_PASSWORD_HASH="paste-bcrypt-hash-here"

PUBLIC_SITE_URL="https://roxtaxi.com"
CORS_ORIGINS="https://roxtaxi.com,https://www.roxtaxi.com"
```

Generate `JWT_SECRET` with:

```bash
openssl rand -hex 32                  # copy the 64-char hex string
```

Then the frontend `.env`:

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

## 8 · Install app dependencies

### Backend

```bash
cd /home/rox/app/backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
deactivate
```

### Frontend (needs swap — that's why step 2 is critical)

```bash
cd /home/rox/app/frontend
yarn install --frozen-lockfile
NODE_OPTIONS="--max-old-space-size=1536" yarn build
```

The `NODE_OPTIONS` flag caps Node's heap at 1.5GB so it doesn't try to
grab the whole 2GB. Build finishes in ~2 min.

**✔ Checkpoint:** `ls /home/rox/app/frontend/build/index.html` exists.

---

## 9 · Backend as a systemd service

```bash
sudo tee /etc/systemd/system/rox-api.service > /dev/null <<'EOF'
[Unit]
Description=Rox Taxi FastAPI backend
After=network.target mongod.service
Requires=mongod.service

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
sudo systemctl status rox-api         # should be "active (running)"
```

Check startup logs — look for `Application startup complete`:

```bash
sudo journalctl -u rox-api -n 50
```

**✔ Checkpoint:** `curl -s http://127.0.0.1:8001/api/ | head -c 200` returns JSON.

---

## 10 · Nginx (HTTP first — TLS added by certbot next)

```bash
sudo tee /etc/nginx/sites-available/roxtaxi > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name roxtaxi.com www.roxtaxi.com;

    client_max_body_size 25M;         # for gallery photo uploads

    location /.well-known/acme-challenge/ { root /var/www/html; }

    # Backend API + uploads
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

    # Frontend static build
    root /home/rox/app/frontend/build;
    index index.html;

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location /static/ {
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/roxtaxi /etc/nginx/sites-enabled/roxtaxi
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                         # config test → "syntax is ok"
sudo systemctl reload nginx
```

Open `http://roxtaxi.com` in a browser — the homepage should load over
plain HTTP. Only proceed once you see the site.

**✔ Checkpoint:** `curl -sI http://roxtaxi.com | head -1` → `HTTP/1.1 200 OK`.

---

## 11 · TLS via Let's Encrypt (one command)

```bash
sudo certbot --nginx -d roxtaxi.com -d www.roxtaxi.com \
     --email roxfam2509@gmail.com --agree-tos --no-eff-email --redirect
```

certbot rewrites the Nginx config with the real cert paths and installs
an auto-renew timer.

```bash
sudo systemctl status certbot.timer   # confirms auto-renew every 12h
```

Visit **https://roxtaxi.com** — full HTTPS. 🎉

**✔ Checkpoint:** `curl -sI https://roxtaxi.com | head -1` → `HTTP/2 200`.

---

## 12 · First admin login + paste Tier-2 tokens

```bash
# Prove the API answers over HTTPS:
curl -X POST https://roxtaxi.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"roxfam2509@gmail.com","password":"<ADMIN_PASSWORD>"}'
# → {"token":"eyJ...","email":"roxfam2509@gmail.com"}
```

Then open `https://roxtaxi.com/admin/login` in your browser, log in, and go to
`/admin/manage → Tokens tab`. Paste each of these as you obtain them
(none require a restart — each takes effect within seconds of pressing Save):

| Key | Where to get it | Notes |
|---|---|---|
| `STRIPE_API_KEY` | dashboard.stripe.com → Developers → API keys | Secret key (starts `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → Add endpoint `https://roxtaxi.com/api/webhook/stripe` events: `checkout.session.completed` + `payment_intent.payment_failed` | Signing secret (`whsec_...`) |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` | console.twilio.com → Account | E.164 number for FROM |
| `ADMIN_SMS_NUMBER` | Your owner phone | E.164 |
| `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` | app.sendgrid.com → Settings → API Keys **AND** verify `roxtaxi.com` under Sender Authentication → Domain Authentication | Emails send FROM `@roxtaxi.com` once domain is verified |
| `EMERGENT_LLM_KEY` | Emergent → Profile → Universal Key | Powers Claude live chat + license OCR |
| `AVIATIONSTACK_API_KEY` | aviationstack.com (free 100/mo) | Flight tracking |
| `FB_PAGE_ID` + `FB_PAGE_ACCESS_TOKEN` | developers.facebook.com → Graph API Explorer (see DEPLOYMENT.md for the long-lived-token exchange) | Gallery auto-post |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Generate on the VPS (see below) | Admin browser push |

Generate VAPID keys on the VPS:

```bash
cd /home/rox/app/backend
source venv/bin/activate
python3 -c "
from py_vapid import Vapid01
v = Vapid01()
v.generate_keys()
print('PUBLIC :', v.public_pem().decode())
print('PRIVATE:', v.private_pem().decode())
"
```

Test each integration by triggering it: book a taxi with card `4242 4242 4242 4242`,
open the chat bubble (Claude), approve a gallery photo (Facebook), submit a
flight number (AviationStack).

**✔ You're live.** 🎉

---

## Daily ops cheat sheet

| Task | Command |
|---|---|
| Live API logs | `sudo journalctl -u rox-api -f` |
| Restart backend (rarely needed) | `sudo systemctl restart rox-api` |
| Reload Nginx after config change | `sudo nginx -t && sudo systemctl reload nginx` |
| Pull new code + rebuild | `cd ~/app && git pull && cd frontend && NODE_OPTIONS="--max-old-space-size=1536" yarn build && sudo systemctl restart rox-api` |
| Backup Mongo | `mongodump --db rox_taxi_prod --out ~/backups/$(date +%F)` |
| Rotate a live API token | Admin → Tokens tab → paste → Save (no restart) |

---

## If something breaks

| Symptom | First move |
|---|---|
| **502 Bad Gateway** at `/api/...` | `sudo journalctl -u rox-api -n 100` → almost always a bad `.env` value or Mongo not running |
| **Yarn build killed / OOM** | Confirm swap is on (`free -h`) and use the `NODE_OPTIONS` flag above |
| **HTTPS not renewing** | `sudo certbot renew --dry-run` |
| **Emails not sending** | Rotate `SENDGRID_API_KEY` in Admin → Tokens (the SMTP fallback still delivers via Namecheap Private Email as a safety net) |
| **CORS errors** | `CORS_ORIGINS` in `.env` must exactly match the browser origin (protocol + host, no trailing slash) → then `sudo systemctl restart rox-api` |
| **Mongo won't start** | `sudo journalctl -u mongod -n 100` — usually disk-full or the WiredTiger cache tuning above needs a slight bump |

---

**Full reference for everything else** (backups, fail2ban, cron, module
architecture, secret rotation, troubleshooting): `DEPLOYMENT.md`.

— Rox Taxi Service & Tours · Nassau, Bahamas
