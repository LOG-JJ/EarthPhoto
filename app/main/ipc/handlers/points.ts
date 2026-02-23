import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';
import type { GetPointsPayload } from '@shared/types/ipc';

export function registerPointsHandlers({ ipcMain, clusterService }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.GEO_GET_POINTS, async (_event, payload: GetPointsPayload) => {
    return clusterService.getPoints(payload);
  });
}

