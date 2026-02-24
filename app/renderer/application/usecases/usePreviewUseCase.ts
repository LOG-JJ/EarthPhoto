import { useCallback, useEffect, useRef } from 'react';

import type { ClusterItem, ClusterNode, PointNode } from '@shared/types/cluster';
import type { Filters } from '@shared/types/settings';

import { dedupePreviewMembers, type MediaType, type PreviewMember } from '@renderer/domain/preview/previewModels';
import type { PhotoGlobeGateway } from '@renderer/infrastructure/photoGlobeGateway';
import { windowPhotoGlobeGateway } from '@renderer/infrastructure/windowPhotoGlobeGateway';
import { useAppStore } from '@renderer/store/useAppStore';
import { trackUxEvent } from '@renderer/application/metrics/uxMetrics';

const MAX_PREVIEW_CLUSTER_COUNT = 100;
const PREVIEW_STRIP_INITIAL_VISIBLE_COUNT = 16;

function isPlaceholderThumbPath(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  return /[\\/]placeholder[\\/]/i.test(filePath);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

interface UsePreviewUseCaseParams {
  items: ClusterItem[];
  filters: Filters;
  apiReady: boolean;
  isGlobeLoading: boolean;
  viewZoom: number;
  gateway?: PhotoGlobeGateway;
}

export function usePreviewUseCase({
  items,
  filters,
  apiReady,
  isGlobeLoading,
  viewZoom,
  gateway = windowPhotoGlobeGateway,
}: UsePreviewUseCaseParams) {
  const previewLoading = useAppStore((state) => state.previewLoading);
  const setPreviewLoading = useAppStore((state) => state.setPreviewLoading);
  const preview = useAppStore((state) => state.preview);
  const setPreview = useAppStore((state) => state.setPreview);
  const previewItems = useAppStore((state) => state.previewItems);
  const setPreviewItems = useAppStore((state) => state.setPreviewItems);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
  const setIsSidebarOpen = useAppStore((state) => state.setIsSidebarOpen);
  const setHoverPreview = useAppStore((state) => state.setHoverPreview);
  const setHoverPreviewLoading = useAppStore((state) => state.setHoverPreviewLoading);

  const previewRequestRef = useRef(0);
  const previewStripRequestSeqRef = useRef(0);
  const activePreviewStripRequestIdRef = useRef<string | null>(null);
  const previewUpgradeTimerRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoverPreviewRequestRef = useRef(0);
  const hoveredPointIdRef = useRef<number | null>(null);
  const thumbCacheRef = useRef<Map<number, string>>(new Map());
  const prefetchedThumbsRef = useRef<Set<number>>(new Set());

  const showPreviewTab = useCallback(() => {
    setActiveTab('preview');
    if (!isSidebarOpen) setIsSidebarOpen(true);
  }, [isSidebarOpen, setActiveTab, setIsSidebarOpen]);

  const cancelActivePreviewStrip = useCallback(() => {
    const activeRequestId = activePreviewStripRequestIdRef.current;
    if (!activeRequestId) {
      return;
    }
    activePreviewStripRequestIdRef.current = null;
    void gateway.mediaCancelPreviewStrip({ requestId: activeRequestId }).catch(() => {});
  }, [gateway]);

  const loadPreview = useCallback(
    async (photoId: number, mediaType: MediaType, initialThumbPath?: string | null) => {
      if (previewUpgradeTimerRef.current !== null) {
        window.clearTimeout(previewUpgradeTimerRef.current);
        previewUpgradeTimerRef.current = null;
      }
      const requestId = previewRequestRef.current + 1;
      previewRequestRef.current = requestId;
      const cachedThumbPath = initialThumbPath ?? thumbCacheRef.current.get(photoId) ?? null;

      const setPreviewState = (thumbPath: string) => setPreview({ photoId, mediaType, thumbPath });

      if (cachedThumbPath) {
        setPreviewState(cachedThumbPath);
      } else {
        setPreview(null);
      }
      setPreviewLoading(true);

      try {
        const quick = await withTimeout(
          gateway.mediaGetThumbnail({ photoId, size: 64, priority: 'high' }),
          6000,
          'Thumbnail quick request timed out',
        );
        if (previewRequestRef.current !== requestId) return;

        if (!isPlaceholderThumbPath(quick.path)) {
          thumbCacheRef.current.set(photoId, quick.path);
        }
        setPreviewState(quick.path);
        setPreviewLoading(false);

        const finalSize = 256;
        const finalPriority = 'normal';
        const finalDelayMs = mediaType === 'video' ? 120 : 220;
        previewUpgradeTimerRef.current = window.setTimeout(() => {
          void gateway.mediaGetThumbnail({ photoId, size: finalSize, priority: finalPriority }).then((full) => {
            if (previewRequestRef.current !== requestId) return;
            if (full.path === quick.path) return;
            if (!isPlaceholderThumbPath(full.path)) thumbCacheRef.current.set(photoId, full.path);
            setPreview((current) => {
              if (!current || current.photoId !== photoId) return current;
              if (isPlaceholderThumbPath(full.path) && !isPlaceholderThumbPath(current.thumbPath)) return current;
              return { ...current, thumbPath: full.path };
            });
          });
        }, finalDelayMs);
      } catch (error) {
        if (previewRequestRef.current === requestId) setPreviewLoading(false);
        console.error('Failed to load thumbnail', error);
      }
    },
    [gateway, setPreview, setPreviewLoading],
  );

  const hydratePreviewGroup = useCallback(
    async (members: PreviewMember[]) => {
      cancelActivePreviewStrip();

      const deduped = dedupePreviewMembers(members);
      const initial = deduped.map((item) => ({
        photoId: item.photoId,
        mediaType: item.mediaType,
        thumbPath: thumbCacheRef.current.get(item.photoId) ?? null,
        stripStatus: thumbCacheRef.current.has(item.photoId) ? ('ready' as const) : ('skeleton' as const),
      }));
      setPreviewItems(initial);

      const pendingPhotoIds = initial.filter((item) => item.thumbPath == null).map((item) => item.photoId);
      if (pendingPhotoIds.length === 0) {
        return;
      }

      const requestId = `preview-strip-${Date.now()}-${previewStripRequestSeqRef.current + 1}`;
      previewStripRequestSeqRef.current += 1;
      activePreviewStripRequestIdRef.current = requestId;

      try {
        const result = await gateway.mediaRequestPreviewStrip({
          requestId,
          photoIds: pendingPhotoIds,
          size: 64,
          visibleCount: PREVIEW_STRIP_INITIAL_VISIBLE_COUNT,
          burst: 'aggressive',
        });
        if (!result.ok && activePreviewStripRequestIdRef.current === requestId) {
          activePreviewStripRequestIdRef.current = null;
          setPreviewItems((current) =>
            current.map((item) => (item.stripStatus === 'skeleton' ? { ...item, stripStatus: 'error' } : item)),
          );
        }
      } catch {
        if (activePreviewStripRequestIdRef.current === requestId) {
          activePreviewStripRequestIdRef.current = null;
          setPreviewItems((current) =>
            current.map((item) => (item.stripStatus === 'skeleton' ? { ...item, stripStatus: 'error' } : item)),
          );
        }
      }
    },
    [cancelActivePreviewStrip, gateway, setPreviewItems],
  );

  useEffect(
    () =>
      gateway.mediaOnPreviewStripProgress((progress) => {
        const activeRequestId = activePreviewStripRequestIdRef.current;
        if (!activeRequestId || progress.requestId !== activeRequestId) {
          return;
        }

        if (progress.status === 'cancelled' || progress.status === 'complete') {
          if (activePreviewStripRequestIdRef.current === progress.requestId) {
            activePreviewStripRequestIdRef.current = null;
          }
          return;
        }

        if (progress.status === 'ready' && progress.path && !isPlaceholderThumbPath(progress.path)) {
          thumbCacheRef.current.set(progress.photoId, progress.path);
        }

        setPreviewItems((current) =>
          current.map((item) => {
            if (item.photoId !== progress.photoId) {
              return item;
            }
            if (progress.status === 'ready') {
              return {
                ...item,
                thumbPath: progress.path ?? item.thumbPath,
                stripStatus: 'ready',
              };
            }
            return {
              ...item,
              stripStatus: 'error',
            };
          }),
        );
      }),
    [gateway, setPreviewItems],
  );

  const handlePreviewItemSelect = useCallback(
    async (photoId: number) => {
      const picked = previewItems.find((item) => item.photoId === photoId);
      if (!picked) return;
      await loadPreview(
        picked.photoId,
        picked.mediaType,
        thumbCacheRef.current.get(picked.photoId) ?? picked.thumbPath ?? null,
      );
    },
    [loadPreview, previewItems],
  );

  const handleOpenPreview = useCallback(
    async (photoId: number) => {
      try {
        const result = await gateway.mediaOpenSource({ photoId });
        if (!result.ok) {
          console.error('Failed to open source file', result.error);
          return;
        }
        void trackUxEvent(gateway, 'source_opened', { photoId });
      } catch (error) {
        console.error('Failed to open source file', error);
      }
    },
    [gateway],
  );

  const handlePointClick = useCallback(
    async (point: PointNode) => {
      try {
        hoveredPointIdRef.current = null;
        const pointItems = items.filter((item): item is PointNode => item.type === 'point');
        const grouped = point.groupKey && point.groupKey.length > 0
          ? pointItems.filter((item) => item.groupKey === point.groupKey)
          : [point];
        const members = grouped.length > 0
          ? grouped.map((item) => ({ photoId: item.photoId, mediaType: item.mediaType }))
          : [{ photoId: point.photoId, mediaType: point.mediaType }];

        void hydratePreviewGroup(members);
        await loadPreview(point.photoId, point.mediaType, thumbCacheRef.current.get(point.photoId) ?? null);
        void trackUxEvent(gateway, 'point_or_cluster_clicked', {
          kind: 'point',
          photoId: point.photoId,
          mediaType: point.mediaType,
        });
        showPreviewTab();
      } catch (error) {
        console.error('Failed to load point thumbnail', error);
      }
    },
    [gateway, hydratePreviewGroup, items, loadPreview, showPreviewTab],
  );

  const handleClusterClick = useCallback(
    async (cluster: ClusterNode) => {
      try {
        if (cluster.count > MAX_PREVIEW_CLUSTER_COUNT) {
          cancelActivePreviewStrip();
          setPreviewItems([]);
          setPreviewLoading(false);
          return;
        }
        const targetCount = Math.max(1, Math.min(MAX_PREVIEW_CLUSTER_COUNT, cluster.count));
        const selectedPoints = await gateway.geoGetClusterMembers({ clusterId: cluster.id, limit: targetCount, filters });

        if (selectedPoints.length === 0 && cluster.representativePhotoId && cluster.representativeMediaType) {
          hoveredPointIdRef.current = null;
          cancelActivePreviewStrip();
          const representativeThumbPath = thumbCacheRef.current.get(cluster.representativePhotoId) ?? null;
          setPreviewItems([
            {
              photoId: cluster.representativePhotoId,
              mediaType: cluster.representativeMediaType,
              thumbPath: representativeThumbPath,
              stripStatus: representativeThumbPath ? 'ready' : 'skeleton',
            },
          ]);
          await loadPreview(
            cluster.representativePhotoId,
            cluster.representativeMediaType,
            thumbCacheRef.current.get(cluster.representativePhotoId) ?? null,
          );
          showPreviewTab();
          return;
        }

        hoveredPointIdRef.current = null;
        void hydratePreviewGroup(selectedPoints.map((item) => ({ photoId: item.photoId, mediaType: item.mediaType })));

        const primary =
          (cluster.representativePhotoId
            ? selectedPoints.find((item) => item.photoId === cluster.representativePhotoId)
            : null) ?? selectedPoints[0];
        if (!primary) return;

        await loadPreview(primary.photoId, primary.mediaType, thumbCacheRef.current.get(primary.photoId) ?? null);
        void trackUxEvent(gateway, 'point_or_cluster_clicked', {
          kind: 'cluster',
          clusterId: cluster.id,
          count: cluster.count,
          representativePhotoId: primary.photoId,
        });
        showPreviewTab();
      } catch (error) {
        console.error('Failed to load cluster preview', error);
      }
    },
    [cancelActivePreviewStrip, filters, gateway, hydratePreviewGroup, loadPreview, setPreviewItems, setPreviewLoading, showPreviewTab],
  );

  const handlePointHover = useCallback(
    (point: PointNode | null) => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (!point) {
        hoveredPointIdRef.current = null;
        hoverPreviewRequestRef.current += 1;
        setHoverPreview(null);
        setHoverPreviewLoading(false);
        return;
      }
      if (hoveredPointIdRef.current === point.photoId) return;

      hoveredPointIdRef.current = point.photoId;
      hoverTimerRef.current = window.setTimeout(() => {
        const requestId = hoverPreviewRequestRef.current + 1;
        hoverPreviewRequestRef.current = requestId;
        setHoverPreviewLoading(true);

        void gateway
          .mediaGetHoverPreview({ photoId: point.photoId, width: 320 })
          .then((info) => {
            if (hoverPreviewRequestRef.current !== requestId) {
              return;
            }
            setHoverPreview({
              photoId: point.photoId,
              path: info.path,
              cacheHit: info.cacheHit,
              kind: info.kind,
            });
            setHoverPreviewLoading(false);
          })
          .catch(() => {
            if (hoverPreviewRequestRef.current !== requestId) {
              return;
            }
            setHoverPreview(null);
            setHoverPreviewLoading(false);
          });

        if (prefetchedThumbsRef.current.has(point.photoId)) return;
        prefetchedThumbsRef.current.add(point.photoId);
        void gateway
          .mediaGetThumbnail({ photoId: point.photoId, size: 64, priority: 'normal' })
          .then((thumb) => {
            if (!isPlaceholderThumbPath(thumb.path)) thumbCacheRef.current.set(point.photoId, thumb.path);
          })
          .catch(() => prefetchedThumbsRef.current.delete(point.photoId));
      }, 120);
    },
    [gateway, setHoverPreview, setHoverPreviewLoading],
  );

  useEffect(() => {
    if (!apiReady || isGlobeLoading || previewLoading || viewZoom < 7) return;

    const candidates = items.filter((item): item is PointNode => item.type === 'point').slice(0, 64);
    const photoCandidates = candidates.slice(0, 44);
    if (photoCandidates.length === 0) return;

    const photoIdsToPrefetch = photoCandidates
      .map((point) => point.photoId)
      .filter((photoId) => !prefetchedThumbsRef.current.has(photoId));
    for (const photoId of photoIdsToPrefetch) prefetchedThumbsRef.current.add(photoId);

    const timer = window.setTimeout(() => {
      if (photoIdsToPrefetch.length > 0) {
        void gateway
          .mediaPrefetchThumbnails({ photoIds: photoIdsToPrefetch, size: 64, priority: 'low' })
          .catch(() => {
            for (const photoId of photoIdsToPrefetch) prefetchedThumbsRef.current.delete(photoId);
          });
      }
    }, 160);

    return () => window.clearTimeout(timer);
  }, [apiReady, gateway, isGlobeLoading, items, previewLoading, viewZoom]);

  useEffect(
    () => () => {
      cancelActivePreviewStrip();
      if (previewUpgradeTimerRef.current !== null) window.clearTimeout(previewUpgradeTimerRef.current);
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
      hoverPreviewRequestRef.current += 1;
      setHoverPreviewLoading(false);
      setHoverPreview(null);
    },
    [cancelActivePreviewStrip, setHoverPreview, setHoverPreviewLoading],
  );

  return {
    previewLoading,
    preview,
    previewItems,
    handlePreviewItemSelect,
    handleOpenPreview,
    handlePointClick,
    handleClusterClick,
    handlePointHover,
  };
}
