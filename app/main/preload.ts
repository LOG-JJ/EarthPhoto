import * as electronModule from 'electron';

import { IPC_CHANNELS } from '@main/ipc/channels';
import type { ElectronApi } from '@shared/types/ipc';

const electron = (electronModule as typeof electronModule & { default?: typeof electronModule }).default ?? electronModule;
const { contextBridge, ipcRenderer } = electron;

const api: ElectronApi = {
  app: {
    selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.APP_SELECT_FOLDER),
    toggleFullscreen: () => ipcRenderer.invoke(IPC_CHANNELS.APP_TOGGLE_FULLSCREEN),
    getWindowState: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_WINDOW_STATE),
  },
  index: {
    start: (payload) => ipcRenderer.invoke(IPC_CHANNELS.INDEX_START, payload),
    cancel: (payload) => ipcRenderer.invoke(IPC_CHANNELS.INDEX_CANCEL, payload),
    status: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.INDEX_STATUS, jobId),
    onProgress: (listener) => {
      const wrapped = (_event: unknown, progress: Parameters<typeof listener>[0]) => listener(progress);
      ipcRenderer.on(IPC_CHANNELS.INDEX_PROGRESS, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.INDEX_PROGRESS, wrapped);
    },
  },
  geo: {
    getClusters: (payload) => ipcRenderer.invoke(IPC_CHANNELS.GEO_GET_CLUSTERS, payload),
    getPoints: (payload) => ipcRenderer.invoke(IPC_CHANNELS.GEO_GET_POINTS, payload),
    getClusterMembers: (payload) => ipcRenderer.invoke(IPC_CHANNELS.GEO_GET_CLUSTER_MEMBERS, payload),
    getTrips: (payload) => ipcRenderer.invoke(IPC_CHANNELS.GEO_GET_TRIPS, payload),
  },
  media: {
    getThumbnail: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_THUMBNAIL, payload),
    requestPreviewStrip: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_REQUEST_PREVIEW_STRIP, payload),
    cancelPreviewStrip: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_CANCEL_PREVIEW_STRIP, payload),
    onPreviewStripProgress: (listener) => {
      const wrapped = (_event: unknown, progress: Parameters<typeof listener>[0]) => listener(progress);
      ipcRenderer.on(IPC_CHANNELS.MEDIA_PREVIEW_STRIP_PROGRESS, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.MEDIA_PREVIEW_STRIP_PROGRESS, wrapped);
    },
    prefetchThumbnails: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PREFETCH_THUMBNAILS, payload),
    countPrefetchTargets: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_COUNT_PREFETCH_TARGETS, payload),
    getPrefetchTargetIds: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_PREFETCH_TARGET_IDS, payload),
    getHoverPreview: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_HOVER_PREVIEW, payload),
    getDailyCounts: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_DAILY_COUNTS, payload),
    getTimelineExtent: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_TIMELINE_EXTENT, payload),
    getSource: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_SOURCE, payload),
    openSource: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_OPEN_SOURCE, payload),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, payload),
    addRecentRoot: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_ADD_RECENT_ROOT, payload),
    addRoot: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_ADD_ROOT, payload),
    removeRoot: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_REMOVE_ROOT, payload),
    setActiveRoots: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_ACTIVE_ROOTS, payload),
    listRoots: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_LIST_ROOTS),
  },
  metrics: {
    track: (payload) => ipcRenderer.invoke(IPC_CHANNELS.METRICS_TRACK, payload),
    getSessionSummary: () => ipcRenderer.invoke(IPC_CHANNELS.METRICS_GET_SESSION_SUMMARY),
    listRecentSessions: (payload) => ipcRenderer.invoke(IPC_CHANNELS.METRICS_LIST_RECENT_SESSIONS, payload),
    exportRecentSessions: (payload) => ipcRenderer.invoke(IPC_CHANNELS.METRICS_EXPORT_RECENT_SESSIONS, payload),
    resetCurrentSession: () => ipcRenderer.invoke(IPC_CHANNELS.METRICS_RESET_CURRENT_SESSION),
  },
  cities: {
    ensureCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.CITIES_ENSURE_CATALOG),
    getContinents: () => ipcRenderer.invoke(IPC_CHANNELS.CITIES_GET_CONTINENTS),
    getCountries: (payload) => ipcRenderer.invoke(IPC_CHANNELS.CITIES_GET_COUNTRIES, payload),
    getCities: (payload) => ipcRenderer.invoke(IPC_CHANNELS.CITIES_GET_CITIES, payload),
    getByIds: (payload) => ipcRenderer.invoke(IPC_CHANNELS.CITIES_GET_BY_IDS, payload),
    onCatalogProgress: (listener) => {
      const wrapped = (_event: unknown, progress: Parameters<typeof listener>[0]) => listener(progress);
      ipcRenderer.on(IPC_CHANNELS.CITIES_PROGRESS, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.CITIES_PROGRESS, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld('photoGlobe', api);
