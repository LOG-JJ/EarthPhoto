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
  },
  media: {
    getThumbnail: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_THUMBNAIL, payload),
    prefetchThumbnails: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PREFETCH_THUMBNAILS, payload),
    countPrefetchTargets: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_COUNT_PREFETCH_TARGETS, payload),
    getPrefetchTargetIds: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_PREFETCH_TARGET_IDS, payload),
    getHoverPreview: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_HOVER_PREVIEW, payload),
    getSource: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_SOURCE, payload),
    openSource: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_OPEN_SOURCE, payload),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, payload),
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
