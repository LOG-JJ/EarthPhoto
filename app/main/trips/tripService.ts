import QuickLRU from 'quick-lru';

import type { PhotosRepository } from '@main/db/repositories/photosRepo';
import type { TripPoint, TripSegment } from '@shared/types/ipc';
import type { Filters } from '@shared/types/settings';

interface GetTripsPayload {
  filters: Filters;
  splitHours?: number;
  splitKm?: number;
  maxPoints?: number;
}

interface MutableSegment {
  points: TripPoint[];
}

interface SampledSegment {
  sampledPoints: TripPoint[];
  fullPoints: TripPoint[];
}

const EARTH_RADIUS_KM = 6371;
const DEFAULT_SPLIT_HOURS = 24;
const DEFAULT_SPLIT_KM = 150;
const DEFAULT_MAX_POINTS = 50_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(a: TripPoint, b: TripPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function calculateDistanceKm(points: TripPoint[]): number {
  let distanceKm = 0;
  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    distanceKm += haversineKm(points[pointIndex - 1], points[pointIndex]);
  }
  return distanceKm;
}

function summarizeSegment(segment: SampledSegment, colorIndex: number, index: number): TripSegment {
  const { sampledPoints, fullPoints } = segment;
  const distanceKm = calculateDistanceKm(fullPoints);
  const startAtMs = fullPoints[0]?.takenAtMs ?? 0;
  const endAtMs = fullPoints[fullPoints.length - 1]?.takenAtMs ?? startAtMs;
  return {
    tripId: `trip-${index + 1}-${startAtMs}`,
    colorIndex,
    startAtMs,
    endAtMs,
    distanceKm,
    durationMs: Math.max(0, endAtMs - startAtMs),
    pointCount: fullPoints.length,
    points: sampledPoints,
  };
}

function sampleSegmentPoints(points: TripPoint[], targetCount: number): TripPoint[] {
  if (points.length <= targetCount || targetCount >= points.length) {
    return points;
  }
  if (targetCount <= 2) {
    return [points[0], points[points.length - 1]];
  }

  const step = (points.length - 1) / (targetCount - 1);
  const sampled: TripPoint[] = [];
  const picked = new Set<number>();
  for (let index = 0; index < targetCount; index += 1) {
    const pointIndex = Math.round(index * step);
    if (!picked.has(pointIndex)) {
      sampled.push(points[pointIndex]);
      picked.add(pointIndex);
    }
  }
  if (sampled[0] !== points[0]) {
    sampled[0] = points[0];
  }
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled[sampled.length - 1] = points[points.length - 1];
  }
  return sampled;
}

function getFilterKey(filters: Filters, splitHours: number, splitKm: number, maxPoints: number): string {
  return JSON.stringify({
    dateFromMs: filters.dateFromMs ?? null,
    dateToMs: filters.dateToMs ?? null,
    includeUndated: filters.includeUndated ?? false,
    rootIds: [...(filters.rootIds ?? [])].sort((a, b) => a - b),
    mediaTypes: [...(filters.mediaTypes ?? [])].sort(),
    hasGps: filters.hasGps ?? null,
    cameraModelQuery: filters.cameraModelQuery ?? null,
    minWidthPx: filters.minWidthPx ?? null,
    minHeightPx: filters.minHeightPx ?? null,
    durationFromMs: filters.durationFromMs ?? null,
    durationToMs: filters.durationToMs ?? null,
    splitHours,
    splitKm,
    maxPoints,
  });
}

export class TripService {
  private readonly cache = new QuickLRU<string, TripSegment[]>({ maxSize: 24 });

  constructor(private readonly photosRepo: PhotosRepository) {}

  invalidate(): void {
    this.cache.clear();
  }

  getTrips(payload: GetTripsPayload): TripSegment[] {
    const splitHours = Number.isFinite(payload.splitHours) && payload.splitHours && payload.splitHours > 0
      ? payload.splitHours
      : DEFAULT_SPLIT_HOURS;
    const splitKm = Number.isFinite(payload.splitKm) && payload.splitKm && payload.splitKm > 0
      ? payload.splitKm
      : DEFAULT_SPLIT_KM;
    const maxPoints = Number.isFinite(payload.maxPoints) && payload.maxPoints && payload.maxPoints > 0
      ? Math.max(1_000, Math.min(200_000, Math.trunc(payload.maxPoints)))
      : DEFAULT_MAX_POINTS;

    const cacheKey = getFilterKey(payload.filters, splitHours, splitKm, maxPoints);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const points = this.photosRepo.getTripPoints(payload.filters);
    if (points.length === 0) {
      this.cache.set(cacheKey, []);
      return [];
    }

    const splitMs = splitHours * 3_600_000;
    const segments: MutableSegment[] = [];
    let current: MutableSegment = { points: [points[0]] };

    for (let index = 1; index < points.length; index += 1) {
      const prev = current.points[current.points.length - 1];
      const next = points[index];
      const timeGapMs = next.takenAtMs - prev.takenAtMs;
      const distanceKm = haversineKm(prev, next);

      if (timeGapMs > splitMs || distanceKm > splitKm) {
        segments.push(current);
        current = { points: [next] };
      } else {
        current.points.push(next);
      }
    }
    if (current.points.length > 0) {
      segments.push(current);
    }

    const totalPoints = segments.reduce((sum, segment) => sum + segment.points.length, 0);
    let sampledSegments: SampledSegment[] = segments.map((segment) => ({
      sampledPoints: segment.points,
      fullPoints: segment.points,
    }));
    if (totalPoints > maxPoints) {
      const targets = segments.map((segment) =>
        Math.max(2, Math.round((segment.points.length / totalPoints) * maxPoints)),
      );
      let targetTotal = targets.reduce((sum, value) => sum + value, 0);
      while (targetTotal > maxPoints) {
        let maxIndex = -1;
        let maxValue = -1;
        for (let index = 0; index < targets.length; index += 1) {
          if (targets[index] > 2 && targets[index] > maxValue) {
            maxValue = targets[index];
            maxIndex = index;
          }
        }
        if (maxIndex === -1) {
          break;
        }
        targets[maxIndex] -= 1;
        targetTotal -= 1;
      }

      sampledSegments = segments.map((segment, index) => ({
        sampledPoints: sampleSegmentPoints(segment.points, Math.min(segment.points.length, targets[index])),
        fullPoints: segment.points,
      }));
    }

    const result = sampledSegments.map((segment, index) => summarizeSegment(segment, index, index));
    this.cache.set(cacheKey, result);
    return result;
  }
}
