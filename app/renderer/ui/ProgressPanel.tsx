import { useTranslation } from 'react-i18next';

import type { IndexStatus } from '@shared/types/ipc';

import type { IndexJobHistoryItem } from '@renderer/store/types';

interface ProgressPanelProps {
  status: IndexStatus | null;
  history?: IndexJobHistoryItem[];
  canCancel?: boolean;
  canRetry?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
}

function formatTimestamp(value: number | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

export function ProgressPanel({
  status,
  history = [],
  canCancel = false,
  canRetry = false,
  onCancel,
  onRetry,
}: ProgressPanelProps) {
  const { t } = useTranslation();

  if (!status) {
    return (
      <section className="panel">
        <h3>{t('progress.title')}</h3>
        <p>-</p>
        <div className="progress-action-row">
          <button type="button" onClick={onCancel} disabled={!canCancel}>{t('progress.cancel')}</button>
          <button type="button" onClick={onRetry} disabled={!canRetry}>{t('progress.retry')}</button>
        </div>
        {history.length > 0 ? (
          <div className="progress-history-block">
            <h4>{t('progress.recentJobs')}</h4>
            <ul className="progress-history-list">
              {history.map((item) => (
                <li key={item.jobId}>
                  <strong>{item.phase}</strong> ({item.percent}%)
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="panel">
      <h3>{t('progress.title')}</h3>
      <div className="progress-bar">
        <div style={{ width: `${status.percent}%` }} />
      </div>
      <div className="progress-action-row">
        <button type="button" onClick={onCancel} disabled={!canCancel}>{t('progress.cancel')}</button>
        <button type="button" onClick={onRetry} disabled={!canRetry}>{t('progress.retry')}</button>
      </div>
      <dl className="kv-grid">
        <dt>{t('progress.phase')}</dt>
        <dd>{status.phase}</dd>
        <dt>{t('progress.scanned')}</dt>
        <dd>{status.scanned}</dd>
        <dt>{t('progress.queued')}</dt>
        <dd>{status.queued}</dd>
        <dt>{t('progress.processed')}</dt>
        <dd>{status.processed}</dd>
        <dt>{t('progress.indexed')}</dt>
        <dd>{status.indexed}</dd>
        <dt>{t('progress.skipped')}</dt>
        <dd>{status.skipped}</dd>
        <dt>{t('progress.errored')}</dt>
        <dd>{status.errored}</dd>
      </dl>
      {history.length > 0 ? (
        <div className="progress-history-block">
          <h4>{t('progress.recentJobs')}</h4>
          <ul className="progress-history-list">
            {history.map((item) => (
              <li key={item.jobId}>
                <p className="progress-history-phase">
                  {item.phase} ({item.percent}%)
                </p>
                <p className="progress-history-root">{item.rootPath}</p>
                <p className="progress-history-meta">
                  {t('progress.indexed')}: {item.indexed} / {t('progress.skipped')}: {item.skipped} / {t('progress.errored')}:{' '}
                  {item.errored}
                </p>
                <p className="progress-history-meta">
                  {t('progress.finishedAt')}: {formatTimestamp(item.finishedAtMs)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
