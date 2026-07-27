# Deploying Rox Taxi Service and Tours on Namecheap

This guide covers the two common Namecheap setups:

## Option A — Namecheap Shared / Stellar Hosting (frontend only)
Shared hosting can only serve **static files** — perfect for the React frontend, but the
FastAPI backend + MongoDB need to run somewhere else (Namecheap VPS, Render, Fly, Railway,
or a Bahamas-based host). Use this option if your Namecheap plan doesn't include Node.js.

1. Build the frontend:
   ```bash
   cd /app/frontend
   yarn install
   yarn build          # outputs to /app/frontend/build
   ```
2. Point `REACT_APP_BACKEND_URL` (in `.env` before build) to your backend host, e.g.:
   ```
   REACT_APP_BACKEND_URL=https://api.roxtaxi.com
   ```
3. FTP the entire `build/` folder into `public_html/` on cPanel.
4. In cPanel → **Redirects**, redirect `/*` to `index.html` (React Router). Or add this to
   `public_html/.htaccess`:
   ```apache
   RewriteEngine On
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule ^ index.html [L]
   ```

## Option B — Namecheap VPS / Stellar Business with Node.js & Python
On a Namecheap VPS you can run everything.

1. SSH into your VPS. Install: Python 3.11+, Node 20+, MongoDB 6+, nginx, certbot.
2. Clone this repo to `/var/www/roxtaxi`.
3. **Backend:**
   ```bash
   cd backend
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env    # fill in the values below
   # Run behind nginx as a systemd service:
   uvicorn server:app --host 127.0.0.1 --port 8001
   ```
4. **Frontend:**
   ```bash
   cd frontend
   yarn install && yarn build
   # serve /app/frontend/build via nginx as static
   ```
5. **nginx** — proxy `/api` → uvicorn, everything else → static build. Use certbot for HTTPS.

## Namecheap Private Email (SMTP) — Confirmation emails
Set these in `backend/.env` and restart the backend. No SendGrid account required.

```
SMTP_HOST=mail.privateemail.com
SMTP_PORT=587
SMTP_USER=hello@roxtaxi.com
SMTP_PASSWORD=your-privateemail-password
SMTP_FROM=hello@roxtaxi.com
SMTP_USE_TLS=true
```
(Port 465 with SSL also works — leave `SMTP_USE_TLS` as `true` and change port to `465`.)

The backend automatically falls back to SMTP if `SENDGRID_API_KEY` is empty. Wedding-quote
PDFs, booking receipts, and group-inquiry acknowledgements will all send via SMTP.

## MongoDB on Namecheap
Namecheap doesn't offer managed MongoDB. Options:

- **MongoDB Atlas free tier** (recommended) — set `MONGO_URL` to your Atlas SRV string.
- Self-host on the same VPS: `apt install mongodb-org`, keep it bound to `127.0.0.1`.

## DNS records to create
| Type  | Host  | Value                | Purpose                 |
|-------|-------|----------------------|-------------------------|
| A     | @     | your-vps-ip          | apex domain             |
| A     | www   | your-vps-ip          | www                     |
| A     | api   | your-vps-ip          | backend API             |
| MX    | @     | mx1.privateemail.com | Private Email inbound   |
| TXT   | @     | v=spf1 include:spf.privateemail.com ~all | SPF, prevents spoofing |

## Backend `.env` template (Namecheap-ready)
See `backend/.env` — SMTP variables are already scaffolded. Just fill them in.
