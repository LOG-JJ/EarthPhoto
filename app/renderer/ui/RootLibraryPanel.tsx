import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RootListItem } from '@shared/types/ipc';

interface RootLibraryPanelProps {
  roots: RootListItem[];
  activeRootIds: number[];
  onAddRoot: () => void;
  onToggleActive: (rootId: number, active: boolean) => void;
  onRemoveRoot: (rootId: number) => void;
}

function formatTimestamp(value: number | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

export function RootLibraryPanel({
  roots,
  activeRootIds,
  onAddRoot,
  onToggleActive,
  onRemoveRoot,
}: RootLibraryPanelProps) {
  const { t } = useTranslation();
  const sortedRoots = useMemo(() => [...roots].sort((a, b) => b.updatedAtMs - a.updatedAtMs), [roots]);
  const activeSet = useMemo(() => new Set(activeRootIds), [activeRootIds]);

  return (
    <section className="panel">
      <div className="root-library-header">
        <h3>{t('roots.title')}</h3>
        <button type="button" onClick={onAddRoot}>{t('roots.add')}</button>
      </div>
      {sortedRoots.length === 0 ? (
        <p className="status-text">{t('roots.empty')}</p>
      ) : (
        <ul className="root-library-list">
          {sortedRoots.map((root) => (
            <li key={root.id} className="root-library-item">
              <label className="checkbox root-library-toggle">
                <input
                  type="checkbox"
                  checked={activeSet.has(root.id)}
                  onChange={(event) => onToggleActive(root.id, event.target.checked)}
                />
                {t('roots.active')}
              </label>
              <p className="root-library-path">{root.path}</p>
              <p className="root-library-meta">
                {t('roots.lastScan')}: {formatTimestamp(root.lastScanAtMs)}
              </p>
              <button
                type="button"
                className="root-remove-btn"
                onClick={() => onRemoveRoot(root.id)}
              >
                {t('roots.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="status-text">{t('roots.removeHint')}</p>
    </section>
  );
}
