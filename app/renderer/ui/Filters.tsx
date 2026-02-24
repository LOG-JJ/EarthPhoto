import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RootListItem } from '@shared/types/ipc';

import type { FilterDraft } from '@renderer/domain/filter/filterDraft';

interface FiltersProps {
  value: FilterDraft;
  roots: RootListItem[];
  onChange: (next: FilterDraft) => void;
}

export function Filters({ value, roots, onChange }: FiltersProps) {
  const { t } = useTranslation();
  const sortedRoots = useMemo(
    () => [...roots].sort((a, b) => b.updatedAtMs - a.updatedAtMs),
    [roots],
  );

  const durationFilterActive = value.durationFromSec.trim().length > 0 || value.durationToSec.trim().length > 0;

  useEffect(() => {
    const validRootIds = new Set(sortedRoots.map((root) => root.id));
    const pruned = value.rootIds.filter((id) => validRootIds.has(id));
    if (pruned.length !== value.rootIds.length) {
      onChange({ ...value, rootIds: pruned });
    }
  }, [onChange, sortedRoots, value]);

  useEffect(() => {
    if (!durationFilterActive || !value.includePhoto) {
      return;
    }
    onChange({
      ...value,
      includePhoto: false,
      includeVideo: true,
    });
  }, [durationFilterActive, onChange, value]);

  const toggleRootId = (rootId: number, checked: boolean) => {
    const next = checked ? [...value.rootIds, rootId] : value.rootIds.filter((id) => id !== rootId);
    const deduped = Array.from(new Set(next)).sort((a, b) => a - b);
    onChange({
      ...value,
      rootIds: deduped,
    });
  };

  const handleDurationChange = (field: 'durationFromSec' | 'durationToSec', nextValue: string) => {
    const nextDraft: FilterDraft = {
      ...value,
      [field]: nextValue,
    };
    const nextDurationActive =
      (field === 'durationFromSec' ? nextValue : value.durationFromSec).trim().length > 0 ||
      (field === 'durationToSec' ? nextValue : value.durationToSec).trim().length > 0;

    if (nextDurationActive) {
      nextDraft.includePhoto = false;
      nextDraft.includeVideo = true;
    }
    onChange(nextDraft);
  };

  return (
    <section className="panel">
      <h3>{t('filters.title')}</h3>

      <div className="filter-root-block">
        <p className="filter-section-title">{t('filters.roots')}</p>
        {sortedRoots.length === 0 ? (
          <p className="status-text">{t('filters.noRoots')}</p>
        ) : (
          <div className="filter-root-list">
            {sortedRoots.map((root) => {
              const checked = value.rootIds.includes(root.id);
              return (
                <label key={root.id} className="checkbox filter-root-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggleRootId(root.id, event.target.checked)}
                  />
                  <span className="filter-root-text">{root.path}</span>
                </label>
              );
            })}
          </div>
        )}
        <p className="status-text">{t('filters.rootHint')}</p>
      </div>

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
          disabled={durationFilterActive}
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

      {durationFilterActive ? <p className="status-text">{t('filters.durationVideoOnly')}</p> : null}

      <label className="checkbox">
        <input
          type="checkbox"
          checked={value.hasGps}
          onChange={(event) => onChange({ ...value, hasGps: event.target.checked })}
        />
        {t('filters.hasGps')}
      </label>

      <label>
        {t('filters.cameraModel')}
        <input
          type="text"
          value={value.cameraModelQuery}
          onChange={(event) => onChange({ ...value, cameraModelQuery: event.target.value })}
          placeholder={t('filters.cameraModelPlaceholder')}
        />
      </label>

      <label>
        {t('filters.minWidthPx')}
        <input
          type="number"
          min={1}
          step={1}
          value={value.minWidthPx}
          onChange={(event) => onChange({ ...value, minWidthPx: event.target.value })}
          placeholder="1920"
        />
      </label>

      <label>
        {t('filters.minHeightPx')}
        <input
          type="number"
          min={1}
          step={1}
          value={value.minHeightPx}
          onChange={(event) => onChange({ ...value, minHeightPx: event.target.value })}
          placeholder="1080"
        />
      </label>

      <label>
        {t('filters.durationFromSec')}
        <input
          type="number"
          min={0}
          step={0.1}
          value={value.durationFromSec}
          onChange={(event) => handleDurationChange('durationFromSec', event.target.value)}
          placeholder="5"
        />
      </label>

      <label>
        {t('filters.durationToSec')}
        <input
          type="number"
          min={0}
          step={0.1}
          value={value.durationToSec}
          onChange={(event) => handleDurationChange('durationToSec', event.target.value)}
          placeholder="120"
        />
      </label>
    </section>
  );
}
