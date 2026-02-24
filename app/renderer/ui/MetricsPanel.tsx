import { useTranslation } from 'react-i18next';

import type { SessionMetricsSummary } from '@shared/types/ipc';

interface MetricsPanelProps {
  summary: SessionMetricsSummary | null;
  recent: SessionMetricsSummary[];
  exportPath: string;
  loading?: boolean;
  onRefresh: () => void;
  onExport: () => void;
  onReset: () => void;
}

function formatElapsed(ms: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    return '-';
  }
  if (ms < 1_000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1_000).toFixed(1)}s`;
}

export function MetricsPanel({
  summary,
  recent,
  exportPath,
  loading = false,
  onRefresh,
  onExport,
  onReset,
}: MetricsPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="panel metrics-panel">
      <h3>{t('metrics.title')}</h3>
      <div className="metrics-actions">
        <button type="button" onClick={onRefresh} disabled={loading}>
          {t('metrics.refresh')}
        </button>
        <button type="button" onClick={onExport} disabled={loading}>
          {t('metrics.export')}
        </button>
        <button type="button" onClick={onReset} disabled={loading}>
          {t('metrics.reset')}
        </button>
      </div>

      {summary ? (
        <div className="metrics-summary">
          <p className="status-text">
            {t('metrics.currentSession')}: {summary.sessionId.slice(0, 8)}... ({t('metrics.events')}: {summary.eventCount})
          </p>
          <ul className="metrics-funnel">
            {summary.funnel.map((step) => (
              <li key={step.step} className={step.reached ? 'is-reached' : ''}>
                <span>{t(`metrics.step.${step.step}`)}</span>
                <small>{step.reached ? formatElapsed(step.elapsedFromStartMs) : '-'}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="status-text">{t('metrics.empty')}</p>
      )}

      {recent.length > 0 ? (
        <div className="metrics-recent">
          <p className="status-text">{t('metrics.recent')}</p>
          <ul>
            {recent.slice(0, 5).map((item) => (
              <li key={item.sessionId}>
                {new Date(item.startedAtMs).toLocaleString()} - {item.eventCount}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {exportPath ? <p className="status-text">{t('metrics.exported')}: {exportPath}</p> : null}
    </section>
  );
}
