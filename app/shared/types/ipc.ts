import type { ClusterItem, PointNode } from './cluster';
import type { PointItem } from './photo';
import type { AppSettings, Filters } from './settings';

export type IndexPhase = 'idle' | 'scanning' | 'extracting' | 'saving' | 'complete' | 'cancelled' | 'error';

export interface IndexProgress {
  jobId: string;
  phase: IndexPhase;
  scanned: number;
  queued: number;
  processed: number;
  indexed: number;
  skipped: number;
  errored: number;
  percent: number;
  message?: string;
}

export interface IndexStatus extends IndexProgress {
  rootPath: string;
  startedAtMs: number;
  finishedAtMs: number | null;
}

export interface RootListItem {
  id: number;
  path: string;
  lastScanAtMs: number | null;
  updatedAtMs: number;
}

export interface GetClustersPayload {
  bbox: [number, number, number, number];
  zoom: number;
  filters: Filters;
}

export interface GetPointsPayload {
  bbox: [number, number, number, number];
  limit: number;
  offset: number;
  filters: Filters;
}

export interface GetClusterMembersPayload {
  clusterId: number;
  limit: number;
  filters: Filters;
}

export interface MediaSourceInfo {
  path: string;
  mediaType: 'photo' | 'video';
  mime: string | null;
}

export interface OpenSourceResult {
  ok: boolean;
  error?: string;
}

export interface PreviewStripRequestPayload {
  requestId: string;
  photoIds: number[];
  size: 64 | 128;
  visibleCount: number;
  burst: 'aggressive' | 'balanced' | 'low';
}

export interface PreviewStripProgressPayload {
  requestId: string;
  photoId: number;
  path: string | null;
  cacheHit: boolean;
  done: number;
  total: number;
  status: 'ready' | 'error' | 'cancelled' | 'complete';
}

export interface HoverPreviewInfo {
  path: string;
  cacheHit: boolean;
  kind: 'image' | 'video';
}

export interface TimelineExtentInfo {
  minMs: number | null;
  maxMs: number | null;
  datedCount: number;
  undatedCount: number;
}

export interface DateMediaCountItem {
  date: string;
  photoCount: number;
  videoCount: number;
  totalCount: number;
}

export interface TripPoint {
  photoId: number;
  lat: number;
  lng: number;
  takenAtMs: number;
  mediaType: 'photo' | 'video';
}

export interface TripSegment {
  tripId: string;
  colorIndex: number;
  startAtMs: number;
  endAtMs: number;
  distanceKm: number;
  durationMs: number;
  pointCount: number;
  points: TripPoint[];
}

export type UxEventName =
  | 'app_opened'
  | 'first_data_visible'
  | 'point_or_cluster_clicked'
  | 'timeline_opened'
  | 'trip_enabled'
  | 'playback_started'
  | 'source_opened'
  | 'index_started'
  | 'index_completed'
  | 'index_failed';

export type UxEventProps = Record<string, string | number | boolean>;

export interface UxEventRecord {
  name: UxEventName;
  atMs: number;
  props?: UxEventProps;
}

export interface SessionMetricsSummary {
  sessionId: string;
  startedAtMs: number;
  endedAtMs: number | null;
  eventCount: number;
  funnel: Array<{
    step: UxEventName;
    reached: boolean;
    atMs: number | null;
    elapsedFromStartMs: number | null;
  }>;
}

export type ThumbnailPriority = 'high' | 'normal' | 'low';

export type CityCatalogPhase = 'idle' | 'downloading' | 'importing' | 'ready' | 'error';

export interface CityCatalogStatus {
  phase: CityCatalogPhase;
  percent: number;
  message?: string;
  updatedAtMs?: number | null;
  rowCount?: number;
}

export interface ContinentItem {
  code: string;
  name: string;
  countryCount: number;
  cityCount: number;
}

export interface CountryItem {
  code: string;
  name: string;
  continentCode: string;
  cityCount: number;
}

export interface CityItem {
  id: string;
  geonameId: number;
  name: string;
  asciiName: string | null;
  countryCode: string;
  countryName: string;
  continentCode: string;
  continentName: string;
  lat: number;
  lng: number;
  population: number;
}

export interface ElectronApi {
  app: {
    selectFolder: () => Promise<{ path: string | null }>;
    toggleFullscreen: () => Promise<{ isFullScreen: boolean }>;
    getWindowState: () => Promise<{ isFullScreen: boolean; isMaximized: boolean }>;
  };
  index: {
    start: (payload: { rootPath: string }) => Promise<{ jobId: string }>;
    cancel: (payload: { jobId: string }) => Promise<{ ok: boolean }>;
    status: (jobId: string) => Promise<IndexStatus | null>;
    onProgress: (listener: (progress: IndexStatus) => void) => () => void;
  };
  geo: {
    getClusters: (payload: GetClustersPayload) => Promise<ClusterItem[]>;
    getPoints: (payload: GetPointsPayload) => Promise<PointItem[]>;
    getClusterMembers: (payload: GetClusterMembersPayload) => Promise<PointNode[]>;
    getTrips: (payload: { filters: Filters; splitHours?: number; splitKm?: number; maxPoints?: number }) => Promise<TripSegment[]>;
  };
  media: {
    getThumbnail: (payload: {
      photoId: number;
      size: 64 | 128 | 256 | 512;
      priority?: ThumbnailPriority;
    }) => Promise<{ path: string; cacheHit: boolean }>;
    requestPreviewStrip: (payload: PreviewStripRequestPayload) => Promise<{ ok: boolean }>;
    cancelPreviewStrip: (payload: { requestId: string }) => Promise<{ ok: boolean }>;
    onPreviewStripProgress: (listener: (progress: PreviewStripProgressPayload) => void) => () => void;
    prefetchThumbnails: (payload: {
      photoIds: number[];
      size: 64 | 128 | 256 | 512;
      priority?: ThumbnailPriority;
    }) => Promise<{ queued: number }>;
    countPrefetchTargets: (payload: { filters: Filters }) => Promise<{ total: number }>;
    getPrefetchTargetIds: (payload: { filters: Filters; limit: number; offset: number }) => Promise<{ ids: number[] }>;
    getHoverPreview: (payload: { photoId: number; width?: 240 | 320 | 480 }) => Promise<HoverPreviewInfo>;
    getDailyCounts: (payload: { filters: Filters; limit?: number }) => Promise<DateMediaCountItem[]>;
    getTimelineExtent: (payload: { filters: Filters }) => Promise<TimelineExtentInfo>;
    getSource: (payload: { photoId: number }) => Promise<MediaSourceInfo>;
    openSource: (payload: { photoId: number }) => Promise<OpenSourceResult>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (payload: Partial<AppSettings>) => Promise<AppSettings>;
    addRecentRoot: (payload: { path: string }) => Promise<AppSettings>;
    addRoot: (payload: { path: string }) => Promise<AppSettings>;
    removeRoot: (payload: { rootId: number }) => Promise<AppSettings>;
    setActiveRoots: (payload: { rootIds: number[] }) => Promise<AppSettings>;
    listRoots: () => Promise<RootListItem[]>;
  };
  metrics: {
    track: (payload: { name: UxEventName; props?: UxEventProps }) => Promise<void>;
    getSessionSummary: () => Promise<SessionMetricsSummary>;
    listRecentSessions: (payload: { limit: number }) => Promise<SessionMetricsSummary[]>;
    exportRecentSessions: (payload: { limit: number; format: 'json' }) => Promise<{ path: string }>;
    resetCurrentSession: () => Promise<{ ok: boolean }>;
  };
  cities: {
    ensureCatalog: () => Promise<CityCatalogStatus>;
    getContinents: () => Promise<ContinentItem[]>;
    getCountries: (payload: { continentCode: string }) => Promise<CountryItem[]>;
    getCities: (payload: {
      continentCode: string;
      countryCode: string;
      query?: string;
      limit: number;
      offset: number;
    }) => Promise<CityItem[]>;
    getByIds: (payload: { ids: string[] }) => Promise<CityItem[]>;
    onCatalogProgress: (listener: (progress: CityCatalogStatus) => void) => () => void;
  };
}
