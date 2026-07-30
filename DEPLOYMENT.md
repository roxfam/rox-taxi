# Rox Taxi — Namecheap VPS Pulsar Deployment Guide

Complete step-by-step for deploying this repo to your **Namecheap VPS
Pulsar** with the domain **roxtaxi.com**.

Copy each block from top to bottom into an SSH terminal. Total time on a
clean VPS: **~45 minutes**.

---

## 0 · What you're deploying

| Layer            | Tech                          | Where it runs                    |
|------------------|-------------------------------|----------------------------------|
| Frontend         | React (CRA) + Tailwind        | Static bundle served by Nginx    |
| Backend API      | FastAPI + uvicorn             | `systemd` service on port 8001   |
| Database         | MongoDB 7                     | Local socket on the VPS          |
| Reverse proxy    | Nginx                         | Ports 80/443                     |
| TLS              | Let's Encrypt (certbot)       | Auto-renew via cron              |
| Process manager  | systemd + Nginx auto-reload   | Survives reboots                 |

Same architecture as the preview environment — no code changes needed.

---

## 1 · SSH into the VPS

From your Mac/PC terminal (or Namecheap's web SSH):

```bash
ssh root@<YOUR_VPS_IP>
# Password is in the "Server Details" tab of your Namecheap dashboard.
```

Right after first login, harden it:

```bash
apt update && apt upgrade -y
adduser rox              # create a non-root user (pick a password)
usermod -aG sudo rox
# Optional: paste your public key so you can SSH-key in
mkdir -p /home/rox/.ssh && chmod 700 /home/rox/.ssh
# echo 'ssh-rsa AAAA...' > /home/rox/.ssh/authorized_keys
chown -R rox:rox /home/rox/.ssh
```

Log out, then log back in as `rox`:

```bash
exit
ssh rox@<YOUR_VPS_IP>
```

---

## 2 · Install system dependencies

```bash
# Node 20 LTS (frontend build)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Python 3.11
sudo apt install -y python3.11 python3.11-venv python3.11-dev build-essential

# Nginx + certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# yarn (frontend package manager — required, don't swap for npm)
sudo npm install -g yarn

# git + supporting tools
sudo apt install -y git ufw fail2ban htop

# MongoDB 7 (official repo)
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -sc)/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org

sudo systemctl enable --now mongod
sudo systemctl status mongod   # should show "active (running)"
```

---

## 3 · Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"        # 80 + 443
sudo ufw --force enable
sudo ufw status
```

Do **NOT** open 8001 or 27017 to the internet — they only serve
`localhost`.

---

## 4 · Point roxtaxi.com at the VPS

In your Namecheap dashboard → **Domain List** → **Manage** → **Advanced
DNS**:

| Type      | Host  | Value                | TTL       |
|-----------|-------|----------------------|-----------|
| A Record  | `@`   | `<YOUR_VPS_IP>`      | Automatic |
| A Record  | `www` | `<YOUR_VPS_IP>`      | Automatic |
| CNAME     | `api` | `roxtaxi.com`        | Automatic |

DNS propagation: 5-30 minutes. Test:

```bash
dig +short roxtaxi.com   # should return YOUR_VPS_IP
```

---

## 5 · Pull the code

```bash
cd /home/rox
git clone https://github.com/<your-github-user>/rox-taxi.git app
cd app
```

If your repo lives inside Emergent, use **Save to GitHub** in the chat
input to push, then clone from there.

---

## 6 · Configure environment

### 6a · Backend `.env`

Copy the template and fill in real values:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Minimum required keys (see `.env.example` for the full list):

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="rox_taxi_prod"
JWT_SECRET_KEY="<run: openssl rand -hex 32>"
ADMIN_EMAIL="roxfam2509@gmail.com"
ADMIN_PASSWORD="<pick a strong one>"

# Domain — must match every host that will load the frontend
PUBLIC_SITE_URL="https://roxtaxi.com"
CORS_ORIGINS="https://roxtaxi.com,https://www.roxtaxi.com"

# Payments (get from stripe.com / paypal.com dashboards)
STRIPE_API_KEY="sk_live_..."
PAYPAL_CLIENT_ID="..."
PAYPAL_SECRET="..."

# Comms (Twilio + SendGrid or SMTP)
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_FROM_NUMBER="+12424322587"
SENDGRID_API_KEY="SG..."
SENDGRID_FROM_EMAIL="hello@roxtaxi.com"

# LLM + Flight tracking (optional)
EMERGENT_LLM_KEY="sk-emergent-..."
AVIATIONSTACK_API_KEY="..."
```

**Pro-tip:** After the first successful boot, most of these can be
managed live via **Admin → Tokens** (no restart needed).

### 6b · Frontend `.env`

```bash
cp frontend/.env.example frontend/.env
nano frontend/.env
```

Set:

```env
REACT_APP_BACKEND_URL=https://roxtaxi.com
```

**Note:** No trailing slash. This is the public URL guests will hit —
Nginx will forward `/api/*` to the FastAPI backend.

---

## 7 · Install app dependencies

```bash
# Backend
cd /home/rox/app/backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
deactivate

# Frontend build
cd /home/rox/app/frontend
yarn install --frozen-lockfile
yarn build            # outputs to /home/rox/app/frontend/build
```

---

## 8 · Create systemd service for the backend

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
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now rox-api
sudo systemctl status rox-api   # should be "active (running)"

# Tail logs to confirm startup:
sudo journalctl -u rox-api -f --lines 50
# Look for: "Application startup complete."  Press Ctrl-C to exit.
```

---

## 9 · Configure Nginx

```bash
sudo tee /etc/nginx/sites-available/roxtaxi > /dev/null <<'EOF'
# Rox Taxi — production reverse proxy
server {
    listen 80;
    listen [::]:80;
    server_name roxtaxi.com www.roxtaxi.com;

    # Let's Encrypt challenge (HTTP-01) — leave open for renew
    location /.well-known/acme-challenge/ { root /var/www/html; }

    # Everything else redirects to HTTPS after TLS is installed
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name roxtaxi.com www.roxtaxi.com;

    # Certbot will fill these in
    ssl_certificate     /etc/letsencrypt/live/roxtaxi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/roxtaxi.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25M;   # gallery photo uploads

    # Backend API — proxied to uvicorn
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

    # Uploaded files (guest photos)
    location /api/uploads/ {
        proxy_pass http://127.0.0.1:8001;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Frontend static build
    root /home/rox/app/frontend/build;
    index index.html;

    # HTML: no cache
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    # Hashed static assets: long cache
    location /static/ {
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
    # SW must never be cached
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    # SPA fallback — every unknown route serves index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/roxtaxi /etc/nginx/sites-enabled/roxtaxi
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                  # test config
```

---

## 10 · Issue TLS certificate (Let's Encrypt)

Comment out the two `ssl_*` lines temporarily and the `443` block, then:

```bash
sudo systemctl reload nginx
sudo certbot --nginx -d roxtaxi.com -d www.roxtaxi.com \
     --email roxfam2509@gmail.com --agree-tos --no-eff-email --redirect
```

Certbot will edit the config to include the real cert paths. Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl status certbot.timer   # auto-renew every 12h
```

Visit **https://roxtaxi.com** — you should see the homepage over HTTPS.

---

## 11 · Verify

```bash
# Backend live?
curl https://roxtaxi.com/api/site-config | head -c 300 && echo
# 200 OK with JSON = success.

# Admin login?
curl -X POST https://roxtaxi.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"roxfam2509@gmail.com","password":"<your ADMIN_PASSWORD>"}'
# Should return {"token":"eyJ..."}.
```

Then sign in at `https://roxtaxi.com/admin/login`.

---

## 12 · Ongoing operations

| Task                     | Command                                              |
|--------------------------|------------------------------------------------------|
| View live API logs       | `sudo journalctl -u rox-api -f`                      |
| Restart backend          | `sudo systemctl restart rox-api`                     |
| Reload Nginx             | `sudo nginx -t && sudo systemctl reload nginx`       |
| Rebuild frontend         | `cd ~/app/frontend && yarn build`                    |
| Pull new code            | `cd ~/app && git pull && cd backend && venv/bin/pip install -r requirements.txt` |
| Backup Mongo             | `mongodump --db rox_taxi_prod --out ~/backups/$(date +%F)` |
| Restore Mongo            | `mongorestore --db rox_taxi_prod ~/backups/<DATE>/rox_taxi_prod` |
| Rotate a live API token  | Admin → Tokens tab → paste new value → Save (no restart) |

---

## 13 · Optional but recommended

### Automated Mongo backups (daily, 30-day retention)

```bash
sudo tee /etc/cron.daily/rox-mongo-backup > /dev/null <<'EOF'
#!/bin/bash
set -e
DIR="/home/rox/backups/$(date +%F)"
mkdir -p "$DIR"
/usr/bin/mongodump --db rox_taxi_prod --out "$DIR" --quiet
find /home/rox/backups -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
chown -R rox:rox /home/rox/backups
EOF
sudo chmod +x /etc/cron.daily/rox-mongo-backup
```

### Fail2ban SSH protection (already installed)

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

### Swap file (Pulsar VPS has 2GB RAM — swap helps builds)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 14 · Troubleshooting

| Symptom                                | Fix                                                                                        |
|----------------------------------------|--------------------------------------------------------------------------------------------|
| **502 Bad Gateway** at `/api/...`      | `sudo systemctl restart rox-api` + `sudo journalctl -u rox-api -n 100`                     |
| **Frontend "Loading" forever**         | Check `REACT_APP_BACKEND_URL` in `frontend/.env`, rebuild `yarn build`, reload Nginx       |
| **HTTPS not renewing**                 | `sudo certbot renew --dry-run`                                                             |
| **Payments not confirming**            | Check Stripe webhook URL is `https://roxtaxi.com/api/webhook/stripe` in Stripe dashboard   |
| **Emails not sending**                 | Rotate `SENDGRID_API_KEY` in Admin → Tokens tab                                            |
| **MongoDB won't start**                | `sudo journalctl -u mongod -n 100` (usually a disk-full or permission issue)               |
| **Admin login says "invalid password"**| `ADMIN_PASSWORD` in `.env` doesn't match. Restart the backend after editing `.env`.        |

Need help? All admin operations (photos, tokens, prices, promos, gallery
approvals, driver manifest, etc.) are self-serve under `/admin`.

— Rox Taxi Service & Tours · Nassau, Bahamas
