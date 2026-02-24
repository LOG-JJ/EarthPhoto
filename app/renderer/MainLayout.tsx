import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { CityItem, DateMediaCountItem, RootListItem, SessionMetricsSummary, TripSegment } from '@shared/types/ipc';
import type { UiThemePreset } from '@shared/types/settings';

import { trackUxEvent } from './application/metrics/uxMetrics';
import { useBackgroundWarmup } from './application/usecases/useBackgroundWarmup';
import { useCityCatalogUseCase } from './application/usecases/useCityCatalogUseCase';
import { usePreviewUseCase } from './application/usecases/usePreviewUseCase';
import { useSettingsUseCase } from './application/usecases/useSettingsUseCase';
import { CITY_PAGE_SIZE, getFlyToCameraOptions, isValidCoordinatePair } from './domain/city/cityRules';
import { toEpochMs, toFilters } from './domain/filter/filterDraft';
import { GlobeView } from './globe/GlobeView';
import { useGlobeData } from './globe/useGlobeData';
import { windowPhotoGlobeGateway } from './infrastructure/windowPhotoGlobeGateway';
import { useAppStore } from './store/useAppStore';
import { CityPanel } from './ui/CityPanel';
import { DateStatsPanel } from './ui/DateStatsPanel';
import { Filters as FiltersPanel } from './ui/Filters';
import { HoverPreview } from './ui/HoverPreview';
import { JourneyCoach } from './ui/JourneyCoach';
import { MetricsPanel } from './ui/MetricsPanel';
import { PreviewPanel } from './ui/PreviewPanel';
import { ProgressPanel } from './ui/ProgressPanel';
import { RootLibraryPanel } from './ui/RootLibraryPanel';
import { Sidebar } from './ui/Sidebar';
import { TimelineBar } from './ui/TimelineBar';
import { TripCardsPanel } from './ui/TripCardsPanel';

const DAY_MS = 86_400_000;

function toDateInput(valueMs: number): string {
  return new Date(valueMs).toISOString().slice(0, 10);
}

function overlapMs(aFrom: number, aTo: number, bFrom: number, bTo: number): number {
  const start = Math.max(aFrom, bFrom);
  const end = Math.min(aTo, bTo);
  return Math.max(0, end - start);
}

function pickBestTripForRange(segments: TripSegment[], fromMs: number, toMs: number): TripSegment | null {
  if (segments.length === 0) {
    return null;
  }
  let bestByOverlap: TripSegment | null = null;
  let bestOverlap = 0;
  for (const segment of segments) {
    const value = overlapMs(fromMs, toMs, segment.startAtMs, segment.endAtMs);
    if (value > bestOverlap) {
      bestOverlap = value;
      bestByOverlap = segment;
    }
  }
  if (bestByOverlap) {
    return bestByOverlap;
  }

  const rangeMid = fromMs + Math.max(0, toMs - fromMs) / 2;
  let nearest: TripSegment | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    const segmentMid = segment.startAtMs + Math.max(0, segment.endAtMs - segment.startAtMs) / 2;
    const distance = Math.abs(segmentMid - rangeMid);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = segment;
    }
  }
  return nearest;
}

export function MainLayout() {
  const { t } = useTranslation();

  const apiReady = useAppStore((state) => state.apiReady);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const rootPath = useAppStore((state) => state.rootPath);
  const setRootPath = useAppStore((state) => state.setRootPath);
  const indexStatus = useAppStore((state) => state.indexStatus);
  const activeIndexJobId = useAppStore((state) => state.activeIndexJobId);
  const indexQueueRunning = useAppStore((state) => state.indexQueueRunning);
  const indexJobHistory = useAppStore((state) => state.indexJobHistory);
  const filtersDraft = useAppStore((state) => state.filtersDraft);
  const setFiltersDraft = useAppStore((state) => state.setFiltersDraft);
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
  const setIsSidebarOpen = useAppStore((state) => state.setIsSidebarOpen);
  const isFullscreen = useAppStore((state) => state.isFullscreen);
  const flyToRequest = useAppStore((state) => state.flyToRequest);
  const setFlyToRequest = useAppStore((state) => state.setFlyToRequest);
  const hoverPreview = useAppStore((state) => state.hoverPreview);
  const hoverPreviewLoading = useAppStore((state) => state.hoverPreviewLoading);
  const warmupStatus = useAppStore((state) => state.warmupStatus);
  const timelineExtent = useAppStore((state) => state.timelineExtent);
  const setTimelineExtent = useAppStore((state) => state.setTimelineExtent);
  const timelineWindowDays = useAppStore((state) => state.timelineWindowDays);
  const setTimelineWindowDays = useAppStore((state) => state.setTimelineWindowDays);
  const timelinePlaying = useAppStore((state) => state.timelinePlaying);
  const setTimelinePlaying = useAppStore((state) => state.setTimelinePlaying);
  const timelineOverlayEnabled = useAppStore((state) => state.timelineOverlayEnabled);
  const setTimelineOverlayEnabled = useAppStore((state) => state.setTimelineOverlayEnabled);
  const showTrips = useAppStore((state) => state.showTrips);
  const setShowTrips = useAppStore((state) => state.setShowTrips);
  const tripSegments = useAppStore((state) => state.tripSegments);
  const setTripSegments = useAppStore((state) => state.setTripSegments);

  const [targetLatInput, setTargetLatInput] = useState('');
  const [targetLngInput, setTargetLngInput] = useState('');
  const [coordInputError, setCoordInputError] = useState(false);
  const [rootOptions, setRootOptions] = useState<RootListItem[]>([]);
  const [forceJourneyCoachVisible, setForceJourneyCoachVisible] = useState(false);
  const [highlightedTripId, setHighlightedTripId] = useState<string | null>(null);
  const [metricsSummary, setMetricsSummary] = useState<SessionMetricsSummary | null>(null);
  const [metricsRecentSessions, setMetricsRecentSessions] = useState<SessionMetricsSummary[]>([]);
  const [metricsExportPath, setMetricsExportPath] = useState('');
  const [metricsBusy, setMetricsBusy] = useState(false);
  const [dateCountRows, setDateCountRows] = useState<DateMediaCountItem[]>([]);
  const [dateCountsLoading, setDateCountsLoading] = useState(false);
  const flyToSeqRef = useRef(0);
  const trackedFirstDataRef = useRef(false);
  const trackedTimelineOpenRef = useRef(false);
  const trackedTripEnabledRef = useRef(false);
  const trackedPlaybackStartedRef = useRef(false);

  const filters = useMemo(() => toFilters(filtersDraft), [filtersDraft]);
  const { items, isLoading, refresh, viewState } = useGlobeData(filters, apiReady, windowPhotoGlobeGateway);
  const uiTheme: UiThemePreset = settings.uiThemePreset;
  const featureFlags = settings.featureFlags;
  const metricsPanelEnabled = featureFlags.metricsPanelV1;
  const timelineStoryEnabled = featureFlags.timelineStoryV1;
  const tripCardsEnabled = featureFlags.tripCardsV1;
  const journeyCoachEnabled = featureFlags.journeyCoachV1;

  const {
    handleSelectFolder,
    handleStartIndexing,
    handleCancelIndexing,
    handleRetryIndexing,
    handleLanguageChange,
    handleWatchChange,
    handleSetActiveRoots,
    handleRemoveRoot,
    handleToggleFullscreen,
    handleFavoriteCityIdsChange,
  } = useSettingsUseCase(windowPhotoGlobeGateway);

  const persistSettingsPatch = useCallback(
    async (patch: Parameters<typeof windowPhotoGlobeGateway.settingsSet>[0]) => {
      const next = await windowPhotoGlobeGateway.settingsSet(patch);
      setSettings(next);
      return next;
    },
    [setSettings],
  );

  const handleThemePresetChange = useCallback(
    (theme: UiThemePreset) => {
      void persistSettingsPatch({ uiThemePreset: theme });
    },
    [persistSettingsPatch],
  );

  const handleFeatureFlagChange = useCallback(
    (flag: keyof typeof featureFlags, value: boolean) => {
      const nextFlags = { ...featureFlags, [flag]: value };
      void persistSettingsPatch({ featureFlags: nextFlags });
    },
    [featureFlags, persistSettingsPatch],
  );

  const refreshMetricsPanel = useCallback(async () => {
    if (!apiReady || !metricsPanelEnabled) {
      setMetricsSummary(null);
      setMetricsRecentSessions([]);
      return;
    }
    try {
      const [summary, recent] = await Promise.all([
        windowPhotoGlobeGateway.metricsGetSessionSummary(),
        windowPhotoGlobeGateway.metricsListRecentSessions({ limit: 10 }),
      ]);
      setMetricsSummary(summary);
      setMetricsRecentSessions(recent);
    } catch {
      setMetricsSummary(null);
      setMetricsRecentSessions([]);
    }
  }, [apiReady, metricsPanelEnabled]);

  const handleMetricsExport = useCallback(async () => {
    setMetricsBusy(true);
    try {
      const result = await windowPhotoGlobeGateway.metricsExportRecentSessions({ limit: 30, format: 'json' });
      setMetricsExportPath(result.path);
      await refreshMetricsPanel();
    } finally {
      setMetricsBusy(false);
    }
  }, [refreshMetricsPanel]);

  const handleMetricsReset = useCallback(async () => {
    setMetricsBusy(true);
    try {
      const result = await windowPhotoGlobeGateway.metricsResetCurrentSession();
      if (result.ok) {
        trackedFirstDataRef.current = false;
        trackedTimelineOpenRef.current = false;
        trackedTripEnabledRef.current = false;
        trackedPlaybackStartedRef.current = false;
        await trackUxEvent(windowPhotoGlobeGateway, 'app_opened', { reset: true });
      }
      await refreshMetricsPanel();
    } finally {
      setMetricsBusy(false);
    }
  }, [refreshMetricsPanel]);

  const handleJourneyCoachComplete = useCallback(async () => {
    const nextOnboarding = {
      version: 1 as const,
      completedAtMs: Date.now(),
      skippedAtMs: null,
    };
    await persistSettingsPatch({ onboarding: nextOnboarding });
    setForceJourneyCoachVisible(false);
  }, [persistSettingsPatch]);

  const handleJourneyCoachSkip = useCallback(async () => {
    const nextOnboarding = {
      version: 1 as const,
      completedAtMs: null,
      skippedAtMs: Date.now(),
    };
    await persistSettingsPatch({ onboarding: nextOnboarding });
    setForceJourneyCoachVisible(false);
  }, [persistSettingsPatch]);

  const markTimelineOpened = useCallback(() => {
    if (!apiReady || trackedTimelineOpenRef.current) {
      return;
    }
    trackedTimelineOpenRef.current = true;
    void trackUxEvent(windowPhotoGlobeGateway, 'timeline_opened');
  }, [apiReady]);

  useEffect(() => {
    if (!journeyCoachEnabled && forceJourneyCoachVisible) {
      setForceJourneyCoachVisible(false);
    }
  }, [forceJourneyCoachVisible, journeyCoachEnabled]);

  const isWarmupPaused = Boolean(activeIndexJobId || indexQueueRunning || isLoading);
  useBackgroundWarmup({
    apiReady,
    filters,
    paused: isWarmupPaused,
    gateway: windowPhotoGlobeGateway,
  });

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const [roots, latestSettings] = await Promise.all([
          windowPhotoGlobeGateway.settingsListRoots(),
          windowPhotoGlobeGateway.settingsGet(),
        ]);
        if (cancelled) return;
        setRootOptions(roots);
        setSettings(latestSettings);
      } catch {
        if (cancelled) return;
        setRootOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiReady, indexStatus?.phase, setSettings]);

  useEffect(() => {
    if (rootOptions.length === 0) {
      if (rootPath !== null) {
        setRootPath(null);
      }
      return;
    }
    if (!rootPath || !rootOptions.some((root) => root.path === rootPath)) {
      const preferred = rootOptions.find((root) => settings.activeRootIds.includes(root.id)) ?? rootOptions[0];
      setRootPath(preferred.path);
    }
  }, [rootOptions, rootPath, setRootPath, settings.activeRootIds]);

  useEffect(() => {
    void refreshMetricsPanel();
  }, [refreshMetricsPanel]);

  useEffect(() => {
    if (!apiReady || !metricsPanelEnabled) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshMetricsPanel();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [apiReady, metricsPanelEnabled, refreshMetricsPanel]);

  useEffect(() => {
    if (!apiReady || isLoading || items.length === 0 || trackedFirstDataRef.current) {
      return;
    }
    trackedFirstDataRef.current = true;
    void trackUxEvent(windowPhotoGlobeGateway, 'first_data_visible', {
      itemCount: items.length,
      zoom: viewState.zoom,
    });
  }, [apiReady, isLoading, items.length, viewState.zoom]);

  useEffect(() => {
    if (!apiReady || !showTrips || trackedTripEnabledRef.current) {
      return;
    }
    trackedTripEnabledRef.current = true;
    void trackUxEvent(windowPhotoGlobeGateway, 'trip_enabled');
  }, [apiReady, showTrips]);

  useEffect(() => {
    if (!apiReady || !timelinePlaying || trackedPlaybackStartedRef.current) {
      return;
    }
    trackedPlaybackStartedRef.current = true;
    void trackUxEvent(windowPhotoGlobeGateway, 'playback_started');
  }, [apiReady, timelinePlaying]);

  const activeRootOptions = useMemo(
    () => rootOptions.filter((root) => settings.activeRootIds.includes(root.id)),
    [rootOptions, settings.activeRootIds],
  );

  const {
    previewLoading,
    preview,
    previewItems,
    handlePreviewItemSelect,
    handleOpenPreview,
    handlePointClick,
    handleClusterClick,
    handlePointHover,
  } = usePreviewUseCase({
    items,
    filters,
    apiReady,
    isGlobeLoading: isLoading,
    viewZoom: viewState.zoom,
    gateway: windowPhotoGlobeGateway,
  });

  const cityCatalog = useCityCatalogUseCase({
    active: activeTab === 'cities',
    userFavoriteCityIds: settings.favoriteCityIds,
    onChangeFavoriteCityIds: handleFavoriteCityIdsChange,
    gateway: windowPhotoGlobeGateway,
  });
  const {
    catalogStatus,
    continents,
    countries,
    cities,
    groupedFavorites,
    selectedContinentCode,
    selectedCountryCode,
    query,
    offset,
    hasMore,
    loadingCatalog,
    loadingCountries,
    loadingCities,
    savingFavorites,
    errorMessage,
    defaultFavoriteSet,
    userFavoriteSet,
    getCatalogStatusText,
    ensureCatalog,
    loadContinents,
    loadCities,
    handleToggleFavorite,
    subscribeCatalogProgress,
    setSelectedContinentCode,
    setSelectedCountryCode,
    setQuery,
  } = cityCatalog;

  useEffect(() => subscribeCatalogProgress(t), [subscribeCatalogProgress, t]);

  useEffect(() => {
    if (activeTab !== 'cities') return;
    if (catalogStatus?.phase === 'ready') {
      void loadContinents();
      return;
    }
    void ensureCatalog(t);
  }, [activeTab, catalogStatus?.phase, ensureCatalog, loadContinents, t]);

  const flyToCoordinates = useCallback(
    (lat: number, lng: number, options?: { targetHeight?: number; durationSec?: number }) => {
      setCoordInputError(false);
      flyToSeqRef.current += 1;
      setFlyToRequest({
        lat,
        lng,
        seq: flyToSeqRef.current,
        targetHeight: options?.targetHeight,
        durationSec: options?.durationSec,
      });
    },
    [setFlyToRequest],
  );

  const handleMoveToCoordinates = useCallback(() => {
    const parsed = isValidCoordinatePair(targetLatInput, targetLngInput);
    if (!parsed.valid) {
      setCoordInputError(true);
      return;
    }
    flyToCoordinates(parsed.lat, parsed.lng);
  }, [flyToCoordinates, targetLatInput, targetLngInput]);

  const handleFlyToFromCity = useCallback(
    (city: CityItem) => {
      setTargetLatInput(String(city.lat));
      setTargetLngInput(String(city.lng));
      const camera = getFlyToCameraOptions(Math.max(0, city.population ?? 0));
      flyToCoordinates(city.lat, city.lng, camera);
    },
    [flyToCoordinates],
  );

  const handleCoordInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleMoveToCoordinates();
      }
    },
    [handleMoveToCoordinates],
  );

  const phaseText = indexStatus
    ? `${t('progress.phase')}: ${indexStatus.phase} (${indexStatus.percent}%)`
    : t('topbar.idle');

  const isActiveIndexPhase =
    indexStatus?.phase === 'scanning' || indexStatus?.phase === 'extracting' || indexStatus?.phase === 'saving';
  const canCancelIndexing = Boolean(activeIndexJobId && isActiveIndexPhase);
  const canStartIndexing = !indexQueueRunning && !activeIndexJobId && settings.activeRootIds.length > 0;
  const canRetryIndexing = canStartIndexing;

  const handleToggleActiveRoot = useCallback(
    (rootId: number, active: boolean) => {
      const nextIds = active
        ? Array.from(new Set([...settings.activeRootIds, rootId]))
        : settings.activeRootIds.filter((id) => id !== rootId);
      void handleSetActiveRoots(nextIds);
    },
    [handleSetActiveRoots, settings.activeRootIds],
  );

  const handleRootRemove = useCallback(
    (rootId: number) => {
      if (!window.confirm(t('roots.removeConfirm'))) {
        return;
      }
      void handleRemoveRoot(rootId);
    },
    [handleRemoveRoot, t],
  );

  const timelineExtentRequestKey = useMemo(
    () =>
      JSON.stringify({
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
      filters.durationFromMs,
      filters.durationToMs,
      filters.hasGps,
      filters.mediaTypes,
      filters.minHeightPx,
      filters.minWidthPx,
      filters.rootIds,
    ],
  );

  const timelineBaseFilters = useMemo(
    () => ({
      rootIds: filters.rootIds,
      mediaTypes: filters.mediaTypes,
      hasGps: filters.hasGps,
      cameraModelQuery: filters.cameraModelQuery,
      minWidthPx: filters.minWidthPx,
      minHeightPx: filters.minHeightPx,
      durationFromMs: filters.durationFromMs,
      durationToMs: filters.durationToMs,
    }),
    [
      filters.cameraModelQuery,
      filters.durationFromMs,
      filters.durationToMs,
      filters.hasGps,
      filters.mediaTypes,
      filters.minHeightPx,
      filters.minWidthPx,
      filters.rootIds,
    ],
  );

  useEffect(() => {
    if (!apiReady || activeTab !== 'calendar') {
      if (activeTab !== 'calendar') {
        setDateCountsLoading(false);
      }
      return;
    }
    let cancelled = false;
    setDateCountsLoading(true);
    void windowPhotoGlobeGateway
      .mediaGetDailyCounts({
        filters: timelineBaseFilters,
        limit: 1_200,
      })
      .then((rows) => {
        if (!cancelled) {
          setDateCountRows(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDateCountRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDateCountsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, apiReady, timelineBaseFilters, timelineExtentRequestKey]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const extent = await windowPhotoGlobeGateway.mediaGetTimelineExtent({
          filters: timelineBaseFilters,
        });
        if (cancelled) return;
        setTimelineExtent(extent);
        setFiltersDraft((prev) => {
          if (prev.dateFrom || prev.dateTo || extent.minMs == null || extent.maxMs == null) {
            return prev;
          }
          return {
            ...prev,
            dateFrom: toDateInput(extent.minMs),
            dateTo: toDateInput(extent.maxMs),
          };
        });
      } catch {
        if (cancelled) return;
        setTimelineExtent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiReady, setFiltersDraft, setTimelineExtent, timelineBaseFilters, timelineExtentRequestKey]);

  const handleTimelineRangeChange = useCallback(
    (fromMs: number, toMs: number) => {
      markTimelineOpened();
      setTimelinePlaying(false);
      setFiltersDraft((prev) => ({
        ...prev,
        dateFrom: toDateInput(fromMs),
        dateTo: toDateInput(toMs),
      }));
    },
    [markTimelineOpened, setFiltersDraft, setTimelinePlaying],
  );

  const handleTimelinePlayToggle = useCallback(
    (playing: boolean) => {
      markTimelineOpened();
      setTimelinePlaying(playing);
    },
    [markTimelineOpened, setTimelinePlaying],
  );

  const handleTimelineIncludeUndatedChange = useCallback(
    (value: boolean) => {
      markTimelineOpened();
      setTimelinePlaying(false);
      setFiltersDraft((prev) => ({ ...prev, includeUndated: value }));
    },
    [markTimelineOpened, setFiltersDraft, setTimelinePlaying],
  );

  const handleTimelineShowTripsChange = useCallback(
    (value: boolean) => {
      markTimelineOpened();
      setShowTrips(value);
    },
    [markTimelineOpened, setShowTrips],
  );

  useEffect(() => {
    if (!timelinePlaying || timelineExtent?.minMs == null || timelineExtent.maxMs == null) {
      return;
    }
    const timer = window.setInterval(() => {
      let shouldStop = false;
      setFiltersDraft((prev) => {
        const currentFrom = toEpochMs(prev.dateFrom, false) ?? timelineExtent.minMs!;
        const maxToMs = timelineExtent.maxMs!;
        const nextFrom = currentFrom + DAY_MS;
        const nextTo = nextFrom + Math.max(1, timelineWindowDays) * DAY_MS - 1;
        if (nextTo > maxToMs) {
          shouldStop = true;
          return prev;
        }
        return {
          ...prev,
          dateFrom: toDateInput(nextFrom),
          dateTo: toDateInput(nextTo),
        };
      });
      if (shouldStop) {
        setTimelinePlaying(false);
      }
    }, 800);
    return () => window.clearInterval(timer);
  }, [setFiltersDraft, setTimelinePlaying, timelineExtent?.maxMs, timelineExtent?.minMs, timelinePlaying, timelineWindowDays]);

  const shouldLoadTrips = showTrips || timelineStoryEnabled || tripCardsEnabled;
  useEffect(() => {
    if (!apiReady || !shouldLoadTrips) {
      setTripSegments([]);
      return;
    }
    let cancelled = false;
    void windowPhotoGlobeGateway
      .geoGetTrips({ filters })
      .then((segments) => {
        if (!cancelled) {
          setTripSegments(segments);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTripSegments([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiReady, filters, setTripSegments, shouldLoadTrips]);

  const timelineFromMs = useMemo(() => toEpochMs(filtersDraft.dateFrom, false), [filtersDraft.dateFrom]);
  const timelineToMs = useMemo(() => toEpochMs(filtersDraft.dateTo, true), [filtersDraft.dateTo]);

  const highlightedTrip = useMemo(
    () => tripSegments.find((segment) => segment.tripId === highlightedTripId) ?? null,
    [highlightedTripId, tripSegments],
  );

  useEffect(() => {
    if (!timelineStoryEnabled || timelineFromMs == null || timelineToMs == null || tripSegments.length === 0) {
      setHighlightedTripId(null);
      return;
    }
    const best = pickBestTripForRange(tripSegments, timelineFromMs, timelineToMs);
    setHighlightedTripId(best?.tripId ?? null);
  }, [timelineFromMs, timelineStoryEnabled, timelineToMs, tripSegments]);

  const handleTripMarkerSelect = useCallback(
    (tripId: string) => {
      const segment = tripSegments.find((item) => item.tripId === tripId);
      if (!segment) {
        return;
      }
      setTimelinePlaying(false);
      setShowTrips(true);
      setHighlightedTripId(segment.tripId);
      setFiltersDraft((prev) => ({
        ...prev,
        dateFrom: toDateInput(segment.startAtMs),
        dateTo: toDateInput(segment.endAtMs),
      }));
    },
    [setFiltersDraft, setShowTrips, setTimelinePlaying, tripSegments],
  );

  const handleSelectTripCard = useCallback(
    (trip: TripSegment) => {
      setTimelinePlaying(false);
      setShowTrips(true);
      setTimelineOverlayEnabled(true);
      setHighlightedTripId(trip.tripId);
      setFiltersDraft((prev) => ({
        ...prev,
        dateFrom: toDateInput(trip.startAtMs),
        dateTo: toDateInput(trip.endAtMs),
      }));
      const focusPoint = trip.points[Math.floor(trip.points.length / 2)] ?? trip.points[0];
      if (focusPoint) {
        flyToCoordinates(focusPoint.lat, focusPoint.lng, {
          targetHeight: 2_200_000,
          durationSec: 0.7,
        });
      }
    },
    [flyToCoordinates, setFiltersDraft, setShowTrips, setTimelineOverlayEnabled, setTimelinePlaying],
  );

  const handleOpenTripRepresentative = useCallback(async (trip: TripSegment) => {
    const target = trip.points[0];
    if (!target) {
      return;
    }
    try {
      const result = await windowPhotoGlobeGateway.mediaOpenSource({ photoId: target.photoId });
      if (result.ok) {
        await trackUxEvent(windowPhotoGlobeGateway, 'source_opened', { photoId: target.photoId });
      }
    } catch {
      // fail-open
    }
  }, []);

  const isDefaultFavorite = useCallback(
    (cityId: string) => defaultFavoriteSet.has(cityId),
    [defaultFavoriteSet],
  );
  const isFavorite = useCallback(
    (cityId: string) => defaultFavoriteSet.has(cityId) || userFavoriteSet.has(cityId),
    [defaultFavoriteSet, userFavoriteSet],
  );

  const shouldRenderTrips = timelineOverlayEnabled && (showTrips || timelineStoryEnabled);
  const showJourneyCoach =
    journeyCoachEnabled &&
    (forceJourneyCoachVisible || (settings.onboarding.completedAtMs === null && settings.onboarding.skippedAtMs === null));

  return (
    <div className={`app-shell theme-${uiTheme}`}>
      <main className="globe-area">
        {isLoading ? <div className="loading-banner">{t('topbar.loading')}</div> : null}
        <GlobeView
          items={items}
          trips={shouldRenderTrips ? tripSegments : []}
          highlightedTripId={timelineStoryEnabled ? highlightedTripId : null}
          onClusterClick={handleClusterClick}
          onPointClick={handlePointClick}
          onPointHover={handlePointHover}
          onViewChange={refresh}
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
        timelineOverlayEnabled={timelineOverlayEnabled}
        language={settings.language}
        onToggleCollapsed={() => setIsSidebarOpen((current) => !current)}
        onWatchEnabledChange={handleWatchChange}
        onToggleTimelineOverlay={() => {
          const next = !timelineOverlayEnabled;
          setTimelineOverlayEnabled(next);
          if (next) {
            markTimelineOpened();
          }
          if (!next) {
            setTimelinePlaying(false);
          }
        }}
        onLanguageChange={handleLanguageChange}
        filtersSlot={<FiltersPanel value={filtersDraft} roots={activeRootOptions} onChange={setFiltersDraft} />}
        previewSlot={
          <PreviewPanel
            preview={preview}
            previews={previewItems}
            isLoading={previewLoading}
            onSelectPreview={handlePreviewItemSelect}
            onOpenPreview={handleOpenPreview}
          />
        }
        calendarSlot={<DateStatsPanel rows={dateCountRows} loading={dateCountsLoading} />}
        systemSlot={
          <div className="system-actions">
            <RootLibraryPanel
              roots={rootOptions}
              activeRootIds={settings.activeRootIds}
              onAddRoot={() => void handleSelectFolder()}
              onToggleActive={handleToggleActiveRoot}
              onRemoveRoot={handleRootRemove}
            />
            <ProgressPanel
              status={indexStatus}
              history={indexJobHistory}
              canCancel={canCancelIndexing}
              canRetry={canRetryIndexing}
              onCancel={() => void handleCancelIndexing()}
              onRetry={() => void handleRetryIndexing()}
            />
            <div className="action-buttons-grid">
              <button type="button" onClick={handleSelectFolder}>{t('sidebar.selectFolder')}</button>
              <button type="button" onClick={handleStartIndexing} disabled={!canStartIndexing}>
                {t('sidebar.startIndexing')}
              </button>
              <button type="button" onClick={handleToggleFullscreen}>
                {isFullscreen ? t('topbar.exitFullscreen') : t('topbar.enterFullscreen')}
              </button>
            </div>
            <section className="panel">
              <h3>{t('theme.title')}</h3>
              <p className="status-text">{t('theme.subtitle')}</p>
              <div className="theme-preset-group" role="radiogroup" aria-label={t('theme.title')}>
                {(['indigo', 'ocean', 'sunset'] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={`theme-chip${uiTheme === theme ? ' is-active' : ''}`}
                    aria-pressed={uiTheme === theme}
                    onClick={() => handleThemePresetChange(theme)}
                  >
                    <span className={`theme-swatch theme-swatch-${theme}`} aria-hidden="true" />
                    {t(`theme.${theme}`)}
                  </button>
                ))}
              </div>
            </section>
            <section className="panel">
              <h3>{t('flags.title')}</h3>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={featureFlags.journeyCoachV1}
                  onChange={(event) => handleFeatureFlagChange('journeyCoachV1', event.target.checked)}
                />
                {t('flags.journeyCoachV1')}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={featureFlags.timelineStoryV1}
                  onChange={(event) => handleFeatureFlagChange('timelineStoryV1', event.target.checked)}
                />
                {t('flags.timelineStoryV1')}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={featureFlags.tripCardsV1}
                  onChange={(event) => handleFeatureFlagChange('tripCardsV1', event.target.checked)}
                />
                {t('flags.tripCardsV1')}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={featureFlags.metricsPanelV1}
                  onChange={(event) => handleFeatureFlagChange('metricsPanelV1', event.target.checked)}
                />
                {t('flags.metricsPanelV1')}
              </label>
              <button
                type="button"
                onClick={() => setForceJourneyCoachVisible(true)}
                disabled={!featureFlags.journeyCoachV1}
              >
                {t('coach.replay')}
              </button>
            </section>
            {metricsPanelEnabled ? (
              <MetricsPanel
                summary={metricsSummary}
                recent={metricsRecentSessions}
                exportPath={metricsExportPath}
                loading={metricsBusy}
                onRefresh={() => void refreshMetricsPanel()}
                onExport={() => void handleMetricsExport()}
                onReset={() => void handleMetricsReset()}
              />
            ) : null}
            <section className="panel">
              <h3>{t('warmup.title')}</h3>
              <p className="status-text">
                {t(`warmup.stage.${warmupStatus.stage}`)} ({warmupStatus.processed}/{warmupStatus.total})
              </p>
            </section>
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
              <button type="button" onClick={handleMoveToCoordinates}>{t('system.gotoAction')}</button>
              {coordInputError ? <p className="status-text status-text-error">{t('system.gotoInvalid')}</p> : null}
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
            catalogStatus={catalogStatus}
            catalogStatusText={getCatalogStatusText(t, catalogStatus)}
            continents={continents}
            countries={countries}
            cities={cities}
            groupedFavorites={groupedFavorites}
            selectedContinentCode={selectedContinentCode}
            selectedCountryCode={selectedCountryCode}
            query={query}
            hasMore={hasMore}
            loadingCatalog={loadingCatalog}
            loadingCountries={loadingCountries}
            loadingCities={loadingCities}
            savingFavorites={savingFavorites}
            errorMessage={errorMessage}
            isFavorite={isFavorite}
            isDefaultFavorite={isDefaultFavorite}
            onRetryCatalog={() => void ensureCatalog(t)}
            onSelectContinent={setSelectedContinentCode}
            onSelectCountry={setSelectedCountryCode}
            onQueryChange={setQuery}
            onLoadMore={() => void loadCities({ reset: false, nextOffset: offset + CITY_PAGE_SIZE })}
            onToggleFavorite={(cityId) => void handleToggleFavorite(cityId)}
            onFlyTo={handleFlyToFromCity}
          />
        }
      />

      {timelineOverlayEnabled ? (
        <TimelineBar
          extent={timelineExtent}
          fromMs={timelineFromMs}
          toMs={timelineToMs}
          includeUndated={filtersDraft.includeUndated}
          playing={timelinePlaying}
          windowDays={timelineWindowDays}
          showTrips={showTrips}
          storyEnabled={timelineStoryEnabled}
          tripSegments={tripSegments}
          highlightedTripId={highlightedTripId}
          currentTrip={highlightedTrip}
          onRangeChange={handleTimelineRangeChange}
          onPlayToggle={handleTimelinePlayToggle}
          onWindowDaysChange={setTimelineWindowDays}
          onIncludeUndatedChange={handleTimelineIncludeUndatedChange}
          onShowTripsChange={handleTimelineShowTripsChange}
          onTripMarkerSelect={handleTripMarkerSelect}
        />
      ) : null}

      <TripCardsPanel
        visible={timelineOverlayEnabled && tripCardsEnabled}
        segments={tripSegments}
        highlightedTripId={highlightedTripId}
        onSelectTrip={handleSelectTripCard}
        onOpenRepresentative={handleOpenTripRepresentative}
      />

      <HoverPreview preview={hoverPreview} isLoading={hoverPreviewLoading} />
      <JourneyCoach
        visible={showJourneyCoach}
        onComplete={() => void handleJourneyCoachComplete()}
        onSkip={() => void handleJourneyCoachSkip()}
      />
    </div>
  );
}
