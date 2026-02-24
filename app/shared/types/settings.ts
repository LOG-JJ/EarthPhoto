import type { MediaType } from './photo';

export type AppLanguage = 'ko' | 'en';
export type UiThemePreset = 'indigo' | 'ocean' | 'sunset';

export interface FeatureFlags {
  journeyCoachV1: boolean;
  timelineStoryV1: boolean;
  tripCardsV1: boolean;
  metricsPanelV1: boolean;
}

export interface OnboardingState {
  version: 1;
  completedAtMs: number | null;
  skippedAtMs: number | null;
}

export interface Filters {
  dateFromMs?: number | null;
  dateToMs?: number | null;
  includeUndated?: boolean;
  rootIds?: number[];
  mediaTypes?: MediaType[];
  hasGps?: boolean;
  cameraModelQuery?: string;
  minWidthPx?: number;
  minHeightPx?: number;
  durationFromMs?: number;
  durationToMs?: number;
}

export interface AppSettings {
  language: AppLanguage;
  watchEnabled: boolean;
  recentRoots: string[];
  activeRootIds: number[];
  favoriteCityIds: string[];
  uiThemePreset: UiThemePreset;
  featureFlags: FeatureFlags;
  onboarding: OnboardingState;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  journeyCoachV1: true,
  timelineStoryV1: false,
  tripCardsV1: false,
  metricsPanelV1: true,
};

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  version: 1,
  completedAtMs: null,
  skippedAtMs: null,
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'ko',
  watchEnabled: false,
  recentRoots: [],
  activeRootIds: [],
  favoriteCityIds: [],
  uiThemePreset: 'indigo',
  featureFlags: DEFAULT_FEATURE_FLAGS,
  onboarding: DEFAULT_ONBOARDING_STATE,
};
