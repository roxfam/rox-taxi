# Deploying the Visitor Analytics feature to the live server

Copy-paste these blocks in order on your Namecheap VPS. **~5 minutes total**,
zero downtime, no new API keys needed.

---

## What's new

| Piece | Location | Purpose |
|---|---|---|
| `POST /api/visitors/log` | `backend/routes/analytics.py` | Public beacon — frontend calls on every route change |
| `GET  /api/admin/visitors` | same | Paginated + sortable + filterable log |
| `GET  /api/admin/visitors/summary` | same | Top pages / countries / referrers |
| **Visitors** tab | `/admin/manage?tab=visitors` | Sortable table + CSV export + filters |
| `useVisitorBeacon` hook | `frontend/src/hooks/useVisitorBeacon.js` | Auto-fires on route change |
| Geo lookup | ip-api.com (free, no key, cached 7d in Mongo) | Country / city / ISP |

Two new Mongo collections auto-create on first hit: `visitor_events` +
`visitor_geo_cache`. **No manual migration.**

---

## Step 1 · SSH in and pull the code

```bash
ssh rox@<YOUR_VPS_IP>
cd /home/rox/app
git pull
```

Confirm you see the new files:

```bash
ls backend/routes/analytics.py \
   frontend/src/hooks/useVisitorBeacon.js \
   frontend/src/pages/admin/VisitorsPanel.jsx
# all three should print without errors
```

---

## Step 2 · Rebuild the frontend

```bash
cd /home/rox/app/frontend
yarn install --frozen-lockfile   # in case of any package changes
NODE_OPTIONS="--max-old-space-size=1536" yarn build
```

The build takes ~2 min on a 2GB VPS. Nginx picks up the new bundle
immediately — no reload needed (it serves the static files directly).

---

## Step 3 · Restart the backend

The new backend module is auto-imported by `server.py`, but a restart is
required to load it:

```bash
sudo systemctl restart rox-api
sudo journalctl -u rox-api -n 30
# Look for: "Application startup complete."
```

---

## Step 4 · Smoke test (no browser needed)

```bash
# 1) Fire a public beacon (this is what the frontend does)
curl -X POST https://roxtaxi.com/api/visitors/log \
     -H "Content-Type: application/json" \
     -d '{"path":"/tours","referrer":"","session_id":"smoke_test"}'
# → {"ok":true,"id":"..."}

# 2) Admin route MUST require auth
curl -o /dev/null -s -w "%{http_code}\n" https://roxtaxi.com/api/admin/visitors
# → 401

# 3) Admin route works with your bearer token
TOKEN=$(curl -s -X POST https://roxtaxi.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"roxfam2509@gmail.com","password":"<ADMIN_PASSWORD>"}' \
     | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s "https://roxtaxi.com/api/admin/visitors?limit=5" \
     -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30
# → { "total": 1, "rows": [...] }
```

---

## Step 5 · Verify in the browser

1. Open **https://roxtaxi.com** in a private/incognito window
2. Click around: `/tours`, `/rentals`, `/gallery`
3. Open **https://roxtaxi.com/admin/manage** → click the new **Visitors** tab
4. You should see your session in the log with device, country, and path

**Filters available in the panel:**
- Time window: last hour / 24h / 7d / 30d
- Country substring
- Path substring
- Sort by: Time / Path / Country / City / Device (click any column header)
- Export: CSV button in the top right

---

## What runs automatically

- **Every page view** on `roxtaxi.com` fires a beacon via
  `navigator.sendBeacon` — non-blocking, doesn't slow page loads
- **Admin pages** (`/admin/*`) are excluded so YOUR clicks don't pollute the
  report
- **Geo lookup** runs in the background per unique IP, cached for 7 days
  in Mongo so ip-api.com is hit at most a few times a day even under
  cruise-week traffic
- **No login required** for guests — the beacon is a public endpoint (like
  Google Analytics), only the admin reports require auth

---

## If something looks wrong

| Symptom | Fix |
|---|---|
| Visitors tab shows "No visitors in this window" | Wait 1 min, click Apply — beacon is async |
| Country column shows "Unknown" | ip-api.com rate-limited or blocked — check `sudo journalctl -u rox-api -n 100 \| grep geo` |
| Admin tab 401s | Log out + log back in to refresh JWT |
| Beacon fires but no rows appear | Check `sudo journalctl -u rox-api -n 100 \| grep visitor` for insert errors |
| Rebuild fails with OOM | Verify swap is on (`free -h`) — see QUICKSTART_NAMECHEAP_2GB.md step 2 |

---

## Rollback (if needed)

```bash
cd /home/rox/app
git log --oneline -5              # find the commit hash before the analytics merge
git checkout <PREV_COMMIT>
cd frontend && NODE_OPTIONS="--max-old-space-size=1536" yarn build
sudo systemctl restart rox-api
```

The two new Mongo collections (`visitor_events`, `visitor_geo_cache`) are
harmless if left behind — nothing else reads them.

---

**You're live.** Every visit from this moment forward lands in the log.

— Rox Taxi Service & Tours
