# AnyList recipe export

Downloads every recipe from AnyList to `recipes.json`. It also keeps dated snapshots in `history/`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANYLIST_EMAIL` / `ANYLIST_PASSWORD` | — | AnyList login (put them in `.env`) |
| `OUTPUT_DIR` | `./recipes` (`/data` in Docker) | Where backups are written |
| `SCHEDULE` | unset | Cron expression, e.g. `0 3 * * *`. If unset, the export runs once and exits |
| `RUN_ON_START` | `true` | When `SCHEDULE` is set, also run once right when the container starts |
| `TZ` | UTC | Time zone used for the schedule |
| `KEEP_SNAPSHOTS` | `30` | How many dated copies to keep in `history/` (`0` turns snapshots off) |

If AnyList returns zero recipes, the export fails and leaves the existing backup untouched.

## Run locally

```bash
cp .env.example .env   # then edit it
npm ci
npm start
```

## Run on a Synology NAS (Container Manager)

1. Make a folder for the project and backups, e.g. `/volume1/docker/anylist-export`, and copy this repo into it (File Station, or `git clone` over SSH).
2. Copy `.env.example` to `.env` in that folder and fill in your AnyList email and password.
3. In `docker-compose.yml`, set `TZ` to your time zone. Change `SCHEDULE` if you want a different time. If you want the backups somewhere else, change the volume's left side, e.g. `/volume1/backups/anylist:/data`.
4. Open **Container Manager → Project → Create**. Choose the folder, pick "Use existing docker-compose.yml", and finish the wizard. Container Manager builds the image and starts it.
5. Open the container's **Log** tab. You should see `Saved N recipes to /data/recipes.json`, and the files appear in the folder.

The container keeps running and does a backup on the schedule. `restart: unless-stopped` brings it back after the NAS reboots.

To pull in code changes later, open **Project → Action → Build** in Container Manager.

### Alternative: Synology Task Scheduler

If you don't want a container running all the time, remove `SCHEDULE` and `restart` from `docker-compose.yml`. Then add a **Control Panel → Task Scheduler → Scheduled Task → User-defined script** that runs as root:

```bash
cd /volume1/docker/anylist-export && docker compose run --rm anylist-export
```

On older DSM versions, use `docker-compose` instead of `docker compose`.
