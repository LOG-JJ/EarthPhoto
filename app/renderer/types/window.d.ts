import type { ElectronApi } from '@shared/types/ipc';

declare global {
  interface Window {
    photoGlobe: ElectronApi;
  }
}

export {};
