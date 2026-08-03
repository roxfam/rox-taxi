# Nightly MongoDB → Mega.io Backups (100% Free)

Every night at **03:15 UTC** the VPS dumps the Rox Taxi Mongo database,
compresses it, uploads the archive to your Mega.io account, and prunes
anything older than 30 days (locally + remotely). If the VPS ever dies
you can restore every booking, tour, gallery submission and license from
the last upload in about 4 minutes.

**Cost: $0/month** — Mega.io gives every account 20 GB free forever.
Rox Taxi nightly dumps are usually 10-50 MB, so a full 30-day rolling
window is around 1.5 GB. You have decades of headroom.

---

## 1. Create your Mega.io account (one time, ~1 min)

1. Go to <https://mega.io/register>
2. Sign up with your email + a strong password (no credit card required)
3. Confirm the email — that's it. You now have 20 GB of end-to-end
   encrypted storage.

**Keep the password in a password manager** — if you lose it you can't
recover the encrypted files. (This is a Mega guarantee: they can't read
your data even if they wanted to.)

## 2. Deploy the latest code to the VPS

```bash
ssh rox@<YOUR_VPS_IP>
cd ~/rox-taxi
git pull                                # make sure you have scripts/backup-mongo-mega.sh
bash scripts/deploy-updates.sh          # optional — refreshes the app too
```

## 3. Run the installer (one time, ~2 min)

```bash
sudo bash scripts/install-backup-cron.sh
```

The installer will:
- Install `megatools` via apt (the free Mega CLI)
- Prompt for your Mega email + password → writes `/etc/rox-mega.ini`
  (owned by root, mode `0600` so no other Linux user can read it)
- Prompt for Mongo DB name, retention window → writes `/etc/rox-backup.env`
- Test the Mega login before doing anything else
- Run one full backup immediately as a smoke test — you'll see it upload
- Install a systemd timer that runs the backup every night at 03:15 UTC

If the smoke test fails, fix the values in either config file and re-run
`sudo bash scripts/install-backup-cron.sh`.

## 4. Verify it's working

```bash
# Timer next-run + last-run times
systemctl list-timers rox-backup.timer

# Last night's log
tail -n 40 /var/log/rox-backup.log

# Manually trigger a backup right now
sudo systemctl start rox-backup.service

# Browse what's in Mega
megals --config /etc/rox-mega.ini /Root/rox-taxi-backups
```

You should see three archives after the first three nights. In the Mega
web app (<https://mega.nz>) → `rox-taxi-backups/`, the files look like
`rox-mongo-YYYYMMDD-HHMMSS.tgz`.

## 5. Restore from backup (disaster recovery)

If the VPS ever dies:

```bash
# 1. On any Linux/Mac, install megatools
sudo apt install megatools    # Ubuntu/Debian
brew install megatools        # macOS

# 2. Create /tmp/mega.ini with your Mega email + password
cat > /tmp/mega.ini <<EOF
[Login]
Username = you@example.com
Password = your-mega-password
EOF
chmod 600 /tmp/mega.ini

# 3. See what's there and pull the latest archive
megals --config /tmp/mega.ini /Root/rox-taxi-backups | tail -n 5
megaget --config /tmp/mega.ini /Root/rox-taxi-backups/rox-mongo-20260315-031500.tgz

# 4. Restore into the new Mongo
tar -xzf rox-mongo-20260315-031500.tgz         # extracts whichever DB folder(s) were dumped
mongorestore --uri mongodb://127.0.0.1:27017 . # restore everything the archive contains
```

After that, redeploy the app with `scripts/deploy-app.sh`. Total downtime:
**about 5 minutes**.

---

## What's inside the two config files

`/etc/rox-mega.ini` — your Mega login (root-only readable):
```
[Login]
Username = you@example.com
Password = your-mega-password
```

`/etc/rox-backup.env` — Mongo + retention settings:
```
MONGO_URI="mongodb://127.0.0.1:27017"
MONGO_DB="test_database"
MEGA_REMOTE_DIR="/Root/rox-taxi-backups"
BACKUP_RETENTION_DAYS="30"
```

Neither file is committed to git (they're already covered by `.gitignore`).
To change any value, edit with `sudo nano /etc/rox-backup.env` (or
`/etc/rox-mega.ini`) and the next nightly run will pick it up automatically.

## Bumping retention or storage

- **More than 30 days of history?** Edit `BACKUP_RETENTION_DAYS` in
  `/etc/rox-backup.env`. At ~1.5 GB per 30 days you can keep ~400 days
  before you'd need to upgrade Mega (they sell "Pro Lite" for €5/month
  with 400 GB if you ever need it — but you almost certainly won't).
- **Faster/slower schedule?** Edit `/etc/systemd/system/rox-backup.timer`
  and change `OnCalendar=*-*-* 03:15:00` (e.g. `*-*-* */6:00:00` for every
  6 hours), then `sudo systemctl daemon-reload && sudo systemctl restart rox-backup.timer`.
