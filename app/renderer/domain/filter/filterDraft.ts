import type { Filters } from '@shared/types/settings';

export interface FilterDraft {
  dateFrom: string;
  dateTo: string;
  rootIds: number[];
  includePhoto: boolean;
  includeVideo: boolean;
  hasGps: boolean;
  cameraModelQuery: string;
  minWidthPx: string;
  minHeightPx: string;
  durationFromSec: string;
  durationToSec: string;
  includeUndated: boolean;
}

export const DEFAULT_FILTER_DRAFT: FilterDraft = {
  dateFrom: '',
  dateTo: '',
  rootIds: [],
  includePhoto: true,
  includeVideo: true,
  hasGps: true,
  cameraModelQuery: '',
  minWidthPx: '',
  minHeightPx: '',
  durationFromSec: '',
  durationToSec: '',
  includeUndated: false,
};

export function toEpochMs(dateText: string, endOfDay = false): number | null {
  if (!dateText) return null;
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const value = new Date(`${dateText}${suffix}`).getTime();
  return Number.isNaN(value) ? null : value;
}

function parseNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}

function parsePositiveInt(input: string): number | null {
  const value = parseNumber(input);
  if (value === null) {
    return null;
  }
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function toDurationMs(input: string): number | null {
  const seconds = parseNumber(input);
  if (seconds === null || seconds < 0) {
    return null;
  }
  return Math.round(seconds * 1000);
}

export function toFilters(draft: FilterDraft): Filters {
  const rootIds = Array.from(
    new Set(draft.rootIds.filter((id) => Number.isInteger(id) && id > 0)),
  ).sort((a, b) => a - b);

  const cameraModelQuery = draft.cameraModelQuery.trim();
  const minWidthPx = parsePositiveInt(draft.minWidthPx);
  const minHeightPx = parsePositiveInt(draft.minHeightPx);
  const durationFromCandidate = toDurationMs(draft.durationFromSec);
  const durationToCandidate = toDurationMs(draft.durationToSec);

  let durationFromMs = durationFromCandidate;
  let durationToMs = durationToCandidate;
  if (typeof durationFromMs === 'number' && typeof durationToMs === 'number' && durationFromMs > durationToMs) {
    const swappedFrom = durationToMs;
    durationToMs = durationFromMs;
    durationFromMs = swappedFrom;
  }

  const hasDurationFilter = typeof durationFromMs === 'number' || typeof durationToMs === 'number';
  const mediaTypes: Array<'photo' | 'video'> = [];
  if (hasDurationFilter) {
    mediaTypes.push('video');
  } else {
    if (draft.includePhoto) mediaTypes.push('photo');
    if (draft.includeVideo) mediaTypes.push('video');
  }

  const dateFromStartMs = toEpochMs(draft.dateFrom, false);
  const dateFromEndMs = toEpochMs(draft.dateFrom, true);
  const dateToStartMs = toEpochMs(draft.dateTo, false);
  const dateToEndMs = toEpochMs(draft.dateTo, true);
  let dateFromMs = dateFromStartMs;
  let dateToMs = dateToEndMs;
  if (
    typeof dateFromStartMs === 'number' &&
    typeof dateToEndMs === 'number' &&
    dateFromStartMs > dateToEndMs
  ) {
    dateFromMs = dateToStartMs;
    dateToMs = dateFromEndMs;
  }

  return {
    hasGps: draft.hasGps,
    rootIds: rootIds.length > 0 ? rootIds : undefined,
    mediaTypes,
    dateFromMs: dateFromMs ?? undefined,
    dateToMs: dateToMs ?? undefined,
    cameraModelQuery: cameraModelQuery.length > 0 ? cameraModelQuery : undefined,
    minWidthPx: minWidthPx ?? undefined,
    minHeightPx: minHeightPx ?? undefined,
    durationFromMs: durationFromMs ?? undefined,
    durationToMs: durationToMs ?? undefined,
    includeUndated: draft.includeUndated,
  };
}
