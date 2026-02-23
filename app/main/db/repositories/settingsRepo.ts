import type Database from 'better-sqlite3';

import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types/settings';

const SETTINGS_KEY = 'app.settings';

export class SettingsRepository {
  private readonly getStmt;
  private readonly upsertStmt;

  constructor(db: Database.Database) {
    this.getStmt = db.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1');
    this.upsertStmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
  }

  getSettings(): AppSettings {
    const row = this.getStmt.get(SETTINGS_KEY) as { value: string } | undefined;
    if (!row) {
      return DEFAULT_SETTINGS;
    }

    try {
      const parsed = JSON.parse(row.value) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        recentRoots: Array.isArray(parsed.recentRoots) ? parsed.recentRoots : [],
        favoriteCityIds: Array.isArray(parsed.favoriteCityIds)
          ? parsed.favoriteCityIds.filter((item): item is string => typeof item === 'string')
          : [],
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  setSettings(patch: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const next: AppSettings = {
      ...current,
      ...patch,
      recentRoots: patch.recentRoots ?? current.recentRoots,
      favoriteCityIds: patch.favoriteCityIds ?? current.favoriteCityIds,
    };

    this.upsertStmt.run({ key: SETTINGS_KEY, value: JSON.stringify(next) });
    return next;
  }
}

