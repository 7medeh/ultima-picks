import { getDb, initializeSchema } from './schema';

export function runMigrations(): void {
  const db = getDb();

  // Track applied migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  initializeSchema();

  // Register initial migration as applied
  const stmt = db.prepare(`INSERT OR IGNORE INTO migrations (name, applied_at) VALUES (?, ?)`);
  stmt.run('001_initial_schema', new Date().toISOString());
}
