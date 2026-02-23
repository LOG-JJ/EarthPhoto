import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

export interface CityCatalogDbClient {
  db: Database.Database;
  dbPath: string;
  close: () => void;
}

export const CITY_CATALOG_FILENAME = 'city-catalog.sqlite';

export function ensureCityCatalogSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS city_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS country_catalog (
      countryCode TEXT PRIMARY KEY,
      countryName TEXT NOT NULL,
      continentCode TEXT NOT NULL,
      continentName TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS city_catalog (
      cityId TEXT PRIMARY KEY,
      geonameId INTEGER NOT NULL,
      name TEXT NOT NULL,
      asciiName TEXT,
      normalizedName TEXT NOT NULL,
      countryCode TEXT NOT NULL,
      continentCode TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      population INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(countryCode) REFERENCES country_catalog(countryCode) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_city_continent_country ON city_catalog(continentCode, countryCode);
    CREATE INDEX IF NOT EXISTS idx_city_country_name ON city_catalog(countryCode, normalizedName);
    CREATE INDEX IF NOT EXISTS idx_city_population ON city_catalog(countryCode, population DESC);
  `);
}

export function createCityCatalogDbClient(baseDir: string, fileName = CITY_CATALOG_FILENAME): CityCatalogDbClient {
  fs.mkdirSync(baseDir, { recursive: true });
  const dbPath = path.join(baseDir, fileName);
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  ensureCityCatalogSchema(db);
  return {
    db,
    dbPath,
    close: () => db.close(),
  };
}
