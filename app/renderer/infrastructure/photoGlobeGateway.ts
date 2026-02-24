import type { ClusterItem, PointNode } from '@shared/types/cluster';
import type {
  CityCatalogStatus,
  CityItem,
  ContinentItem,
  CountryItem,
  DateMediaCountItem,
  HoverPreviewInfo,
  IndexStatus,
  MediaSourceInfo,
  OpenSourceResult,
  PreviewStripProgressPayload,
  PreviewStripRequestPayload,
  RootListItem,
  SessionMetricsSummary,
  TimelineExtentInfo,
  TripSegment,
  ThumbnailPriority,
  UxEventName,
  UxEventProps,
} from '@shared/types/ipc';
import type { AppLanguage, AppSettings, Filters } from '@shared/types/settings';

export interface PhotoGlobeGateway {
  isAvailable: () => boolean;
  reloadWindow: () => void;

  appSelectFolder: () => Promise<{ path: string | null }>;
  appToggleFullscreen: () => Promise<{ isFullScreen: boolean }>;
  appGetWindowState: () => Promise<{ isFullScreen: boolean; isMaximized: boolean }>;

  indexStart: (payload: { rootPath: string }) => Promise<{ jobId: string }>;
  indexCancel: (payload: { jobId: string }) => Promise<{ ok: boolean }>;
  indexStatus: (jobId: string) => Promise<IndexStatus | null>;
  indexOnProgress: (listener: (progress: IndexStatus) => void) => () => void;

  geoGetClusters: (payload: { bbox: [number, number, number, number]; zoom: number; filters: Filters }) => Promise<ClusterItem[]>;
  geoGetClusterMembers: (payload: { clusterId: number; limit: number; filters: Filters }) => Promise<PointNode[]>;
  geoGetTrips: (payload: { filters: Filters; splitHours?: number; splitKm?: number; maxPoints?: number }) => Promise<TripSegment[]>;

  mediaGetThumbnail: (payload: {
    photoId: number;
    size: 64 | 128 | 256 | 512;
    priority?: ThumbnailPriority;
  }) => Promise<{ path: string; cacheHit: boolean }>;
  mediaRequestPreviewStrip: (payload: PreviewStripRequestPayload) => Promise<{ ok: boolean }>;
  mediaCancelPreviewStrip: (payload: { requestId: string }) => Promise<{ ok: boolean }>;
  mediaOnPreviewStripProgress: (listener: (progress: PreviewStripProgressPayload) => void) => () => void;
  mediaPrefetchThumbnails: (payload: {
    photoIds: number[];
    size: 64 | 128 | 256 | 512;
    priority?: ThumbnailPriority;
  }) => Promise<{ queued: number }>;
  mediaCountPrefetchTargets: (payload: { filters: Filters }) => Promise<{ total: number }>;
  mediaGetPrefetchTargetIds: (payload: { filters: Filters; limit: number; offset: number }) => Promise<{ ids: number[] }>;
  mediaGetHoverPreview: (payload: { photoId: number; width?: 240 | 320 | 480 }) => Promise<HoverPreviewInfo>;
  mediaGetDailyCounts: (payload: { filters: Filters; limit?: number }) => Promise<DateMediaCountItem[]>;
  mediaGetTimelineExtent: (payload: { filters: Filters }) => Promise<TimelineExtentInfo>;
  mediaGetSource: (payload: { photoId: number }) => Promise<MediaSourceInfo>;
  mediaOpenSource: (payload: { photoId: number }) => Promise<OpenSourceResult>;

  settingsGet: () => Promise<AppSettings>;
  settingsSet: (payload: Partial<AppSettings>) => Promise<AppSettings>;
  settingsAddRecentRoot: (payload: { path: string }) => Promise<AppSettings>;
  settingsAddRoot: (payload: { path: string }) => Promise<AppSettings>;
  settingsRemoveRoot: (payload: { rootId: number }) => Promise<AppSettings>;
  settingsSetActiveRoots: (payload: { rootIds: number[] }) => Promise<AppSettings>;
  settingsListRoots: () => Promise<RootListItem[]>;
  metricsTrack: (payload: { name: UxEventName; props?: UxEventProps }) => Promise<void>;
  metricsGetSessionSummary: () => Promise<SessionMetricsSummary>;
  metricsListRecentSessions: (payload: { limit: number }) => Promise<SessionMetricsSummary[]>;
  metricsExportRecentSessions: (payload: { limit: number; format: 'json' }) => Promise<{ path: string }>;
  metricsResetCurrentSession: () => Promise<{ ok: boolean }>;

  citiesEnsureCatalog: () => Promise<CityCatalogStatus>;
  citiesGetContinents: () => Promise<ContinentItem[]>;
  citiesGetCountries: (payload: { continentCode: string }) => Promise<CountryItem[]>;
  citiesGetCities: (payload: {
    continentCode: string;
    countryCode: string;
    query?: string;
    limit: number;
    offset: number;
  }) => Promise<CityItem[]>;
  citiesGetByIds: (payload: { ids: string[] }) => Promise<CityItem[]>;
  citiesOnCatalogProgress: (listener: (progress: CityCatalogStatus) => void) => () => void;

  i18nChangeLanguage: (language: AppLanguage) => Promise<void>;
}
