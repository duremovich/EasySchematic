import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "..");
const sourceMigrationsDir = path.resolve(apiRoot, "migrations");
const repoMigrationsDir = path.resolve(process.cwd(), "tateside-api", "migrations");

export function openDatabase(dbPath: string): DatabaseSync {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

function migrationsDir(): string {
  if (existsSync(sourceMigrationsDir)) return sourceMigrationsDir;
  return repoMigrationsDir;
}

export function runMigrations(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const rows = db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[];
  const applied = new Set(rows.map((row) => row.id));
  const files = readdirSync(migrationsDir())
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir(), file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(file);
      db.exec("COMMIT");
      process.stdout.write(`Applied migration ${file}\n`);
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
