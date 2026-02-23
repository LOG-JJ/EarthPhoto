import { shell } from 'electron';

import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';
import type { ThumbnailPriority } from '@shared/types/ipc';
import type { Filters } from '@shared/types/settings';

export function registerThumbnailHandlers({ ipcMain, thumbnailService }: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_GET_THUMBNAIL,
    async (_event, payload: { photoId: number; size: 64 | 128 | 256 | 512; priority?: ThumbnailPriority }) => {
      return thumbnailService.getThumbnail(payload.photoId, payload.size, payload.priority ?? 'normal');
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PREFETCH_THUMBNAILS,
    async (
      _event,
      payload: {
        photoIds: number[];
        size: 64 | 128 | 256 | 512;
        priority?: ThumbnailPriority;
      },
    ) => {
      return thumbnailService.prefetchThumbnails(payload.photoIds, payload.size, payload.priority ?? 'low');
    },
  );

  ipcMain.handle(IPC_CHANNELS.MEDIA_COUNT_PREFETCH_TARGETS, async (_event, payload: { filters: Filters }) => {
    return thumbnailService.countPrefetchTargets(payload.filters);
  });

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_GET_PREFETCH_TARGET_IDS,
    async (_event, payload: { filters: Filters; limit: number; offset: number }) => {
      return thumbnailService.getPrefetchTargetIds(payload.filters, payload.limit, payload.offset);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_GET_HOVER_PREVIEW,
    async (_event, payload: { photoId: number; width?: 240 | 320 | 480 }) => {
      return thumbnailService.getHoverPreview(payload.photoId, payload.width ?? 320);
    },
  );

  ipcMain.handle(IPC_CHANNELS.MEDIA_GET_SOURCE, async (_event, payload: { photoId: number }) => {
    return thumbnailService.getSource(payload.photoId);
  });

  ipcMain.handle(IPC_CHANNELS.MEDIA_OPEN_SOURCE, async (_event, payload: { photoId: number }) => {
    try {
      const source = thumbnailService.getSource(payload.photoId);
      const error = await shell.openPath(source.path);
      if (error) {
        return { ok: false, error };
      }
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open source file';
      return { ok: false as const, error: message };
    }
  });
}
