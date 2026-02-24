import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TripSegment } from '@shared/types/ipc';

interface TripCardsPanelProps {
  visible: boolean;
  segments: TripSegment[];
  highlightedTripId: string | null;
  onSelectTrip: (trip: TripSegment) => void;
  onOpenRepresentative: (trip: TripSegment) => void;
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function TripCardsPanel({
  visible,
  segments,
  highlightedTripId,
  onSelectTrip,
  onOpenRepresentative,
}: TripCardsPanelProps) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => [...segments].sort((a, b) => b.startAtMs - a.startAtMs).slice(0, 20),
    [segments],
  );

  if (!visible || sorted.length === 0) {
    return null;
  }

  return (
    <aside className="trip-cards-panel">
      <h4>{t('tripCards.title')}</h4>
      <div className="trip-cards-list">
        {sorted.map((trip) => (
          <div
            key={trip.tripId}
            role="button"
            tabIndex={0}
            className={`trip-card${trip.tripId === highlightedTripId ? ' is-active' : ''}`}
            onClick={() => onSelectTrip(trip)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectTrip(trip);
              }
            }}
          >
            <p className="trip-card-title">{formatDateTime(trip.startAtMs)}</p>
            <p className="trip-card-meta">
              {t('tripCards.stats', {
                points: trip.pointCount,
                distanceKm: trip.distanceKm.toFixed(1),
              })}
            </p>
            {trip.points.length < trip.pointCount ? (
              <p className="trip-card-meta">
                {t('tripCards.sampled', {
                  shown: trip.points.length,
                  total: trip.pointCount,
                })}
              </p>
            ) : null}
            <div className="trip-card-actions">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenRepresentative(trip);
                }}
              >
                {t('tripCards.openRepresentative')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
