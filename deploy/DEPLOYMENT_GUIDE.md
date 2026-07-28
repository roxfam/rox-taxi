# Rox Taxi Service & Tours — Deployment Package

**Prepared:** February 2026
**Version:** 0.1.0
**Contents of this folder (`/app/deploy/`):**

```
deploy/
├── DEPLOYMENT_GUIDE.md         ← this file — READ FIRST
├── mongo_export/               ← BSON dump (fastest for MongoDB Atlas restore)
│   └── test_database/
├── mongo_json/                 ← JSON per collection (portable / MySQL migration)
│   ├── bookings.json
│   ├── users.json
│   └── … (12 collections)
└── frontend_build/             ← production React static site (once yarn build finishes)
    ├── index.html
    ├── static/
    └── uploads/
```

---

## The reality of Namecheap Stellar Business

Stellar Business = **shared Linux hosting with PHP + MySQL only**.
It does **not** run:
- Python / FastAPI / Node.js long-running processes
- MongoDB
- Websockets / Server-Sent Events (for Claude AI chat streaming)
- Background workers / cron beyond ~5-minute intervals

**This means the current React+FastAPI+MongoDB stack cannot run on Stellar as-is.**

You have three realistic deployment paths — pick one:

---

## 🅰️ **RECOMMENDED — Hybrid (works today, ~$6/mo total extra)**

**React frontend on Stellar** + **FastAPI backend on Railway/Render/Fly.io** + **MongoDB Atlas (free tier)**.

### Step 1 — Frontend on Stellar (this folder has everything)
1. Edit `/app/frontend/.env` → set `REACT_APP_BACKEND_URL=https://api.roxtaxi.com` (your backend domain — see step 2)
2. Rebuild: `cd /app/frontend && yarn build`
3. In cPanel File Manager → open `~/public_html/` → upload every file inside `frontend_build/` (drag-and-drop the folder contents, not the folder itself).
4. Add `.htaccess` in `~/public_html/`:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```
5. Turn on AutoSSL: cPanel → *SSL/TLS Status* → run AutoSSL.
6. Point your domain: cPanel → *Domains* → make sure the root domain resolves to `public_html/`.

### Step 2 — Backend on Railway (5 min setup)
1. Create free account at https://railway.app
2. New Project → Deploy from GitHub → connect this repo (after pushing via Emergent "Save to GitHub")
3. Railway auto-detects Python. Set root as `/backend`
4. Add environment variables in Railway → copy from `/app/backend/.env`:
   ```
   MONGO_URL=<Atlas URI from step 3>
   DB_NAME=roxtaxi_prod
   ADMIN_EMAIL=roxfam2509@gmail.com
   PAYPAL_CLIENT_ID=…
   PAYPAL_CLIENT_SECRET=…
   TWILIO_ACCOUNT_SID=…
   TWILIO_AUTH_TOKEN=…
   TWILIO_FROM_NUMBER=…
   ADMIN_SMS_NUMBER=+12424322587
   SMTP_HOST=smtp.privateemail.com  (or whatever email provider)
   SMTP_USER=…
   SMTP_PASS=…
   EMERGENT_LLM_KEY=…
   STRIPE_API_KEY=sk_live_…
   PAYPAL_MODE=live
   CORS_ORIGINS=https://roxtaxi.com
   ```
5. Railway gives you a URL like `https://rox-backend-production.up.railway.app`
6. In Railway → Settings → add a custom domain `api.roxtaxi.com` and add a CNAME in Namecheap DNS pointing to Railway's target.
7. First deploy triggers automatically. Watch build logs. When healthy, hit `https://api.roxtaxi.com/api/tours` in your browser — should return JSON.

### Step 3 — MongoDB on Atlas (free forever)
1. Create free account at https://mongodb.com/atlas
2. Create a cluster (M0 free tier)
3. Add a database user + allow IP `0.0.0.0/0` in Network Access
4. Get connection string → paste as `MONGO_URL` in Railway (step 2)
5. Restore data:
   ```bash
   mongorestore --uri "<atlas connection string>" --db roxtaxi_prod /app/deploy/mongo_export/test_database/
   ```

**Cost:** Railway free trial → then ~$5/mo. MongoDB Atlas M0 = FREE. Namecheap Stellar you already have.

---

## 🅱️ **PURE-STELLAR — Finish the PHP/MySQL rewrite**

Scaffolding already in `/app/backend-php/`:
- ✅ `schema.sql` — MySQL schema
- ✅ `README-DEPLOYMENT.md` — step-by-step guide
- ✅ `.env.example` — every env var
- ✅ `public/api/index.php` — front controller
- ❌ Route handlers (auth, bookings, payments) — INCOMPLETE
- ❌ MongoDB→MySQL migrator — INCOMPLETE
- ❌ Live GPS + AI chat drop to polling / non-streaming

**Effort remaining:** ~2 full working sessions. See `/app/backend-php/README-DEPLOYMENT.md`. Recommended only if you strictly must have single-server hosting.

---

## 🅲 **STATIC BROCHURE — Fastest, no backend**

If you don't need bookings yet:
1. Delete `/booking`, `/pay`, `/track`, `/admin` routes from React app
2. Route "Book" buttons to WhatsApp/phone
3. Build & upload — done in 30 min.

Not recommended (you lose your admin panel + payments + tracking) but valid for a launch page while you set up option A.

---

## Data export summary

**MongoDB dump:** `/app/deploy/mongo_export/` (BSON — for `mongorestore`)
**JSON export:** `/app/deploy/mongo_json/` (portable — 12 collections)

Collections included:
- `bookings` (66 records) · `users` (22) · `login_events` (31) · `user_sessions` (21)
- `taxi_services` (24) · `tours` (13) · `rentals` (6) · `home_slides` (9)
- `bookings`, `payment_transactions`, `contact_messages`, `group_inquiries`, `chat_messages`, `taxi_quote_requests`, `site_config`

---

## Live integration keys — DO NOT COMMIT

**Do not push `/app/backend/.env` to GitHub.** Only the keys are secret; the code is fine to publish.

Live services active:
- PayPal (LIVE keys)
- Twilio SMS (LIVE)
- SMTP email
- Emergent LLM key (Claude Sonnet 4.6)
- Stripe (test mode)

---

## Domain + DNS setup at Namecheap

Assuming your primary domain is `roxtaxi.com`:

| Record | Host | Value | TTL |
|---|---|---|---|
| A | @ | (Namecheap Stellar server IP) | Auto |
| CNAME | www | roxtaxi.com | Auto |
| CNAME | api | (Railway target — e.g. `rox-backend-production.up.railway.app`) | Auto |
| MX | @ | (email provider records) | Auto |

---

## Post-deployment smoke tests

```bash
# 1. Frontend loads
curl -I https://roxtaxi.com   # → 200

# 2. Backend health
curl https://api.roxtaxi.com/api/tours   # → JSON array

# 3. Booking creation
curl -X POST https://api.roxtaxi.com/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"service_type":"taxi","item_id":"airport-nassau","item_name":"LPIA → Downtown","price":40,"customer_name":"Test","customer_email":"test@example.com","customer_phone":"+12420000000","booking_date":"2026-03-15T14:00:00","passengers":2,"payment_method":"zelle"}'
# → {"id":"...","status":"pending", ...}

# 4. Admin login
curl -X POST https://api.roxtaxi.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"roxfam2509@gmail.com","password":"admin123"}'
# → {"token":"..."}
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank white page on Stellar | Missing `.htaccess` SPA fallback. See Step 1.4. |
| "Network error" in browser console | `REACT_APP_BACKEND_URL` wrong. Rebuild frontend with correct value. |
| CORS errors | Backend's `CORS_ORIGINS` env var must include your Stellar domain. |
| PayPal / Stripe checkout redirects fail | Update `success_url` and `cancel_url` env vars to point to `https://roxtaxi.com/…` |
| SMS not arriving | Verify Twilio `TWILIO_FROM_NUMBER` is a valid purchased number, not a trial. |
| Emails going to spam | Add SPF + DKIM records at Namecheap DNS for your sending domain. |

---

## What lives on Emergent vs Stellar (recommended path A)

| Component | Where |
|---|---|
| React SPA (public site + admin panel) | Namecheap Stellar |
| FastAPI backend + all `/api/*` endpoints | Railway (or Render/Fly.io) |
| MongoDB database | MongoDB Atlas free tier |
| Uploaded photos (`/app/backend/uploads/`) | Railway persistent volume (or move to Cloudflare R2 later) |
| Email (SMTP) | Namecheap Private Email or SendGrid |
| SMS | Twilio |
| AI chat | Emergent LLM key |

---

_Made with care — good luck on launch day. Any issue, DM the developer / open a fresh Emergent session and reference `/app/memory/PRD.md` + this file._
