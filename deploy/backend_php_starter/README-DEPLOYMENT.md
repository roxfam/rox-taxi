# Rox Taxi & Tours — Namecheap Stellar Deployment

This folder is a **complete PHP 8 + MySQL rewrite** of the FastAPI/MongoDB
backend, tuned to run on Namecheap Stellar Shared hosting alongside the
compiled React frontend. Everything lives in a single cPanel account, one
domain, one database, one control panel.

---

## 1 · Prerequisites (once per account)

1. **PHP version** — cPanel → *Select PHP Version* → set to **8.1 or 8.2**.
   Enable extensions: `curl`, `openssl`, `pdo_mysql`, `mbstring`, `gd`,
   `fileinfo`.
2. **MySQL database** — cPanel → *MySQL Databases* → create:
   - database name: `<cpanel-user>_rox`
   - user + strong password
   - grant the user **ALL PRIVILEGES** on that DB.
3. **AutoSSL** — cPanel → *SSL/TLS Status* → enable AutoSSL for the domain.
4. **Cron** — cPanel → *Cron Jobs* → we'll add one below.

---

## 2 · Upload the site

Copy the contents of `backend-php/public/` **into `~/public_html/`** so the
final layout is:

```
~/public_html/
├── .htaccess                 ← SPA fallback + /api rewrite
├── index.html                ← React SPA build
├── static/                   ← React build assets
├── uploads/                  ← writable (755) — photos land here
└── api/
    ├── .htaccess
    ├── index.php             ← front controller
    ├── lib.php               ← DB, JWT, notifications, cURL helpers
    ├── seed.php              ← seed catalog data
    └── routes/
        ├── catalog.php
        ├── bookings.php
        ├── auth.php
        └── payments.php
```

Copy `backend-php/.env.example` to **`~/rox.env`** (OUTSIDE `public_html/`)
and fill in every value. The API reads it from `../rox.env`.

---

## 3 · Create the database schema

cPanel → *phpMyAdmin* → select your DB → *Import* → upload
`backend-php/schema.sql`. This creates every table and seeds the default
catalog rows.

---

## 4 · Migrate existing MongoDB content

On your existing Emergent pod (where MongoDB is running) run:

```bash
cd /app/backend-php
python3 migrate_from_mongo.py \
    --mongo-url "$MONGO_URL" \
    --db-name  "$DB_NAME" \
    --out      migration-dump.sql
```

Then in phpMyAdmin → *Import* → upload `migration-dump.sql`.
Every photo URL that references `/api/uploads/…` is preserved — copy the
`uploads/` directory verbatim from the pod to `~/public_html/uploads/`.

---

## 5 · Point the frontend at the same domain

Before running `yarn build` on the frontend, edit `frontend/.env`:

```
REACT_APP_BACKEND_URL=
```

Empty value → the SPA calls `/api/*` on the same origin (Namecheap).
Then:

```bash
cd /app/frontend
yarn build
```

Upload the entire `build/` directory contents to `~/public_html/`
(overwriting `index.html` and `static/`).

---

## 6 · Configure cron (driver-ping cleanup + notifications)

cPanel → *Cron Jobs* → add:

```
*/5 * * * * cd ~/public_html/api && php cron.php > /dev/null 2>&1
```

The cron prunes stale driver pings (>60s old) and retries queued
notifications that failed on first attempt.

---

## 7 · Smoke-test

- Visit `https://<your-domain>/` — SPA loads.
- Visit `https://<your-domain>/api/tours` — JSON returns 12+ tours.
- Log in at `/admin/login` with the admin creds from `rox.env`.
- Create a test booking (Zelle payment method — no external call).

If any request 500s, check `~/public_html/api/error.log`.

---

## What is different from the FastAPI backend?

| Feature | FastAPI (Mongo) | PHP (MySQL) |
|---|---|---|
| Live driver GPS | Server-Sent Events | ~15-second polling (`GET /api/bookings/{id}/driver-location`) |
| Async I/O | asyncio + Motor | Per-request PDO |
| Live AI chat | SSE streaming | Blocking cURL to Emergent LLM (no streaming) |
| Rest of the site | Same endpoints, same request/response shapes | ✅ |

The frontend requires **no code changes** other than `REACT_APP_BACKEND_URL`.
