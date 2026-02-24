import { create } from 'zustand';

import { createAppSlice } from './slices/appSlice';
import { createCitySlice } from './slices/citySlice';
import { createPreviewSlice } from './slices/previewSlice';
import type { AppStore } from './types';

export type { AppStore } from './types';

export const useAppStore = create<AppStore>()((...args) => ({
  ...createAppSlice(...args),
  ...createPreviewSlice(...args),
  ...createCitySlice(...args),
}));
