import type { CityItem } from '@shared/types/ipc';

export const CITY_PAGE_SIZE = 100;

export function mergeFavoriteCityIds(defaultIds: string[], userIds: string[]): string[] {
  return Array.from(new Set([...defaultIds, ...userIds]));
}

export function groupCitiesByContinent(cities: CityItem[]): Array<[string, CityItem[]]> {
  const groups = new Map<string, CityItem[]>();
  for (const city of cities) {
    const group = groups.get(city.continentName);
    if (group) {
      group.push(city);
    } else {
      groups.set(city.continentName, [city]);
    }
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export function getFlyToCameraOptions(population: number): { targetHeight: number; durationSec: number } {
  if (population >= 10_000_000) return { targetHeight: 420_000, durationSec: 1.0 };
  if (population >= 5_000_000) return { targetHeight: 320_000, durationSec: 1.0 };
  if (population >= 1_000_000) return { targetHeight: 220_000, durationSec: 1.1 };
  if (population >= 300_000) return { targetHeight: 150_000, durationSec: 1.2 };
  if (population >= 80_000) return { targetHeight: 95_000, durationSec: 1.2 };
  return { targetHeight: 70_000, durationSec: 1.2 };
}

export function isValidCoordinatePair(latText: string, lngText: string): { valid: boolean; lat: number; lng: number } {
  const lat = Number.parseFloat(latText.trim());
  const lng = Number.parseFloat(lngText.trim());
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return { valid, lat, lng };
}
