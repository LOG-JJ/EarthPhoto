import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TimelineExtentInfo, TripSegment } from '@shared/types/ipc';

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

interface TimelineBarProps {
  extent: TimelineExtentInfo | null;
  fromMs: number | null;
  toMs: number | null;
  includeUndated: boolean;
  playing: boolean;
  windowDays: number;
  showTrips: boolean;
  storyEnabled?: boolean;
  tripSegments?: TripSegment[];
  highlightedTripId?: string | null;
  currentTrip?: TripSegment | null;
  onRangeChange: (fromMs: number, toMs: number) => void;
  onPlayToggle: (playing: boolean) => void;
  onWindowDaysChange: (days: number) => void;
  onIncludeUndatedChange: (value: boolean) => void;
  onShowTripsChange: (value: boolean) => void;
  onTripMarkerSelect?: (tripId: string) => void;
}

export function TimelineBar({
  extent,
  fromMs,
  toMs,
  includeUndated,
  playing,
  windowDays,
  showTrips,
  storyEnabled = false,
  tripSegments = [],
  highlightedTripId = null,
  currentTrip = null,
  onRangeChange,
  onPlayToggle,
  onWindowDaysChange,
  onIncludeUndatedChange,
  onShowTripsChange,
  onTripMarkerSelect,
}: TimelineBarProps) {
  const { t } = useTranslation();

  const timelineRange = useMemo(() => {
    if (extent?.minMs == null || extent?.maxMs == null) {
      return null;
    }
    const minDayMs = startOfDay(extent.minMs);
    const maxDayMs = startOfDay(extent.maxMs);
    const totalDays = Math.max(1, Math.round((maxDayMs - minDayMs) / DAY_MS));
    return { minDayMs, maxDayMs, totalDays };
  }, [extent?.maxMs, extent?.minMs]);

  const markerItems = useMemo(() => {
    if (!storyEnabled || !timelineRange || tripSegments.length === 0) {
      return [];
    }
    return tripSegments.map((trip) => {
      const tripDayMs = startOfDay(trip.startAtMs);
      const index = Math.max(
        0,
        Math.min(
          timelineRange.totalDays,
          Math.round((tripDayMs - timelineRange.minDayMs) / DAY_MS),
        ),
      );
      const percent = timelineRange.totalDays === 0 ? 0 : (index / timelineRange.totalDays) * 100;
      return {
        tripId: trip.tripId,
        percent,
      };
    });
  }, [storyEnabled, timelineRange, tripSegments]);

  if (!timelineRange) {
    return (
      <section className="timeline-bar">
        <div className="timeline-empty-state">
          <strong>{t('timeline.title')}</strong>
          <p className="status-text">{t('timeline.empty')}</p>
        </div>
      </section>
    );
  }

  const fromValueMs = fromMs ?? timelineRange.minDayMs;
  const toValueMs = toMs ?? timelineRange.maxDayMs;
  const fromIndex = Math.max(0, Math.min(timelineRange.totalDays, Math.round((startOfDay(fromValueMs) - timelineRange.minDayMs) / DAY_MS)));
  const toIndex = Math.max(0, Math.min(timelineRange.totalDays, Math.round((startOfDay(toValueMs) - timelineRange.minDayMs) / DAY_MS)));

  const applyFromIndex = (nextFromIndex: number) => {
    const bounded = Math.max(0, Math.min(nextFromIndex, toIndex));
    const nextFromMs = timelineRange.minDayMs + bounded * DAY_MS;
    const nextToMs = timelineRange.minDayMs + toIndex * DAY_MS + (DAY_MS - 1);
    onRangeChange(nextFromMs, nextToMs);
  };

  const applyToIndex = (nextToIndex: number) => {
    const bounded = Math.max(fromIndex, Math.min(nextToIndex, timelineRange.totalDays));
    const nextFromMs = timelineRange.minDayMs + fromIndex * DAY_MS;
    const nextToMs = timelineRange.minDayMs + bounded * DAY_MS + (DAY_MS - 1);
    onRangeChange(nextFromMs, nextToMs);
  };

  const datedCount = extent?.datedCount ?? 0;
  const undatedCount = extent?.undatedCount ?? 0;

  return (
    <section className="timeline-bar">
      <div className="timeline-row">
        <strong>{t('timeline.title')}</strong>
        <div className="timeline-actions">
          <button
            type="button"
            onClick={() => onPlayToggle(!playing)}
            aria-label={playing ? t('timeline.pause') : t('timeline.play')}
          >
            {playing ? t('timeline.pause') : t('timeline.play')}
          </button>
          <label className="timeline-small">
            {t('timeline.windowDays')}
            <input
              type="number"
              min={1}
              max={60}
              value={windowDays}
              onChange={(event) => onWindowDaysChange(Number.parseInt(event.target.value || '7', 10))}
              aria-label={t('timeline.windowDays')}
            />
          </label>
          <label className="checkbox timeline-check">
            <input
              type="checkbox"
              checked={includeUndated}
              onChange={(event) => onIncludeUndatedChange(event.target.checked)}
              aria-label={t('timeline.includeUndated')}
            />
            {t('timeline.includeUndated')}
          </label>
          <label className="checkbox timeline-check">
            <input
              type="checkbox"
              checked={showTrips}
              onChange={(event) => onShowTripsChange(event.target.checked)}
              aria-label={t('timeline.showTrips')}
            />
            {t('timeline.showTrips')}
          </label>
        </div>
      </div>
      <div className="timeline-label-row">
        <span>{formatDate(timelineRange.minDayMs + fromIndex * DAY_MS)}</span>
        <span>{formatDate(timelineRange.minDayMs + toIndex * DAY_MS)}</span>
      </div>
      <div className="timeline-slider-row">
        <input
          type="range"
          min={0}
          max={timelineRange.totalDays}
          value={fromIndex}
          onChange={(event) => applyFromIndex(Number.parseInt(event.target.value, 10))}
          aria-label={t('timeline.rangeStart')}
        />
        <input
          type="range"
          min={0}
          max={timelineRange.totalDays}
          value={toIndex}
          onChange={(event) => applyToIndex(Number.parseInt(event.target.value, 10))}
          aria-label={t('timeline.rangeEnd')}
        />
      </div>
      {storyEnabled && markerItems.length > 0 ? (
        <div className="timeline-marker-row">
          {markerItems.map((marker) => (
            <button
              key={marker.tripId}
              type="button"
              className={`timeline-marker${highlightedTripId === marker.tripId ? ' is-active' : ''}`}
              style={{ left: `${marker.percent}%` }}
              onClick={() => onTripMarkerSelect?.(marker.tripId)}
              aria-label={t('timeline.tripMarkerLabel')}
            />
          ))}
        </div>
      ) : null}
      {storyEnabled && currentTrip ? (
        <div className="timeline-trip-card">
          <p className="timeline-trip-card-title">{t('timeline.activeTrip')}</p>
          <p className="timeline-trip-card-meta">
            {formatDate(currentTrip.startAtMs)} ~ {formatDate(currentTrip.endAtMs)}
          </p>
          <p className="timeline-trip-card-meta">
            {t('timeline.tripStats', {
              points: currentTrip.pointCount,
              distanceKm: currentTrip.distanceKm.toFixed(1),
            })}
          </p>
        </div>
      ) : null}
      <p className="timeline-meta">
        {t('timeline.counts', {
          dated: datedCount,
          undated: undatedCount,
        })}
      </p>
    </section>
  );
}
