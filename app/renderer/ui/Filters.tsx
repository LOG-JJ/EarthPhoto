import { useTranslation } from 'react-i18next';

export interface FilterDraft {
  dateFrom: string;
  dateTo: string;
  includePhoto: boolean;
  includeVideo: boolean;
  hasGps: boolean;
}

interface FiltersProps {
  value: FilterDraft;
  onChange: (next: FilterDraft) => void;
}

export function Filters({ value, onChange }: FiltersProps) {
  const { t } = useTranslation();

  return (
    <section className="panel">
      <h3>{t('filters.title')}</h3>

      <label>
        {t('filters.dateFrom')}
        <input
          type="date"
          value={value.dateFrom}
          onChange={(event) => onChange({ ...value, dateFrom: event.target.value })}
        />
      </label>

      <label>
        {t('filters.dateTo')}
        <input
          type="date"
          value={value.dateTo}
          onChange={(event) => onChange({ ...value, dateTo: event.target.value })}
        />
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.includePhoto}
          onChange={(event) => onChange({ ...value, includePhoto: event.target.checked })}
        />
        {t('filters.photo')}
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.includeVideo}
          onChange={(event) => onChange({ ...value, includeVideo: event.target.checked })}
        />
        {t('filters.video')}
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.hasGps}
          onChange={(event) => onChange({ ...value, hasGps: event.target.checked })}
        />
        {t('filters.hasGps')}
      </label>
    </section>
  );
}
