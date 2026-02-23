import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';
import type { GetClusterMembersPayload, GetClustersPayload } from '@shared/types/ipc';

export function registerClusterHandlers({ ipcMain, clusterService }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.GEO_GET_CLUSTERS, async (_event, payload: GetClustersPayload) => {
    return clusterService.getClusters(payload);
  });

  ipcMain.handle(IPC_CHANNELS.GEO_GET_CLUSTER_MEMBERS, async (_event, payload: GetClusterMembersPayload) => {
    return clusterService.getClusterMembers(payload);
  });
}
