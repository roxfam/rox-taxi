# Best Namecheap Deployment Paths — Full Features Preserved

Your current stack is **React + FastAPI + MongoDB** with 30+ live features
(customer auth, live GPS tracking, Claude AI chat streaming, PayPal + Stripe
+ Twilio + SendGrid + Emergent LLM). To keep ALL of it, you need Python +
MongoDB somewhere. Here are the four realistic paths — ranked.

---

## 🥇 **PATH 1 — Namecheap VPS (Pulsar / Magnetar)** — RECOMMENDED
### Single vendor, single bill, single control panel. Everything works.

**Price:** $9-15/mo (Pulsar 2GB) — comparable to what Stellar Business costs.
**Setup time:** ~1.5 hours first-time, then git-push deploys forever.
**Preserves:** 100% of features (live streaming AI chat, GPS SSE, cron jobs, everything).

### Steps

1. **Buy VPS**: namecheap.com → *VPS Hosting* → **Pulsar 2GB** or **Magnetar** (more RAM = smoother MongoDB). Choose **Ubuntu 22.04 LTS** + **cPanel or plain SSH** (SSH is cheaper).
2. **DNS**: point `roxtaxi.com` A-record to the VPS IP (in Namecheap Advanced DNS).
3. **SSH in** and one-shot install everything:
   ```bash
   # System deps
   sudo apt update && sudo apt install -y python3.11 python3.11-venv python3-pip \
     nginx certbot python3-certbot-nginx git nodejs npm mongodb-org supervisor
   sudo npm install -g yarn pm2

   # Clone your code (after Emergent "Save to GitHub")
   cd /opt && git clone https://github.com/<your-user>/rox-taxi.git rox && cd rox

   # Backend
   cd backend && python3.11 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env  # then edit with real keys
   deactivate

   # Frontend
   cd ../frontend && yarn install && yarn build
   ```
4. **MongoDB**: `sudo systemctl enable --now mongod` — running locally, no external cost.
5. **Nginx** in front (paste this into `/etc/nginx/sites-available/roxtaxi`):
   ```nginx
   server {
     server_name roxtaxi.com www.roxtaxi.com;
     root /opt/rox/frontend/build;
     index index.html;

     location /api/ {
       proxy_pass http://127.0.0.1:8001;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_read_timeout 300s;      # SSE for AI chat + GPS
       proxy_buffering off;          # streaming
     }
     location / { try_files $uri /index.html; }
   }
   ```
   Then: `sudo ln -s ../sites-available/roxtaxi /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`
6. **HTTPS free**: `sudo certbot --nginx -d roxtaxi.com -d www.roxtaxi.com`
7. **Supervisor** for the FastAPI process (paste into `/etc/supervisor/conf.d/backend.conf`):
   ```
   [program:rox-backend]
   command=/opt/rox/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
   directory=/opt/rox/backend
   autostart=true
   autorestart=true
   user=root
   ```
   Then: `sudo supervisorctl reread && sudo supervisorctl update`
8. **Restore data**: upload `/app/deploy/mongo_export/` to VPS, then `mongorestore --db test_database mongo_export/test_database/`
9. **Test**: `https://roxtaxi.com/` loads · `/api/tours` returns JSON · admin login works.

**Pros**
- ✅ Same Namecheap account, one bill
- ✅ Full features (AI streaming, live GPS, PDF receipts, cron)
- ✅ You OWN the machine — no vendor lock-in
- ✅ Root shell = install anything you want later
- ✅ Push code via git → deploy in 30 sec after initial setup

**Cons**
- ⚠️ You're the sysadmin (security patches, uptime). Namecheap does most of it via managed VPS if you upgrade to that plan.

---

## 🥈 **PATH 2 — Hybrid: Stellar + Railway + Atlas** — CHEAPEST
### Frontend stays on your Stellar; backend & DB live in the cloud.

**Price:** Stellar (you have it) + Railway $5/mo + Atlas free = **~$5/mo extra**
**Setup time:** 45 min.
**Preserves:** 100% of features.
**Detailed in:** `/app/deploy/DEPLOYMENT_GUIDE.md` (Option A)

**Pros**
- ✅ Cheapest full-feature path
- ✅ Free managed MongoDB (Atlas), free Railway trial
- ✅ Zero sysadmin work

**Cons**
- ⚠️ Three vendors instead of one
- ⚠️ Railway free tier expires; then $5/mo per project

---

## 🥉 **PATH 3 — Namecheap-VPS + Managed MongoDB Atlas**
### Best of both worlds: Namecheap for compute, Atlas for the DB.

**Price:** Pulsar VPS $9-15/mo + Atlas free (or M10 $57/mo for prod-grade).
**Setup time:** ~1.5 hours.
**Preserves:** 100% of features.

Follow Path 1 steps 1-7, but skip step 4 (no local MongoDB). Set
`MONGO_URL` in backend `.env` to your Atlas connection string. Restore data
to Atlas with `mongorestore --uri "<atlas-uri>" mongo_export/test_database/`.

**Pros**
- ✅ Managed database backups + monitoring
- ✅ Better than local Mongo if you ever want multi-server
- ✅ Free tier is 512MB — enough for years of Rox data

**Cons**
- ⚠️ Very slight latency vs. local Mongo (< 20ms in same region)

---

## 4️⃣ **PATH 4 — Pure Stellar (PHP/MySQL rewrite)** — NOT RECOMMENDED NOW
### Every feature would need to be rewritten in PHP.

Scaffolding exists in `/app/deploy/backend_php_starter/` but ~60% of route
handlers still need porting, and live streaming (AI chat + GPS) becomes
15-sec polling. See `backend_php_starter/README-DEPLOYMENT.md`. Est. ~2 full
dev sessions.

Only pick this if you refuse to touch a second Namecheap product.

---

## Feature-parity matrix

| Feature | Stellar-only (Path 4) | Hybrid (Path 2) | VPS (Path 1 & 3) |
|---|---|---|---|
| React SPA | ✅ | ✅ | ✅ |
| Booking + payments + admin | ✅ (after PHP rewrite) | ✅ | ✅ |
| PayPal / Stripe / Zelle | ✅ | ✅ | ✅ |
| Twilio SMS notifications | ✅ | ✅ | ✅ |
| SendGrid / SMTP email | ✅ | ✅ | ✅ |
| PDF receipts | ✅ (needs FPDF lib) | ✅ | ✅ |
| Live driver GPS | 15-sec polling | ✅ real-time SSE | ✅ real-time SSE |
| Claude AI live chat | Non-streaming | ✅ streaming | ✅ streaming |
| Customer auth (1h idle) | ✅ | ✅ | ✅ |
| Round-trip / rental discounts | ✅ (rewrite) | ✅ | ✅ |
| Custom From→To quote | ✅ (rewrite) | ✅ | ✅ |
| Google Translate 8-lang | ✅ (client-side) | ✅ | ✅ |
| Uploaded photos | Same server | Railway volume | VPS disk |
| Cron / scheduled tasks | cPanel cron | Railway cron | Native cron |

---

## My clear recommendation for YOU

**Go with Path 1 (Namecheap VPS Pulsar 2GB).**

Why:
1. You already trust Namecheap (existing Stellar Business account, DNS, domain).
2. Pulsar 2GB is ~$9-15/mo — cheaper than your Stellar Business plan already, if you cancel the Stellar plan.
3. Single bill, single support line.
4. Full 100% feature preservation with no dev work — just infrastructure setup.
5. When Rox grows, you upgrade the VPS in 1-click; no re-architecture.

**Downgrade path (if you want to save):**
Path 2 hybrid is fine for the first 6-12 months while you validate demand.
When revenue justifies it, migrate to Path 1 VPS.

---

## What YOU need to do next (in order)

1. **Save the code** — Emergent chat input → *Save to GitHub* button.
2. **Buy VPS** — Namecheap → VPS Hosting → Pulsar (or Magnetar for headroom).
3. **Point domain** — Namecheap Advanced DNS: `A @ <VPS-IP>` and `CNAME www roxtaxi.com`.
4. **SSH in and follow Path 1 steps** — or hire a sysadmin for one hour ($40-70 on Upwork).
5. **Restore Mongo dump** from `/app/deploy/mongo_export/`.
6. **Update env vars** in `/opt/rox/backend/.env` (see `/app/backend/.env` for the shape — DO NOT commit real keys to GitHub).
7. **Smoke test** — three curls in the guide (`/`, `/api/tours`, admin login).

---

## Files that live on your VPS after setup

```
/opt/rox/                       ← code (git clone)
├── backend/                    ← FastAPI + venv
│   ├── server.py
│   ├── .env                    ← real keys HERE (chmod 600)
│   ├── requirements.txt
│   └── venv/
├── frontend/
│   └── build/                  ← Nginx serves this
└── uploads/                    ← user photo uploads
/etc/nginx/sites-enabled/       ← the config above
/etc/supervisor/conf.d/         ← the supervisor config above
/var/lib/mongodb/               ← Mongo data files (Path 1 only)
```

Backup command (add to weekly cron):
```
0 3 * * 0 mongodump --db test_database --out /opt/rox/backups/mongo_$(date +\%Y\%m\%d)
```

---

_Prepared Feb 2026 · pairs with `/app/deploy/DEPLOYMENT_GUIDE.md`_
