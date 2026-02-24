import type Database from 'better-sqlite3';

import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_ONBOARDING_STATE,
  DEFAULT_SETTINGS,
  type AppSettings,
  type FeatureFlags,
  type OnboardingState,
  type UiThemePreset,
} from '@shared/types/settings';

const SETTINGS_KEY = 'app.settings';

function normalizeThemePreset(value: unknown): UiThemePreset {
  if (value === 'indigo' || value === 'ocean' || value === 'sunset') {
    return value;
  }
  return DEFAULT_SETTINGS.uiThemePreset;
}

function normalizeFeatureFlags(value: unknown): FeatureFlags {
  const raw = typeof value === 'object' && value !== null ? (value as Partial<FeatureFlags>) : {};
  return {
    journeyCoachV1:
      typeof raw.journeyCoachV1 === 'boolean' ? raw.journeyCoachV1 : DEFAULT_FEATURE_FLAGS.journeyCoachV1,
    timelineStoryV1:
      typeof raw.timelineStoryV1 === 'boolean' ? raw.timelineStoryV1 : DEFAULT_FEATURE_FLAGS.timelineStoryV1,
    tripCardsV1:
      typeof raw.tripCardsV1 === 'boolean' ? raw.tripCardsV1 : DEFAULT_FEATURE_FLAGS.tripCardsV1,
    metricsPanelV1:
      typeof raw.metricsPanelV1 === 'boolean' ? raw.metricsPanelV1 : DEFAULT_FEATURE_FLAGS.metricsPanelV1,
  };
}

function normalizeOnboarding(value: unknown): OnboardingState {
  const raw = typeof value === 'object' && value !== null ? (value as Partial<OnboardingState>) : {};
  const completedAtMs = typeof raw.completedAtMs === 'number' && Number.isFinite(raw.completedAtMs)
    ? raw.completedAtMs
    : null;
  const skippedAtMs = typeof raw.skippedAtMs === 'number' && Number.isFinite(raw.skippedAtMs)
    ? raw.skippedAtMs
    : null;
  return {
    version: 1,
    completedAtMs,
    skippedAtMs,
  };
}

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
        activeRootIds: Array.isArray(parsed.activeRootIds)
          ? parsed.activeRootIds.filter((item): item is number => Number.isInteger(item) && item > 0)
          : [],
        favoriteCityIds: Array.isArray(parsed.favoriteCityIds)
          ? parsed.favoriteCityIds.filter((item): item is string => typeof item === 'string')
          : [],
        uiThemePreset: normalizeThemePreset(parsed.uiThemePreset),
        featureFlags: normalizeFeatureFlags(parsed.featureFlags),
        onboarding: normalizeOnboarding(parsed.onboarding),
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
      activeRootIds: patch.activeRootIds ?? current.activeRootIds,
      favoriteCityIds: patch.favoriteCityIds ?? current.favoriteCityIds,
      uiThemePreset: normalizeThemePreset(patch.uiThemePreset ?? current.uiThemePreset),
      featureFlags: normalizeFeatureFlags(patch.featureFlags ?? current.featureFlags),
      onboarding: normalizeOnboarding(patch.onboarding ?? current.onboarding ?? DEFAULT_ONBOARDING_STATE),
    };

    this.upsertStmt.run({ key: SETTINGS_KEY, value: JSON.stringify(next) });
    return next;
  }
}

