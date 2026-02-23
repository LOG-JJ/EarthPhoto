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

export interface HoverPreviewInfo {
  path: string;
  cacheHit: boolean;
  kind: 'image' | 'video';
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
  };
  media: {
    getThumbnail: (payload: {
      photoId: number;
      size: 64 | 128 | 256 | 512;
      priority?: ThumbnailPriority;
    }) => Promise<{ path: string; cacheHit: boolean }>;
    prefetchThumbnails: (payload: {
      photoIds: number[];
      size: 64 | 128 | 256 | 512;
      priority?: ThumbnailPriority;
    }) => Promise<{ queued: number }>;
    countPrefetchTargets: (payload: { filters: Filters }) => Promise<{ total: number }>;
    getPrefetchTargetIds: (payload: { filters: Filters; limit: number; offset: number }) => Promise<{ ids: number[] }>;
    getHoverPreview: (payload: { photoId: number; width?: 240 | 320 | 480 }) => Promise<HoverPreviewInfo>;
    getSource: (payload: { photoId: number }) => Promise<MediaSourceInfo>;
    openSource: (payload: { photoId: number }) => Promise<OpenSourceResult>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (payload: Partial<AppSettings>) => Promise<AppSettings>;
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
