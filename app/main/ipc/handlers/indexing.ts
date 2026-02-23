import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';

export function registerIndexingHandlers(context: IpcContext): void {
  const { ipcMain, indexCoordinator, getMainWindow } = context;

  ipcMain.handle(IPC_CHANNELS.INDEX_START, async (_event, payload: { rootPath: string }) => {
    const jobId = indexCoordinator.start(payload.rootPath);
    return { jobId };
  });

  ipcMain.handle(IPC_CHANNELS.INDEX_CANCEL, async (_event, payload: { jobId: string }) => {
    return { ok: indexCoordinator.cancel(payload.jobId) };
  });

  ipcMain.handle(IPC_CHANNELS.INDEX_STATUS, async (_event, jobId: string) => {
    return indexCoordinator.getStatus(jobId);
  });

  indexCoordinator.onProgress((status) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(IPC_CHANNELS.INDEX_PROGRESS, status);
  });
}

