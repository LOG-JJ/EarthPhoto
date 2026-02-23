import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import migration001 from './migrations/001_init.sql?raw';
import migration002 from './migrations/002_media_support.sql?raw';
import migration003 from './migrations/003_settings_favorite_cities.sql?raw';

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: '001_init.sql', sql: migration001 },
  { name: '002_media_support.sql', sql: migration002 },
  { name: '003_settings_favorite_cities.sql', sql: migration003 },
];

export interface DbClient {
  db: Database.Database;
  dbPath: string;
  close: () => void;
}

export function createDbClient(baseDir: string): DbClient {
  fs.mkdirSync(baseDir, { recursive: true });
  const dbPath = path.join(baseDir, 'photo-globe.sqlite');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      appliedAtMs INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM schema_migrations').all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((row) => row.name));
  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (name, appliedAtMs) VALUES (@name, @appliedAtMs)',
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) {
      continue;
    }

    const tx = db.transaction(() => {
      db.exec(migration.sql);
      insertMigration.run({ name: migration.name, appliedAtMs: Date.now() });
    });
    tx();
  }

  return {
    db,
    dbPath,
    close: () => db.close(),
  };
}
