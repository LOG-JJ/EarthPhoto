import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';

export function registerWindowControlHandlers({ ipcMain, getMainWindow }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.APP_TOGGLE_FULLSCREEN, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { isFullScreen: false };
    }
    const nextFullScreen = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(nextFullScreen);
    return { isFullScreen: nextFullScreen };
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_WINDOW_STATE, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return { isFullScreen: false, isMaximized: false };
    }
    return {
      isFullScreen: mainWindow.isFullScreen(),
      isMaximized: mainWindow.isMaximized(),
    };
  });
}

