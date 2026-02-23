import * as electronModule from 'electron';
import type { OpenDialogOptions } from 'electron';

import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';
import { normalizeFsPath } from '@shared/utils/path';

const electron = (electronModule as typeof electronModule & { default?: typeof electronModule }).default ?? electronModule;
const { dialog } = electron;

export function registerSelectFolderHandler({ ipcMain, getMainWindow }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.APP_SELECT_FOLDER, async () => {
    const options: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Select media root folder',
    };
    const owner = getMainWindow();
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return { path: null };
    }
    return { path: normalizeFsPath(result.filePaths[0]) };
  });
}
