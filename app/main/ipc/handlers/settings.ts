import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';
import type { AppSettings } from '@shared/types/settings';

export function registerSettingsHandlers(context: IpcContext): void {
  const { ipcMain, settingsRepo, fileWatcher } = context;

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => settingsRepo.getSettings());

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, patch: Partial<AppSettings>) => {
    const next = settingsRepo.setSettings(patch);
    const rootPath = next.recentRoots[0];

    if (next.watchEnabled && rootPath) {
      await fileWatcher.start(rootPath);
    } else if (!next.watchEnabled) {
      await fileWatcher.stop();
    }
    return next;
  });
}

