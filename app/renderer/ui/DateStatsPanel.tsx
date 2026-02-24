import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DateMediaCountItem } from '@shared/types/ipc';

interface DateStatsPanelProps {
  rows: DateMediaCountItem[];
  loading: boolean;
}

function formatDateLabel(dateText: string): string {
  const parsed = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateText;
  }
  return parsed.toLocaleDateString();
}

export function DateStatsPanel({ rows, loading }: DateStatsPanelProps) {
  const { t } = useTranslation();

  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          photo: acc.photo + row.photoCount,
          video: acc.video + row.videoCount,
          total: acc.total + row.totalCount,
        }),
        { photo: 0, video: 0, total: 0 },
      ),
    [rows],
  );

  return (
    <section className="panel calendar-panel">
      <h3>{t('calendar.title')}</h3>
      {loading ? <p className="status-text">{t('calendar.loading')}</p> : null}
      {!loading && rows.length === 0 ? <p className="empty-state">{t('calendar.empty')}</p> : null}
      {rows.length > 0 ? (
        <>
          <p className="status-text">
            {t('calendar.summary', {
              days: rows.length.toLocaleString(),
              photos: summary.photo.toLocaleString(),
              videos: summary.video.toLocaleString(),
              total: summary.total.toLocaleString(),
            })}
          </p>
          <div className="calendar-list" role="table" aria-label={t('calendar.title')}>
            <div className="calendar-list-head" role="row">
              <span>{t('calendar.date')}</span>
              <span>{t('calendar.photos')}</span>
              <span>{t('calendar.videos')}</span>
              <span>{t('calendar.total')}</span>
            </div>
            {rows.map((row) => (
              <div key={row.date} className="calendar-list-row" role="row">
                <span>{formatDateLabel(row.date)}</span>
                <span>{row.photoCount.toLocaleString()}</span>
                <span>{row.videoCount.toLocaleString()}</span>
                <span>{row.totalCount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
