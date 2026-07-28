# Rox Taxi Deployment Package

Read **DEPLOYMENT_GUIDE.md** first — it explains why Stellar shared hosting
can't run the current stack as-is and lays out the recommended $6/mo hybrid
deployment path (frontend on Stellar + FastAPI on Railway + MongoDB Atlas).

## Contents
- `DEPLOYMENT_GUIDE.md`  — READ THIS FIRST
- `frontend_build/`       — production React build (upload contents to `public_html/`)
- `mongo_export/`         — BSON dump for `mongorestore`
- `mongo_json/`           — per-collection JSON for portability
