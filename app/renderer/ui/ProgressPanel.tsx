import { useTranslation } from 'react-i18next';

import type { IndexStatus } from '@shared/types/ipc';

interface ProgressPanelProps {
  status: IndexStatus | null;
}

export function ProgressPanel({ status }: ProgressPanelProps) {
  const { t } = useTranslation();

  if (!status) {
    return (
      <section className="panel">
        <h3>{t('progress.title')}</h3>
        <p>-</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h3>{t('progress.title')}</h3>
      <div className="progress-bar">
        <div style={{ width: `${status.percent}%` }} />
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
    </section>
  );
}
