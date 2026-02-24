import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { PreviewListItem, PreviewState } from '@renderer/domain/preview/previewModels';

interface PreviewListProps {
  previews: PreviewListItem[];
  currentPreview: PreviewState | null;
  onSelectPreview?: (photoId: number) => void;
}

const PREVIEW_GRID_COLUMNS = 4;
const PREVIEW_ROW_HEIGHT = 66;
const PREVIEW_OVERSCAN_ROWS = 2;
const PREVIEW_LIST_FALLBACK_HEIGHT = PREVIEW_ROW_HEIGHT * 2;
const FIRST_READY_TARGET = 8;

function toFileUrl(filePath: string): string {
  return `photoglobe://thumb?path=${encodeURIComponent(filePath)}`;
}

export function PreviewList({ previews, currentPreview, onSelectPreview }: PreviewListProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(PREVIEW_LIST_FALLBACK_HEIGHT);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    const syncViewportHeight = () => {
      const next = node.clientHeight || PREVIEW_LIST_FALLBACK_HEIGHT;
      setViewportHeight(next);
    };
    syncViewportHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(syncViewportHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    const rowCount = Math.ceil(previews.length / PREVIEW_GRID_COLUMNS);
    const maxScrollTop = Math.max(0, rowCount * PREVIEW_ROW_HEIGHT - node.clientHeight);
    if (node.scrollTop > maxScrollTop) {
      node.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
    }
  }, [previews.length]);

  const virtualRows = useMemo(() => {
    const rowCount = Math.ceil(previews.length / PREVIEW_GRID_COLUMNS);
    if (rowCount === 0) {
      return {
        visibleRows: [] as Array<{ rowIndex: number; items: PreviewListItem[] }>,
        totalHeight: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }

    const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / PREVIEW_ROW_HEIGHT));
    const startRow = Math.max(0, Math.floor(scrollTop / PREVIEW_ROW_HEIGHT) - PREVIEW_OVERSCAN_ROWS);
    const endRow = Math.min(rowCount, startRow + visibleRowCount + PREVIEW_OVERSCAN_ROWS * 2);
    const visibleRows: Array<{ rowIndex: number; items: PreviewListItem[] }> = [];
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
      const startIndex = rowIndex * PREVIEW_GRID_COLUMNS;
      visibleRows.push({
        rowIndex,
        items: previews.slice(startIndex, startIndex + PREVIEW_GRID_COLUMNS),
      });
    }

    const totalHeight = rowCount * PREVIEW_ROW_HEIGHT;
    const topSpacerHeight = startRow * PREVIEW_ROW_HEIGHT;
    const bottomSpacerHeight = Math.max(0, totalHeight - endRow * PREVIEW_ROW_HEIGHT);
    return {
      visibleRows,
      totalHeight,
      topSpacerHeight,
      bottomSpacerHeight,
    };
  }, [previews, scrollTop, viewportHeight]);

  const resolvedCount = useMemo(
    () => previews.reduce((acc, item) => (item.stripStatus === 'skeleton' ? acc : acc + 1), 0),
    [previews],
  );
  const hasPendingItems = previews.some((item) => item.stripStatus === 'skeleton');
  const showStripLoading = hasPendingItems && resolvedCount < Math.min(FIRST_READY_TARGET, previews.length);

  if (!previews || previews.length <= 1) {
    return null;
  }

  return (
    <div className="preview-list-block">
      <p className="preview-list-title">
        {t('preview.title')} {previews.length}
      </p>
      {showStripLoading ? <p className="preview-list-loading">{t('preview.stripLoading')}</p> : null}
      <div
        className="preview-list-scroll"
        ref={listRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="preview-list-canvas" style={{ height: virtualRows.totalHeight }}>
          <div style={{ height: virtualRows.topSpacerHeight }} />
          {virtualRows.visibleRows.map((row) => (
            <div key={row.rowIndex} className="preview-list-row">
              {row.items.map((item) => {
                const src = item.thumbPath ? toFileUrl(item.thumbPath) : null;
                const selected = currentPreview?.photoId === item.photoId;
                const isSkeleton = item.stripStatus === 'skeleton' && !src;
                return (
                  <button
                    key={item.photoId}
                    type="button"
                    className={`preview-list-item${selected ? ' is-selected' : ''}${isSkeleton ? ' is-skeleton' : ''}`}
                    onClick={() => {
                      if (onSelectPreview) onSelectPreview(item.photoId);
                    }}
                  >
                    {src ? (
                      <img src={src} alt={`preview-list-${item.photoId}`} loading="lazy" decoding="async" />
                    ) : isSkeleton ? (
                      <span className="preview-list-skeleton" aria-hidden="true" />
                    ) : (
                      <span className="preview-list-fallback">{item.mediaType.toUpperCase()}</span>
                    )}
                  </button>
                );
              })}
              {row.items.length < PREVIEW_GRID_COLUMNS
                ? Array.from({ length: PREVIEW_GRID_COLUMNS - row.items.length }).map((_, fillIndex) => (
                    <span key={`empty-${row.rowIndex}-${fillIndex}`} className="preview-list-item-empty" aria-hidden="true" />
                  ))
                : null}
            </div>
          ))}
          <div style={{ height: virtualRows.bottomSpacerHeight }} />
        </div>
      </div>
    </div>
  );
}
