import type { MediaType } from './photo';

export type AppLanguage = 'ko' | 'en';

export interface Filters {
  dateFromMs?: number | null;
  dateToMs?: number | null;
  rootIds?: number[];
  mediaTypes?: MediaType[];
  hasGps?: boolean;
}

export interface AppSettings {
  language: AppLanguage;
  watchEnabled: boolean;
  recentRoots: string[];
  favoriteCityIds: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'ko',
  watchEnabled: false,
  recentRoots: [],
  favoriteCityIds: [],
};
