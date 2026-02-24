import debounce from 'lodash.debounce';
import QuickLRU from 'quick-lru';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ClusterItem } from '@shared/types/cluster';
import type { Filters } from '@shared/types/settings';

import type { PhotoGlobeGateway } from '@renderer/infrastructure/photoGlobeGateway';
import { windowPhotoGlobeGateway } from '@renderer/infrastructure/windowPhotoGlobeGateway';

import type { GlobeViewState } from './GlobeView';

const WORLD_VIEW: GlobeViewState = {
  bbox: [-180, -85, 180, 85],
  zoom: 2,
};

function quantize(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function getBboxStepForZoom(zoom: number): number {
  if (zoom >= 12) {
    return 0.003;
  }
  if (zoom >= 10) {
    return 0.006;
  }
  if (zoom >= 8) {
    return 0.01;
  }
  if (zoom >= 6) {
    return 0.02;
  }
  return 0.05;
}

function buildRequestKey(view: GlobeViewState, filters: Filters): string {
  const [west, south, east, north] = view.bbox;
  const step = getBboxStepForZoom(view.zoom);
  return JSON.stringify({
    bbox: [quantize(west, step), quantize(south, step), quantize(east, step), quantize(north, step)],
    zoom: view.zoom,
    dateFromMs: filters.dateFromMs ?? null,
    dateToMs: filters.dateToMs ?? null,
    includeUndated: filters.includeUndated ?? false,
    rootIds: filters.rootIds ?? [],
    mediaTypes: filters.mediaTypes ?? [],
    hasGps: filters.hasGps ?? null,
    cameraModelQuery: filters.cameraModelQuery ?? null,
    minWidthPx: filters.minWidthPx ?? null,
    minHeightPx: filters.minHeightPx ?? null,
    durationFromMs: filters.durationFromMs ?? null,
    durationToMs: filters.durationToMs ?? null,
  });
}

export function useGlobeData(
  filters: Filters,
  enabled = true,
  gateway: PhotoGlobeGateway = windowPhotoGlobeGateway,
) {
  const [items, setItems] = useState<ClusterItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewState, setViewState] = useState<GlobeViewState>(WORLD_VIEW);
  const viewStateRef = useRef<GlobeViewState>(WORLD_VIEW);
  const lastRequestId = useRef(0);
  const filtersRef = useRef(filters);
  const clusterCacheRef = useRef(new QuickLRU<string, ClusterItem[]>({ maxSize: 1200 }));
  const inFlightRef = useRef(new Map<string, Promise<ClusterItem[]>>());

  filtersRef.current = filters;

  const loadClusters = useMemo(
    () =>
      debounce(async (nextView: GlobeViewState, requestId: number) => {
        if (!enabled || !gateway.isAvailable()) {
          return;
        }

        const requestKey = buildRequestKey(nextView, filtersRef.current);
        const cached = clusterCacheRef.current.get(requestKey);
        if (cached) {
          if (requestId === lastRequestId.current) {
            setItems(cached);
            setIsLoading(false);
          }
          return;
        }

        setIsLoading(true);
        try {
          let dataPromise = inFlightRef.current.get(requestKey);
          if (!dataPromise) {
            dataPromise = gateway.geoGetClusters({
              bbox: nextView.bbox,
              zoom: nextView.zoom,
              filters: filtersRef.current,
            });
            inFlightRef.current.set(requestKey, dataPromise);
          }

          const data = await dataPromise;
          inFlightRef.current.delete(requestKey);
          clusterCacheRef.current.set(requestKey, data);

          if (requestId === lastRequestId.current) {
            setItems(data);
          }
        } catch {
          inFlightRef.current.delete(requestKey);
        } finally {
          if (requestId === lastRequestId.current) {
            setIsLoading(false);
          }
        }
      }, 45),
    [enabled, gateway],
  );

  const refresh = useCallback(
    (nextView?: GlobeViewState) => {
      if (!enabled || !gateway.isAvailable()) {
        return;
      }
      const target = nextView ?? viewStateRef.current;
      if (nextView) {
        viewStateRef.current = nextView;
        setViewState(nextView);
      }
      const requestId = lastRequestId.current + 1;
      lastRequestId.current = requestId;
      void loadClusters(target, requestId);
    },
    [enabled, gateway, loadClusters],
  );

  const refreshKey = useMemo(
    () =>
      JSON.stringify({
        dateFromMs: filters.dateFromMs ?? null,
        dateToMs: filters.dateToMs ?? null,
        includeUndated: filters.includeUndated ?? false,
        rootIds: filters.rootIds ?? [],
        mediaTypes: filters.mediaTypes ?? [],
        hasGps: filters.hasGps ?? null,
        cameraModelQuery: filters.cameraModelQuery ?? null,
        minWidthPx: filters.minWidthPx ?? null,
        minHeightPx: filters.minHeightPx ?? null,
        durationFromMs: filters.durationFromMs ?? null,
        durationToMs: filters.durationToMs ?? null,
      }),
    [
      filters.cameraModelQuery,
      filters.dateFromMs,
      filters.dateToMs,
      filters.durationFromMs,
      filters.durationToMs,
      filters.hasGps,
      filters.includeUndated,
      filters.mediaTypes,
      filters.minHeightPx,
      filters.minWidthPx,
      filters.rootIds,
    ],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    refresh();
  }, [enabled, refresh, refreshKey]);

  useEffect(
    () => () => {
      loadClusters.cancel();
    },
    [loadClusters],
  );

  return {
    items,
    isLoading,
    viewState,
    refresh,
  };
}
