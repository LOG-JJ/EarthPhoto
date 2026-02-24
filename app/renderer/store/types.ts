import type {
  CityCatalogStatus,
  CityItem,
  ContinentItem,
  CountryItem,
  HoverPreviewInfo,
  IndexPhase,
  IndexStatus,
  TimelineExtentInfo,
  TripSegment,
} from '@shared/types/ipc';
import type { AppSettings } from '@shared/types/settings';

import type { AppTab } from '@renderer/domain/app/appTabs';
import type { FilterDraft } from '@renderer/domain/filter/filterDraft';
import type { FlyToRequest, PreviewListItem, PreviewState } from '@renderer/domain/preview/previewModels';

export interface IndexJobHistoryItem {
  jobId: string;
  rootPath: string;
  phase: IndexPhase;
  startedAtMs: number;
  finishedAtMs: number | null;
  percent: number;
  indexed: number;
  skipped: number;
  errored: number;
  message?: string;
}

export interface WarmupStatus {
  stage: 'idle' | 'counting' | 'warming64' | 'warming128' | 'paused' | 'complete' | 'error';
  running: boolean;
  total: number;
  processed: number;
  message?: string;
}

export interface AppSlice {
  apiReady: boolean;
  setApiReady: (ready: boolean) => void;
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  rootPath: string | null;
  setRootPath: (path: string | null) => void;
  indexStatus: IndexStatus | null;
  setIndexStatus: (status: IndexStatus | null) => void;
  activeIndexJobId: string | null;
  setActiveIndexJobId: (jobId: string | null) => void;
  indexQueueRunning: boolean;
  setIndexQueueRunning: (running: boolean) => void;
  indexJobHistory: IndexJobHistoryItem[];
  updateIndexProgress: (status: IndexStatus) => void;

  filtersDraft: FilterDraft;
  setFiltersDraft: (draft: FilterDraft | ((prev: FilterDraft) => FilterDraft)) => void;

  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  isFullscreen: boolean;
  setIsFullscreen: (full: boolean) => void;

  flyToRequest: FlyToRequest | null;
  setFlyToRequest: (req: FlyToRequest | null) => void;

  hoverPreview: (HoverPreviewInfo & { photoId: number }) | null;
  setHoverPreview: (preview: (HoverPreviewInfo & { photoId: number }) | null) => void;
  hoverPreviewLoading: boolean;
  setHoverPreviewLoading: (loading: boolean) => void;

  warmupStatus: WarmupStatus;
  setWarmupStatus: (status: WarmupStatus | ((prev: WarmupStatus) => WarmupStatus)) => void;

  timelineExtent: TimelineExtentInfo | null;
  setTimelineExtent: (extent: TimelineExtentInfo | null) => void;
  timelineWindowDays: number;
  setTimelineWindowDays: (days: number) => void;
  timelinePlaying: boolean;
  setTimelinePlaying: (playing: boolean) => void;
  timelineOverlayEnabled: boolean;
  setTimelineOverlayEnabled: (enabled: boolean) => void;
  showTrips: boolean;
  setShowTrips: (show: boolean) => void;
  tripSegments: TripSegment[];
  setTripSegments: (segments: TripSegment[]) => void;
}

export interface PreviewSlice {
  previewLoading: boolean;
  setPreviewLoading: (loading: boolean) => void;
  preview: PreviewState | null;
  setPreview: (preview: PreviewState | null | ((prev: PreviewState | null) => PreviewState | null)) => void;
  previewItems: PreviewListItem[];
  setPreviewItems: (items: PreviewListItem[] | ((prev: PreviewListItem[]) => PreviewListItem[])) => void;
}

export interface CitySlice {
  catalogStatus: CityCatalogStatus | null;
  setCatalogStatus: (status: CityCatalogStatus | null) => void;
  continents: ContinentItem[];
  setContinents: (items: ContinentItem[]) => void;
  countries: CountryItem[];
  setCountries: (items: CountryItem[]) => void;
  cities: CityItem[];
  setCities: (items: CityItem[] | ((prev: CityItem[]) => CityItem[])) => void;
  favoriteCities: CityItem[];
  setFavoriteCities: (items: CityItem[]) => void;
  selectedContinentCode: string;
  setSelectedContinentCode: (code: string | ((prev: string) => string)) => void;
  selectedCountryCode: string;
  setSelectedCountryCode: (code: string | ((prev: string) => string)) => void;
  query: string;
  setQuery: (value: string) => void;
  offset: number;
  setOffset: (value: number) => void;
  hasMore: boolean;
  setHasMore: (value: boolean) => void;
  loadingCatalog: boolean;
  setLoadingCatalog: (value: boolean) => void;
  loadingCountries: boolean;
  setLoadingCountries: (value: boolean) => void;
  loadingCities: boolean;
  setLoadingCities: (value: boolean) => void;
  savingFavorites: boolean;
  setSavingFavorites: (value: boolean) => void;
  errorMessage: string | null;
  setErrorMessage: (value: string | null) => void;
}

export type AppStore = AppSlice & PreviewSlice & CitySlice;
