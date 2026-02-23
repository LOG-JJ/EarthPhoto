import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { ClusterNode, PointNode } from '@shared/types/cluster';
import type { CityItem, IndexStatus } from '@shared/types/ipc';
import { DEFAULT_SETTINGS, type AppSettings, type Filters } from '@shared/types/settings';

import i18n from './i18n';
import { GlobeView, type GlobeViewState } from './globe/GlobeView';
import { useGlobeData } from './globe/useGlobeData';
import { CityPanel } from './ui/CityPanel';
import { Filters as FiltersPanel, type FilterDraft } from './ui/Filters';
import { PreviewPanel } from './ui/PreviewPanel';
import { ProgressPanel } from './ui/ProgressPanel';
import { Sidebar } from './ui/Sidebar';

const DEFAULT_FILTERS: FilterDraft = {
  dateFrom: '',
  dateTo: '',
  includePhoto: true,
  includeVideo: true,
  hasGps: true,
};
const MAX_PREVIEW_CLUSTER_COUNT = 100;

function toEpochMs(dateText: string, endOfDay = false): number | null {
  if (!dateText) {
    return null;
  }
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const value = new Date(`${dateText}${suffix}`).getTime();
  return Number.isNaN(value) ? null : value;
}

function isPlaceholderThumbPath(filePath: string | null | undefined): boolean {
  if (!filePath) {
    return false;
  }
  return /[\\/]placeholder[\\/]/i.test(filePath);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

export function App() {
  type PreviewState = {
    photoId: number;
    mediaType: 'photo' | 'video';
    thumbPath: string;
  };
  type PreviewListItem = {
    photoId: number;
    mediaType: 'photo' | 'video';
    thumbPath: string | null;
  };

  const { t } = useTranslation();
  const [apiReady, setApiReady] = useState<boolean>(typeof window.photoGlobe !== 'undefined');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [filtersDraft, setFiltersDraft] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewItems, setPreviewItems] = useState<PreviewListItem[]>([]);
  /* State for the tabbed control panel */
  const [activeTab, setActiveTab] = useState<'filters' | 'preview' | 'system' | 'cities'>('filters');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [targetLatInput, setTargetLatInput] = useState('');
  const [targetLngInput, setTargetLngInput] = useState('');
  const [coordInputError, setCoordInputError] = useState(false);
  const [flyToRequest, setFlyToRequest] = useState<{
    lat: number;
    lng: number;
    seq: number;
    targetHeight?: number;
    durationSec?: number;
  } | null>(null);

  const previewRequestRef = useRef(0);
  const previewGroupRequestRef = useRef(0);
  const previewUpgradeTimerRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoveredPointIdRef = useRef<number | null>(null);
  const thumbCacheRef = useRef<Map<number, string>>(new Map());
  const prefetchedThumbsRef = useRef<Set<number>>(new Set());
  const flyToSeqRef = useRef(0);

  const filters = useMemo<Filters>(() => {
    const mediaTypes: Array<'photo' | 'video'> = [];
    if (filtersDraft.includePhoto) {
      mediaTypes.push('photo');
    }
    if (filtersDraft.includeVideo) {
      mediaTypes.push('video');
    }

    return {
      hasGps: filtersDraft.hasGps,
      mediaTypes,
      dateFromMs: toEpochMs(filtersDraft.dateFrom, false),
      dateToMs: toEpochMs(filtersDraft.dateTo, true),
    };
  }, [filtersDraft]);

  const { items, isLoading, refresh, viewState } = useGlobeData(filters, apiReady);

  useEffect(() => {
    if (apiReady) {
      return;
    }

    let retryCount = 0;
    const timer = window.setInterval(() => {
      if (typeof window.photoGlobe !== 'undefined') {
        setApiReady(true);
        window.clearInterval(timer);
        return;
      }
      retryCount += 1;
      if (retryCount >= 20) {
        window.location.reload();
      }
    }, 500);

    return () => {
      window.clearInterval(timer);
    };
  }, [apiReady]);

  useEffect(() => {
    if (!apiReady) {
      return;
    }
    const unsubscribe = window.photoGlobe.index.onProgress((progress) => {
      setIndexStatus(progress);
      if (progress.phase === 'complete') {
        refresh();
      }
    });
    return unsubscribe;
  }, [apiReady, refresh]);

  useEffect(() => {
    if (!apiReady) {
      return;
    }
    void (async () => {
      const saved = await window.photoGlobe.settings.get();
      const windowState = await window.photoGlobe.app.getWindowState();
      setIsFullscreen(windowState.isFullScreen);
      setSettings(saved);
      setRootPath(saved.recentRoots[0] ?? null);
      await i18n.changeLanguage(saved.language);
    })();
  }, [apiReady]);

  useEffect(() => {
    if (!apiReady) {
      return;
    }
    const syncWindowState = () => {
      window.setTimeout(() => {
        void window.photoGlobe.app.getWindowState().then((state) => {
          setIsFullscreen(state.isFullScreen);
        });
      }, 70);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F11' || event.key === 'Escape' || (event.altKey && event.key === 'Enter')) {
        syncWindowState();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [apiReady]);

  const handleSelectFolder = useCallback(async () => {
    const result = await window.photoGlobe.app.selectFolder();
    if (!result.path) {
      return;
    }
    setRootPath(result.path);
    const nextRecentRoots = [result.path, ...settings.recentRoots.filter((item) => item !== result.path)].slice(0, 10);
    const next = await window.photoGlobe.settings.set({ recentRoots: nextRecentRoots });
    setSettings(next);
  }, [settings.recentRoots]);

  const handleStartIndexing = useCallback(async () => {
    if (!rootPath) {
      return;
    }
    await window.photoGlobe.index.start({ rootPath });
  }, [rootPath]);

  const handleLanguageChange = useCallback(async (language: AppSettings['language']) => {
    const next = await window.photoGlobe.settings.set({ language });
    setSettings(next);
    await i18n.changeLanguage(language);
  }, []);

  const handleWatchChange = useCallback(async (enabled: boolean) => {
    const next = await window.photoGlobe.settings.set({ watchEnabled: enabled });
    setSettings(next);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const next = await window.photoGlobe.app.toggleFullscreen();
    setIsFullscreen(next.isFullScreen);
  }, []);

  const flyToCoordinates = useCallback((lat: number, lng: number, options?: { targetHeight?: number; durationSec?: number }) => {
    setCoordInputError(false);
    flyToSeqRef.current += 1;
    setFlyToRequest({
      lat,
      lng,
      seq: flyToSeqRef.current,
      targetHeight: options?.targetHeight,
      durationSec: options?.durationSec,
    });
  }, []);

  const handleMoveToCoordinates = useCallback(() => {
    const lat = Number.parseFloat(targetLatInput.trim());
    const lng = Number.parseFloat(targetLngInput.trim());
    const isValid =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    if (!isValid) {
      setCoordInputError(true);
      return;
    }

    flyToCoordinates(lat, lng);
  }, [flyToCoordinates, targetLatInput, targetLngInput]);

  const handleFlyToFromCity = useCallback(
    (city: CityItem) => {
      setTargetLatInput(String(city.lat));
      setTargetLngInput(String(city.lng));

      const population = Math.max(0, city.population ?? 0);
      const targetHeight =
        population >= 10_000_000
          ? 420_000
          : population >= 5_000_000
            ? 320_000
            : population >= 1_000_000
              ? 220_000
              : population >= 300_000
                ? 150_000
                : population >= 80_000
                  ? 95_000
                  : 70_000;
      const durationSec =
        population >= 5_000_000
          ? 1.0
          : population >= 1_000_000
            ? 1.1
            : 1.2;

      flyToCoordinates(city.lat, city.lng, { targetHeight, durationSec });
    },
    [flyToCoordinates],
  );

  const handleFavoriteCityIdsChange = useCallback(async (favoriteCityIds: string[]) => {
    const next = await window.photoGlobe.settings.set({ favoriteCityIds });
    setSettings(next);
  }, []);

  const handleCoordInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      handleMoveToCoordinates();
    },
    [handleMoveToCoordinates],
  );

  const handleViewChange = useCallback(
    (nextView: GlobeViewState) => {
      refresh(nextView);
    },
    [refresh],
  );

  const loadPreview = useCallback(
    async (
      photoId: number,
      mediaType: 'photo' | 'video',
      initialThumbPath?: string | null,
    ) => {
      if (previewUpgradeTimerRef.current !== null) {
        window.clearTimeout(previewUpgradeTimerRef.current);
        previewUpgradeTimerRef.current = null;
      }

      const requestId = previewRequestRef.current + 1;
      previewRequestRef.current = requestId;

      const cachedThumbPath = initialThumbPath ?? thumbCacheRef.current.get(photoId) ?? null;

      const setPreviewState = (thumbPath: string) => {
        setPreview({
          photoId,
          mediaType,
          thumbPath,
        });
      };

      if (cachedThumbPath) {
        setPreviewState(cachedThumbPath);
      } else {
        setPreview(null);
      }
      setPreviewLoading(true);

      try {
        const quick = await withTimeout(
          window.photoGlobe.media.getThumbnail({ photoId, size: 64, priority: 'high' }),
          6_000,
          'Thumbnail quick request timed out',
        );
        if (previewRequestRef.current !== requestId) {
          return;
        }

        if (!isPlaceholderThumbPath(quick.path)) {
          thumbCacheRef.current.set(photoId, quick.path);
        }
        setPreviewState(quick.path);
        setPreviewLoading(false);

        void window.photoGlobe.media.getThumbnail({ photoId, size: 128, priority: 'normal' }).then((mid) => {
          if (previewRequestRef.current !== requestId) {
            return;
          }
          if (!isPlaceholderThumbPath(mid.path)) {
            thumbCacheRef.current.set(photoId, mid.path);
          }
          setPreview((current) => {
            if (!current || current.photoId !== photoId) {
              return current;
            }
            if (isPlaceholderThumbPath(mid.path) && !isPlaceholderThumbPath(current.thumbPath)) {
              return current;
            }
            return {
              ...current,
              thumbPath: mid.path,
            };
          });
        });

        const finalSize = 512;
        const finalPriority = mediaType === 'video' ? 'high' : 'normal';
        const finalDelayMs = mediaType === 'video' ? 120 : 220;
        previewUpgradeTimerRef.current = window.setTimeout(() => {
          void window.photoGlobe.media
            .getThumbnail({ photoId, size: finalSize, priority: finalPriority })
            .then((full) => {
              if (previewRequestRef.current !== requestId) {
                return;
              }
              if (full.path === quick.path) {
                return;
              }
              if (!isPlaceholderThumbPath(full.path)) {
                thumbCacheRef.current.set(photoId, full.path);
              }
              setPreview((current) => {
                if (!current || current.photoId !== photoId) {
                  return current;
                }
                if (isPlaceholderThumbPath(full.path) && !isPlaceholderThumbPath(current.thumbPath)) {
                  return current;
                }
                return {
                  ...current,
                  thumbPath: full.path,
                };
              });
            });
        }, finalDelayMs);
      } catch (error) {
        if (previewRequestRef.current === requestId) {
          setPreviewLoading(false);
        }
        console.error('Failed to load thumbnail', error);
      }
    },
    [],
  );

  const hydratePreviewGroup = useCallback(async (members: Array<{ photoId: number; mediaType: 'photo' | 'video' }>) => {
    const requestId = previewGroupRequestRef.current + 1;
    previewGroupRequestRef.current = requestId;

    const deduped = Array.from(
      new Map(
        members.map((item) => [item.photoId, item] as const),
      ).values(),
    );

    const initial = deduped.map((item) => ({
      photoId: item.photoId,
      mediaType: item.mediaType,
      thumbPath: thumbCacheRef.current.get(item.photoId) ?? null,
    }));
    setPreviewItems(initial);

    const pending = deduped.filter((item) => !thumbCacheRef.current.has(item.photoId));
    const concurrency = 8;
    for (let index = 0; index < pending.length; index += concurrency) {
      const batch = pending.slice(index, index + concurrency);
      await Promise.all(
        batch.map(async (item) => {
          try {
            const thumb = await window.photoGlobe.media.getThumbnail({
              photoId: item.photoId,
              size: 64,
              priority: 'high',
            });
            if (previewGroupRequestRef.current !== requestId) {
              return;
            }
            if (!isPlaceholderThumbPath(thumb.path)) {
              thumbCacheRef.current.set(item.photoId, thumb.path);
            }
            setPreviewItems((current) =>
              current.map((entry) =>
                entry.photoId === item.photoId
                  ? {
                      ...entry,
                      thumbPath: thumb.path,
                    }
                  : entry,
              ),
            );
          } catch {
            // Ignore individual thumbnail failure and keep list rendering.
          }
        }),
      );
      if (previewGroupRequestRef.current !== requestId) {
        return;
      }
    }
  }, []);

  const handlePreviewItemSelect = useCallback(
    async (photoId: number) => {
      const picked = previewItems.find((item) => item.photoId === photoId);
      if (!picked) {
        return;
      }
      await loadPreview(
        picked.photoId,
        picked.mediaType,
        thumbCacheRef.current.get(picked.photoId) ?? picked.thumbPath ?? null,
      );
    },
    [loadPreview, previewItems],
  );

  const handleOpenPreview = useCallback(async (photoId: number) => {
    try {
      const result = await window.photoGlobe.media.openSource({ photoId });
      if (!result.ok) {
        console.error('Failed to open source file', result.error);
      }
    } catch (error) {
      console.error('Failed to open source file', error);
    }
  }, []);

  const handlePointClick = useCallback(
    async (point: PointNode) => {
      try {
        hoveredPointIdRef.current = null;
        const pointItems = items.filter((item): item is PointNode => item.type === 'point');
        const grouped =
          point.groupKey && point.groupKey.length > 0
            ? pointItems.filter((item) => item.groupKey === point.groupKey)
            : [point];
        const members =
          grouped.length > 0
            ? grouped.map((item) => ({ photoId: item.photoId, mediaType: item.mediaType }))
            : [{ photoId: point.photoId, mediaType: point.mediaType }];

        void hydratePreviewGroup(members);
        await loadPreview(point.photoId, point.mediaType, thumbCacheRef.current.get(point.photoId) ?? null);
        
        // Auto-switch to preview tab
        setActiveTab('preview');
        // Ensure panel is open
        if (!isSidebarOpen) {
          setIsSidebarOpen(true);
        }
      } catch (error) {
        console.error('Failed to load point thumbnail', error);
      }
    },
    [hydratePreviewGroup, isSidebarOpen, items, loadPreview],
  );

  const handleClusterClick = useCallback(
    async (cluster: ClusterNode) => {
      try {
        if (cluster.count > MAX_PREVIEW_CLUSTER_COUNT) {
          // In zoomed-out dense regions, avoid preview IO and keep click action as zoom-only.
          previewGroupRequestRef.current += 1;
          setPreviewItems([]);
          setPreviewLoading(false);
          return;
        }

        const targetCount = Math.max(1, Math.min(MAX_PREVIEW_CLUSTER_COUNT, cluster.count));
        const selectedPoints = await window.photoGlobe.geo.getClusterMembers({
          clusterId: cluster.id,
          limit: targetCount,
          filters,
        });

        if (selectedPoints.length === 0 && cluster.representativePhotoId && cluster.representativeMediaType) {
          hoveredPointIdRef.current = null;
          previewGroupRequestRef.current += 1;
          setPreviewItems([
            {
              photoId: cluster.representativePhotoId,
              mediaType: cluster.representativeMediaType,
              thumbPath: thumbCacheRef.current.get(cluster.representativePhotoId) ?? null,
            },
          ]);
          await loadPreview(
            cluster.representativePhotoId,
            cluster.representativeMediaType,
            thumbCacheRef.current.get(cluster.representativePhotoId) ?? null,
          );
          setActiveTab('preview');
          if (!isSidebarOpen) {
            setIsSidebarOpen(true);
          }
          return;
        }

        hoveredPointIdRef.current = null;
        void hydratePreviewGroup(selectedPoints.map((item) => ({ photoId: item.photoId, mediaType: item.mediaType })));

        const primary =
          (cluster.representativePhotoId
            ? selectedPoints.find((item) => item.photoId === cluster.representativePhotoId)
            : null) ?? selectedPoints[0];
        if (!primary) {
          return;
        }

        await loadPreview(primary.photoId, primary.mediaType, thumbCacheRef.current.get(primary.photoId) ?? null);
        
        // Auto-switch
        setActiveTab('preview');
        if (!isSidebarOpen) setIsSidebarOpen(true);
      } catch (error) {
        console.error('Failed to load cluster preview', error);
      }
    },
    [filters, hydratePreviewGroup, isSidebarOpen, loadPreview],
  );

  const handlePointHover = useCallback((point: PointNode | null) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    if (!point) {
      hoveredPointIdRef.current = null;
      return;
    }

    if (hoveredPointIdRef.current === point.photoId) {
      return;
    }

    hoveredPointIdRef.current = point.photoId;
    hoverTimerRef.current = window.setTimeout(() => {
      if (prefetchedThumbsRef.current.has(point.photoId)) {
        return;
      }
      prefetchedThumbsRef.current.add(point.photoId);
      void window.photoGlobe.media
        .getThumbnail({ photoId: point.photoId, size: 64, priority: 'normal' })
        .then((thumb) => {
          if (!isPlaceholderThumbPath(thumb.path)) {
            thumbCacheRef.current.set(point.photoId, thumb.path);
          }
        })
        .catch(() => {
          prefetchedThumbsRef.current.delete(point.photoId);
        });
    }, 85);
  }, []);

  useEffect(() => {
    if (!apiReady || isLoading || previewLoading || viewState.zoom < 7) {
      return;
    }

    const candidates = items.filter((item): item is PointNode => item.type === 'point').slice(0, 64);
    const photoCandidates = candidates.slice(0, 44);

    if (photoCandidates.length === 0) {
      return;
    }

    const photoIdsToPrefetch = photoCandidates
      .map((point) => point.photoId)
      .filter((photoId) => !prefetchedThumbsRef.current.has(photoId));

    for (const photoId of photoIdsToPrefetch) {
      prefetchedThumbsRef.current.add(photoId);
    }

    const timer = window.setTimeout(() => {
      if (photoIdsToPrefetch.length > 0) {
        void window.photoGlobe.media
          .prefetchThumbnails({
            photoIds: photoIdsToPrefetch,
            size: 64,
            priority: 'low',
          })
          .catch(() => {
            for (const photoId of photoIdsToPrefetch) {
              prefetchedThumbsRef.current.delete(photoId);
            }
          });
      }
    }, 160);

    return () => {
      window.clearTimeout(timer);
    };
  }, [apiReady, isLoading, items, previewLoading, viewState.zoom]);

  useEffect(
    () => () => {
      previewGroupRequestRef.current += 1;
      if (previewUpgradeTimerRef.current !== null) {
        window.clearTimeout(previewUpgradeTimerRef.current);
      }
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    },
    [],
  );

  if (!apiReady) {
    return (
      <div className="bootstrap-fallback">
        <h2>Initializing...</h2>
        <p>Preparing renderer API. The app will retry automatically.</p>
      </div>
    );
  }

  const phaseText = indexStatus ? `${t('progress.phase')}: ${indexStatus.phase} (${indexStatus.percent}%)` : t('topbar.idle');

  return (
    <div className="app-shell">
      <main className="globe-area">
        {isLoading ? <div className="loading-banner">{t('topbar.loading')}</div> : null}
        <GlobeView
          items={items}
          onClusterClick={handleClusterClick}
          onPointClick={handlePointClick}
          onPointHover={handlePointHover}
          onViewChange={handleViewChange}
          flyToRequest={flyToRequest}
        />
      </main>

      <Sidebar
        collapsed={!isSidebarOpen}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        rootPath={rootPath}
        phaseText={phaseText}
        watchEnabled={settings.watchEnabled}
        language={settings.language}
        onToggleCollapsed={() => setIsSidebarOpen((current) => !current)}
        onWatchEnabledChange={handleWatchChange}
        onLanguageChange={handleLanguageChange}
        
        filtersSlot={<FiltersPanel value={filtersDraft} onChange={setFiltersDraft} />}
        previewSlot={
          <PreviewPanel
            preview={preview}
            previews={previewItems}
            isLoading={previewLoading}
            onSelectPreview={handlePreviewItemSelect}
            onOpenPreview={handleOpenPreview}
          />
        }
        systemSlot={
          <div className="system-actions">
            <ProgressPanel status={indexStatus} />
            <div className="action-buttons-grid">
              <button type="button" onClick={handleSelectFolder}>{t('sidebar.selectFolder')}</button>
              <button type="button" onClick={handleStartIndexing} disabled={!rootPath}>{t('sidebar.startIndexing')}</button>
              <button type="button" onClick={handleToggleFullscreen}>
                {isFullscreen ? t('topbar.exitFullscreen') : t('topbar.enterFullscreen')}
              </button>
            </div>
            <section className="panel">
              <h3>{t('system.gotoTitle')}</h3>
              <div className="coord-grid">
                <label>
                  {t('system.latitude')}
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="37.5665"
                    value={targetLatInput}
                    onChange={(event) => setTargetLatInput(event.target.value)}
                    onKeyDown={handleCoordInputKeyDown}
                  />
                </label>
                <label>
                  {t('system.longitude')}
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="126.9780"
                    value={targetLngInput}
                    onChange={(event) => setTargetLngInput(event.target.value)}
                    onKeyDown={handleCoordInputKeyDown}
                  />
                </label>
              </div>
              <button type="button" onClick={handleMoveToCoordinates}>
                {t('system.gotoAction')}
              </button>
              {coordInputError ? (
                <p className="status-text status-text-error">
                  {t('system.gotoInvalid')}
                </p>
              ) : null}
            </section>
            {flyToRequest ? (
              <p className="status-text">
                {t('system.gotoLast')}: {flyToRequest.lat.toFixed(5)}, {flyToRequest.lng.toFixed(5)}
              </p>
            ) : null}
          </div>
        }
        citiesSlot={
          <CityPanel
            active={activeTab === 'cities'}
            userFavoriteCityIds={settings.favoriteCityIds}
            onChangeFavoriteCityIds={handleFavoriteCityIdsChange}
            onFlyTo={handleFlyToFromCity}
          />
        }
      />
    </div>
  );
}

