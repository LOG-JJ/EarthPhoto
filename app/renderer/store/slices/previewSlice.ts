import type { StateCreator } from 'zustand';

import type { PreviewSlice, AppStore } from '../types';

export const createPreviewSlice: StateCreator<AppStore, [], [], PreviewSlice> = (set) => ({
  previewLoading: false,
  setPreviewLoading: (loading) => set({ previewLoading: loading }),

  preview: null,
  setPreview: (updater) =>
    set((state) => ({
      preview: typeof updater === 'function' ? updater(state.preview) : updater,
    })),

  previewItems: [],
  setPreviewItems: (updater) =>
    set((state) => ({
      previewItems: typeof updater === 'function' ? updater(state.previewItems) : updater,
    })),
});
