# Nightly MongoDB → Backblaze B2 Backups

Every night at **03:15 UTC** the VPS dumps the Rox Taxi Mongo database,
compresses it, uploads the archive to a private Backblaze B2 bucket, and
prunes anything older than 30 days. If the VPS ever dies you can restore
every booking, tour, gallery submission and license from the last upload
in about 4 minutes.

**Total cost: about $0.20/month** for a healthy Rox Taxi workload (Backblaze's
first 10 GB of storage is free; egress is $0.01/GB after the free tier).

---

## 1. Create the Backblaze account and bucket (one time)

1. Sign up: <https://www.backblaze.com/b2/sign-up.html>
2. **Buckets** → **Create Bucket**
   - Name: `rox-taxi-backups` (must be globally unique — add a suffix if it's taken)
   - Files: **Private**
   - Default encryption: **Enable (SSE-B2)** — free, encrypted at rest
   - Object Lock: leave off for now (you can turn on later for ransomware protection)
3. Open the bucket → **Lifecycle Settings** → **Keep only the last version of the file**
   (Backblaze charges for old versions, this saves you money.)

## 2. Create a scoped Application Key (one time)

1. **App Keys** → **Add a New Application Key**
   - Name: `rox-taxi-nightly-backup`
   - Allow access to bucket: `rox-taxi-backups`
   - Type of Access: **Read and Write**
   - Duration: leave blank (never expires)
2. Click **Create New Key** — the `keyID` and `applicationKey` are shown
   **exactly once**. Copy both into a password manager immediately.

## 3. Install on the VPS (one time)

SSH into your Rox Taxi server, then:

```bash
cd ~/rox-taxi
git pull                     # make sure you have the latest scripts/
sudo bash scripts/install-backup-cron.sh
```

The installer will:
- Install the `b2` CLI via pip
- Prompt you for the `keyID`, `applicationKey`, `bucket name`, and your Mongo
  database name (default `test_database`)
- Write the credentials to `/etc/rox-backup.env` (owned by root, mode `0600`)
- Run one backup immediately as a smoke test — you'll see it upload
- Install a systemd timer that runs the backup nightly at 03:15 UTC

If the smoke test fails, fix the values in `/etc/rox-backup.env` and re-run
`sudo bash scripts/install-backup-cron.sh`.

## 4. Verify it's working

```bash
# Timer next-run + last-run times
systemctl list-timers rox-backup.timer

# Last night's log
tail -n 40 /var/log/rox-backup.log

# Manually trigger a backup right now
sudo systemctl start rox-backup.service
```

You should see three archives after the first three nights. In the B2
web console → Browse Files, the archive names look like
`mongo/rox-mongo-YYYYMMDD-HHMMSS.tgz`.

## 5. Restore from backup (disaster recovery)

If the VPS ever dies:

```bash
# 1. Get the b2 CLI on a fresh box (any Linux/Mac)
pip install --upgrade b2

# 2. Authorize with the same keyID + applicationKey
b2 account authorize <keyID> <applicationKey>

# 3. Pick the latest archive and pull it down
b2 ls b2://rox-taxi-backups mongo/ | tail -n 5   # see the most recent 5
b2 file download b2://rox-taxi-backups/mongo/rox-mongo-20260315-031500.tgz ./restore.tgz

# 4. Untar it, then mongorestore into the new server
tar -xzf restore.tgz
mongorestore --uri mongodb://127.0.0.1:27017 --nsInclude 'test_database.*' test_database/
```

After that, redeploy the app with `scripts/deploy-app.sh`. Total downtime:
**about 5 minutes**.

---

## What's inside `/etc/rox-backup.env`

```
MONGO_URI="mongodb://127.0.0.1:27017"
MONGO_DB="test_database"
B2_APPLICATION_KEY_ID="004abc…"
B2_APPLICATION_KEY="K004…"
B2_BUCKET="rox-taxi-backups"
BACKUP_RETENTION_DAYS="30"
```

Never commit this file — it's already covered by `.gitignore`. Rotate the
key from the Backblaze UI at any time; just re-run
`sudo bash scripts/install-backup-cron.sh` to save the new values.
