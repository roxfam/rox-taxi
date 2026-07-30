# Rox Taxi — Namecheap VPS Deployment Guide

Complete, top-to-bottom guide for standing up **roxtaxi.com** on a brand-new
Namecheap VPS Pulsar. Copy each block into an SSH terminal in order.
Total time on a clean server: **~45 minutes**.

---

## 🔑 Read this first — Two Types of Secrets

Rox Taxi has **two tiers** of credentials. Understanding this distinction saves
you a huge amount of time later.

### Tier 1 — Bootstrap keys (`.env` file, required BEFORE first boot)

These are needed just to start the backend the first time. They rarely change.

| Key | Why it's here | Where it comes from |
|---|---|---|
| `MONGO_URL` | Database connection | Local Mongo — always `mongodb://localhost:27017` on VPS |
| `DB_NAME` | Database name | Pick one, e.g. `rox_taxi_prod` |
| `JWT_SECRET_KEY` | Signs user login tokens | Generate: `openssl rand -hex 32` |
| `ADMIN_EMAIL` | Owner account email | Your email (e.g. `roxfam2509@gmail.com`) |
| `ADMIN_PASSWORD` | Owner account password | Pick a strong one |
| `PUBLIC_SITE_URL` | Absolute URL in emails/SMS | `https://roxtaxi.com` |
| `CORS_ORIGINS` | Which sites can call the API | `https://roxtaxi.com,https://www.roxtaxi.com` |

### Tier 2 — Live-managed keys (Admin → Tokens, paste AFTER first boot)

Once you're logged in as admin, paste these into `/admin/manage → Tokens tab`.
They're stored in Mongo and **do not require a restart** — perfect for rotating
without downtime.

| Group | Keys |
|---|---|
| Stripe | `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE` |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ADMIN_SMS_NUMBER` |
| SendGrid Email | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `EMAIL_FROM_CONFIRMATION`, `EMAIL_FROM_QUOTES`, `EMAIL_FROM_INFO` |
| SMTP (fallback) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS` |
| AviationStack | `AVIATIONSTACK_API_KEY` |
| Emergent LLM | `EMERGENT_LLM_KEY` (powers Claude live chat + license OCR) |
| Facebook | `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `FB_GRAPH_VERSION`, `FB_AUTOPOST_ENABLED`, `FB_SITE_URL` |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (only if you replace Emergent-managed Google Auth) |

📖 Full reference with links, formats and where to obtain each key: see the
[**Where to get each key**](#appendix--where-to-get-each-key) appendix at the bottom.

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

**✔ Checkpoint:** `whoami` should print `rox`.

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

**✔ Checkpoint:** `node -v` prints v20.x · `python3.11 --version` prints 3.11.x · `mongosh --eval "db.stats()"` connects without error.

---

## 3 · Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"        # 80 + 443
sudo ufw --force enable
sudo ufw status
```

Do **NOT** open 8001 or 27017 to the internet — they only serve `localhost`.

---

## 4 · Point roxtaxi.com at the VPS

In your Namecheap dashboard → **Domain List** → **Manage** → **Advanced DNS**:

| Type      | Host  | Value                | TTL       |
|-----------|-------|----------------------|-----------|
| A Record  | `@`   | `<YOUR_VPS_IP>`      | Automatic |
| A Record  | `www` | `<YOUR_VPS_IP>`      | Automatic |

DNS propagation: 5-30 minutes. Test:

```bash
dig +short roxtaxi.com   # should return YOUR_VPS_IP
```

**✔ Checkpoint:** `dig +short roxtaxi.com` returns your VPS IP.

---

## 5 · Pull the code

```bash
cd /home/rox
git clone https://github.com/<your-github-user>/rox-taxi.git app
cd app
```

If your repo lives inside Emergent, use **Save to GitHub** in the chat input
to push, then clone from there.

---

## 6 · Configure Tier 1 (bootstrap) environment variables

### 6a · Backend `.env`

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Fill in the **required Tier-1** keys (leave Tier-2 keys blank for now — you'll
paste them via Admin → Tokens after first boot):

```env
# ── Required Tier-1 bootstrap keys ─────────────────────────────
MONGO_URL="mongodb://localhost:27017"
DB_NAME="rox_taxi_prod"
JWT_SECRET_KEY="<run: openssl rand -hex 32>"

ADMIN_EMAIL="roxfam2509@gmail.com"
ADMIN_PASSWORD="<pick a strong one>"

PUBLIC_SITE_URL="https://roxtaxi.com"
CORS_ORIGINS="https://roxtaxi.com,https://www.roxtaxi.com"

# ── Optional Tier-2 keys — SKIP; paste via Admin → Tokens later ─
# STRIPE_API_KEY="", TWILIO_*="", SENDGRID_*="", EMERGENT_LLM_KEY="", etc.
```

**💡 Why leave Tier-2 blank?** Because rotating them in `.env` needs a systemd
restart (downtime). Rotating them in Admin → Tokens is instant. See the
[Two Types of Secrets](#-read-this-first--two-types-of-secrets) section.

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

**✔ Checkpoint:** `ls /home/rox/app/frontend/build/index.html` exists.

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

**✔ Checkpoint:** `curl -s http://127.0.0.1:8001/api/ | head -c 200` returns JSON.

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

**✔ Checkpoint:** `curl -sI https://roxtaxi.com | head -1` shows `HTTP/2 200`.

---

## 11 · First-boot verification

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

## 12 · Configure Tier 2 (live-managed) tokens

Now that you're logged in, paste your Tier-2 keys in the Admin panel — no
restart needed for any of these.

1. Go to `https://roxtaxi.com/admin/manage` → **Tokens** tab
2. For each key group (Stripe, PayPal, Twilio, SendGrid, Emergent LLM,
   AviationStack, Facebook, Web Push):
   - Click into the field
   - Paste the value from the [Where to get each key](#appendix--where-to-get-each-key)
     appendix below
   - Click **Save** — it takes effect immediately
3. Test each integration by triggering a real event:
   - **Stripe** — click **Book** on a taxi service, complete checkout with card
     `4242 4242 4242 4242`
   - **Twilio** — new bookings should ping the `ADMIN_SMS_NUMBER`
   - **SendGrid** — the guest should receive a "Booking received" email
     immediately after booking
   - **Emergent LLM** — open the site, click the chat bubble bottom-right,
     type "Hello" — Claude should respond
   - **AviationStack** — open the taxi booking modal, type a real flight
     number (e.g. `AA1234`), delay lookup should populate
   - **Facebook** — open **Admin → Gallery**, approve a pending photo — it
     should auto-post to your page
   - **Web Push** — click "Enable notifications" in the admin dashboard —
     the browser should ask permission

**✔ Checkpoint:** Every integration test above returns a successful result.

---

## 13 · Ongoing operations

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

## 14 · Optional but recommended

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

## 15 · Troubleshooting

| Symptom                                | Fix                                                                                        |
|----------------------------------------|--------------------------------------------------------------------------------------------|
| **502 Bad Gateway** at `/api/...`      | `sudo systemctl restart rox-api` + `sudo journalctl -u rox-api -n 100`                     |
| **Frontend "Loading" forever**         | Check `REACT_APP_BACKEND_URL` in `frontend/.env`, rebuild `yarn build`, reload Nginx       |
| **HTTPS not renewing**                 | `sudo certbot renew --dry-run`                                                             |
| **Payments not confirming**            | Check Stripe webhook URL is `https://roxtaxi.com/api/webhook/stripe` in Stripe dashboard   |
| **Emails not sending**                 | Rotate `SENDGRID_API_KEY` in Admin → Tokens tab                                            |
| **MongoDB won't start**                | `sudo journalctl -u mongod -n 100` (usually a disk-full or permission issue)               |
| **Admin login says "invalid password"**| `ADMIN_PASSWORD` in `.env` doesn't match. Restart the backend after editing `.env`.        |
| **CORS errors in browser console**     | `CORS_ORIGINS` in `.env` must exactly match the origin (protocol + host, no trailing slash) |

---

## Appendix — Where to get each key

### Tier 1 — Bootstrap (in `.env`)

| Key | How to obtain |
|---|---|
| **`MONGO_URL`** | Always `mongodb://localhost:27017` when Mongo runs on the VPS itself. |
| **`DB_NAME`** | Any name. Convention: `rox_taxi_prod`. |
| **`JWT_SECRET_KEY`** | Generate: `openssl rand -hex 32`. Keep secret — leaked value = every login token forgeable. |
| **`ADMIN_EMAIL`** | Whichever email should own the site. Used for the seeded admin account. |
| **`ADMIN_PASSWORD`** | Pick a strong password. Change after first login via Admin → Password. |
| **`PUBLIC_SITE_URL`** | Your live URL: `https://roxtaxi.com`. Appears in email + SMS links. |
| **`CORS_ORIGINS`** | Comma-separated list of frontend origins allowed to call the API. Example: `https://roxtaxi.com,https://www.roxtaxi.com`. |

### Tier 2 — Live-managed (in Admin → Tokens)

#### Stripe (payments)

1. Sign in → https://dashboard.stripe.com
2. **Developers → API keys** → copy **Secret key** → paste into `STRIPE_API_KEY`
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://roxtaxi.com/api/webhook/stripe`
   - Events: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`
4. Click the created webhook → **Signing secret** (starts with `whsec_`) → paste into `STRIPE_WEBHOOK_SECRET`

#### PayPal (payments)

1. https://developer.paypal.com/dashboard/applications/live → **Create App** (Live)
2. Copy **Client ID** → `PAYPAL_CLIENT_ID`
3. Show + copy **Secret** → `PAYPAL_SECRET`
4. Set `PAYPAL_MODE` = `live` (or `sandbox` for testing)

#### Twilio (SMS)

1. Sign in → https://console.twilio.com
2. **Account → API keys & tokens** → copy **Account SID** (starts `AC…`) → `TWILIO_ACCOUNT_SID`
3. Copy **Auth Token** → `TWILIO_AUTH_TOKEN`
4. **Phone Numbers → Manage → Active numbers** → copy the E.164 number (e.g. `+12424322587`) → `TWILIO_FROM_NUMBER`
5. `ADMIN_SMS_NUMBER` = your owner phone (E.164) that receives booking alerts

#### SendGrid (email — preferred)

1. Sign in → https://app.sendgrid.com
2. **Settings → API Keys → Create API Key** (Full Access) → copy → `SENDGRID_API_KEY`
3. **Settings → Sender Authentication → Domain Authentication** — verify `roxtaxi.com`
4. Once verified, `SENDGRID_FROM_EMAIL` = any address at that domain (e.g. `hello@roxtaxi.com`)
5. Optional per-category senders (all @roxtaxi.com after domain is verified):
   - `EMAIL_FROM_CONFIRMATION` = `confirmation@roxtaxi.com` (booking receipts)
   - `EMAIL_FROM_QUOTES` = `quotes@roxtaxi.com` (custom-quote replies)
   - `EMAIL_FROM_INFO` = `info@roxtaxi.com` (contact form)

#### SMTP (email — fallback if you don't use SendGrid)

Use your Namecheap Private Email or any SMTP provider:
- `SMTP_HOST` = e.g. `mail.privateemail.com`
- `SMTP_PORT` = `587` (STARTTLS) or `465` (SSL)
- `SMTP_USER` = your mailbox address
- `SMTP_PASSWORD` = your mailbox password
- `SMTP_USE_TLS` = `true` (auto-ignored on port 465)

#### AviationStack (flight tracking)

1. Sign up free → https://aviationstack.com/signup/free (100 req/mo)
2. Dashboard → copy **API Access Key** → `AVIATIONSTACK_API_KEY`

#### Emergent LLM (Claude live chat + license OCR)

1. Sign in to your Emergent account → **Profile → Universal Key**
2. Copy the key (starts `sk-emergent-…`) → `EMERGENT_LLM_KEY`
3. Powers: Claude Sonnet 4.6 live chat concierge + Claude Sonnet 4.5 Vision
   for driver-license OCR and selfie face-match.
4. Top up balance any time via **Profile → Manage plan → Universal Key**.

#### Facebook (auto-post approved gallery photos)

1. Create a Facebook Page for the business (if you don't already have one)
2. Go to https://developers.facebook.com/apps → **Create App** (Business type)
3. Add the **Facebook Login** product to the app
4. Go to **Graph API Explorer** → https://developers.facebook.com/tools/explorer
5. Select your app + Page → grant permissions: `pages_manage_posts` + `pages_read_engagement`
6. Exchange the short-lived token for a long-lived Page token:
   - `curl "https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_LIVED>"`
7. Paste the long-lived token → `FB_PAGE_ACCESS_TOKEN`
8. Copy your numeric Page ID from **About → Page transparency** → `FB_PAGE_ID`
9. Leave `FB_GRAPH_VERSION` = `v20.0`, `FB_AUTOPOST_ENABLED` = `true`, `FB_SITE_URL` = `https://roxtaxi.com`

#### Web Push (VAPID — admin browser notifications)

Generate a keypair on the VPS:

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

Paste the derived base64url values → `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`
Set `VAPID_SUBJECT` = `mailto:roxfam2509@gmail.com`.

#### Google OAuth (only if you self-host Google sign-in)

By default Rox Taxi uses Emergent-managed Google Auth — no keys needed.
Only fill these if you switch to your own Google Cloud project:
1. https://console.cloud.google.com → **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Authorized redirect URI: `https://roxtaxi.com/auth/google/callback`
4. Copy Client ID + Secret → `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`

---

## 🎉 You're live

All admin operations (photos, tokens, prices, promos, gallery approvals,
driver manifest, license approvals, etc.) are self-serve under `/admin`.

Need help? — Rox Taxi Service & Tours · Nassau, Bahamas
