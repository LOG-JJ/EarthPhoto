export type BBox = [number, number, number, number];

const MIN_LAT = -85;
const MAX_LAT = 85;
const MIN_LNG = -180;
const MAX_LNG = 180;

export function clampLat(lat: number): number {
  return Math.max(MIN_LAT, Math.min(MAX_LAT, lat));
}

export function clampLng(lng: number): number {
  return Math.max(MIN_LNG, Math.min(MAX_LNG, lng));
}

export function normalizeBbox(bbox: BBox): BBox {
  const [west, south, east, north] = bbox;
  return [clampLng(west), clampLat(south), clampLng(east), clampLat(north)];
}

export function isInBbox(lat: number, lng: number, bbox: BBox): boolean {
  const [west, south, east, north] = bbox;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

