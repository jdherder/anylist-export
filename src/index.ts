const AnyList = require("anylist");
import * as dotenv from "dotenv";
import * as fs from "fs/promises";
import * as path from "path";
import cron from "node-cron";

dotenv.config({ quiet: true });

const OUTPUT_DIR = path.resolve(
  process.env.OUTPUT_DIR || path.join(__dirname, "..", "recipes")
);
// Number of dated snapshots to keep in OUTPUT_DIR/history (0 = no history).
const KEEP_SNAPSHOTS = parseInt(process.env.KEEP_SNAPSHOTS ?? "30", 10);
// Cron expression, e.g. "0 3 * * *" for daily at 3am. Unset = run once and exit.
const SCHEDULE = process.env.SCHEDULE?.trim();
const RUN_ON_START = (process.env.RUN_ON_START ?? "true").toLowerCase() !== "false";

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function writeAtomic(file: string, contents: string) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, contents, "utf-8");
  await fs.rename(tmp, file);
}

async function pruneSnapshots(historyDir: string) {
  const files = (await fs.readdir(historyDir))
    .filter((f) => /^recipes-.*\.json$/.test(f))
    .sort(); // ISO-like names sort chronologically
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_SNAPSHOTS))) {
    await fs.unlink(path.join(historyDir, f));
    log(`Pruned old snapshot ${f}`);
  }
}

async function downloadRecipes() {
  const email = process.env.ANYLIST_EMAIL;
  const password = process.env.ANYLIST_PASSWORD;
  if (!email || !password) {
    throw new Error("ANYLIST_EMAIL and ANYLIST_PASSWORD must be set");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const anylist = new AnyList({
    email,
    password,
    // Keep the auth token alongside the backups so it survives container restarts.
    credentialsFile: path.join(OUTPUT_DIR, ".anylist_credentials"),
  });

  try {
    log("Logging in to AnyList...");
    await anylist.login();

    log("Fetching recipes...");
    const recipes = await anylist.getRecipes();

    // Guard against overwriting a good backup with an empty result.
    if (!Array.isArray(recipes) || recipes.length === 0) {
      throw new Error("AnyList returned no recipes; keeping existing backup");
    }

    const json = JSON.stringify(recipes, null, 2);
    await writeAtomic(path.join(OUTPUT_DIR, "recipes.json"), json);

    if (KEEP_SNAPSHOTS > 0) {
      const historyDir = path.join(OUTPUT_DIR, "history");
      await fs.mkdir(historyDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "");
      await writeAtomic(path.join(historyDir, `recipes-${stamp}.json`), json);
      await pruneSnapshots(historyDir);
    }

    log(`Saved ${recipes.length} recipes to ${path.join(OUTPUT_DIR, "recipes.json")}`);
  } finally {
    try {
      await anylist.teardown();
    } catch {
      // ignore teardown errors
    }
  }
}

async function main() {
  if (!SCHEDULE) {
    try {
      await downloadRecipes();
      process.exit(0);
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  }

  if (!cron.validate(SCHEDULE)) {
    console.error(`Invalid SCHEDULE cron expression: "${SCHEDULE}"`);
    process.exit(1);
  }

  let running = false;
  const runSafely = async () => {
    if (running) return;
    running = true;
    try {
      await downloadRecipes();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Backup failed:`, error);
    } finally {
      running = false;
    }
  };

  log(`Scheduled backups with "${SCHEDULE}" (TZ=${process.env.TZ || "UTC"})`);
  cron.schedule(SCHEDULE, runSafely, { timezone: process.env.TZ || undefined });
  if (RUN_ON_START) await runSafely();
}

main();
