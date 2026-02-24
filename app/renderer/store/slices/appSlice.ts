import type { StateCreator } from 'zustand';

import { DEFAULT_FILTER_DRAFT } from '@renderer/domain/filter/filterDraft';

import type { AppSlice, AppStore } from '../types';
import { DEFAULT_SETTINGS } from '@shared/types/settings';

export const createAppSlice: StateCreator<AppStore, [], [], AppSlice> = (set) => ({
  apiReady: false,
  setApiReady: (ready) => set({ apiReady: ready }),

  settings: DEFAULT_SETTINGS,
  setSettings: (settings) => set({ settings }),

  rootPath: null,
  setRootPath: (path) => set({ rootPath: path }),

  indexStatus: null,
  setIndexStatus: (status) => set({ indexStatus: status }),
  activeIndexJobId: null,
  setActiveIndexJobId: (jobId) => set({ activeIndexJobId: jobId }),
  indexQueueRunning: false,
  setIndexQueueRunning: (running) => set({ indexQueueRunning: running }),
  indexJobHistory: [],
  updateIndexProgress: (status) =>
    set((state) => {
      const nextItem = {
        jobId: status.jobId,
        rootPath: status.rootPath,
        phase: status.phase,
        startedAtMs: status.startedAtMs,
        finishedAtMs: status.finishedAtMs,
        percent: status.percent,
        indexed: status.indexed,
        skipped: status.skipped,
        errored: status.errored,
        message: status.message,
      };

      const current = state.indexJobHistory.filter((item) => item.jobId !== status.jobId);
      const updated = [nextItem, ...current]
        .sort((a, b) => b.startedAtMs - a.startedAtMs)
        .slice(0, 20);

      const terminal = status.phase === 'complete' || status.phase === 'cancelled' || status.phase === 'error';
      const shouldClearActiveJob = terminal && state.activeIndexJobId === status.jobId;

      return {
        indexStatus: status,
        indexJobHistory: updated,
        activeIndexJobId: shouldClearActiveJob ? null : state.activeIndexJobId,
      };
    }),

  filtersDraft: DEFAULT_FILTER_DRAFT,
  setFiltersDraft: (draft) =>
    set((state) => ({
      filtersDraft: typeof draft === 'function' ? draft(state.filtersDraft) : draft,
    })),

  activeTab: 'filters',
  setActiveTab: (tab) => set({ activeTab: tab }),

  isSidebarOpen: true,
  setIsSidebarOpen: (updater) =>
    set((state) => ({
      isSidebarOpen: typeof updater === 'function' ? updater(state.isSidebarOpen) : updater,
    })),

  isFullscreen: false,
  setIsFullscreen: (full) => set({ isFullscreen: full }),

  flyToRequest: null,
  setFlyToRequest: (req) => set({ flyToRequest: req }),

  hoverPreview: null,
  setHoverPreview: (preview) => set({ hoverPreview: preview }),
  hoverPreviewLoading: false,
  setHoverPreviewLoading: (loading) => set({ hoverPreviewLoading: loading }),

  warmupStatus: {
    stage: 'idle',
    running: false,
    total: 0,
    processed: 0,
  },
  setWarmupStatus: (status) =>
    set((state) => ({
      warmupStatus: typeof status === 'function' ? status(state.warmupStatus) : status,
    })),

  timelineExtent: null,
  setTimelineExtent: (extent) => set({ timelineExtent: extent }),
  timelineWindowDays: 7,
  setTimelineWindowDays: (days) => set({ timelineWindowDays: Math.max(1, Math.min(365, Math.trunc(days))) }),
  timelinePlaying: false,
  setTimelinePlaying: (playing) => set({ timelinePlaying: playing }),
  timelineOverlayEnabled: true,
  setTimelineOverlayEnabled: (enabled) => set({ timelineOverlayEnabled: enabled }),
  showTrips: false,
  setShowTrips: (show) => set({ showTrips: show }),
  tripSegments: [],
  setTripSegments: (segments) => set({ tripSegments: segments }),
});
