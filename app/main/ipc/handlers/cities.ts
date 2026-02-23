import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';

export function registerCitiesHandlers(context: IpcContext): void {
  const { ipcMain, cityCatalogService, getMainWindow } = context;

  cityCatalogService.onProgress((progress) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(IPC_CHANNELS.CITIES_PROGRESS, progress);
  });

  ipcMain.handle(IPC_CHANNELS.CITIES_ENSURE_CATALOG, async () => cityCatalogService.ensureCatalog());

  ipcMain.handle(IPC_CHANNELS.CITIES_GET_CONTINENTS, async () => cityCatalogService.getContinents());

  ipcMain.handle(IPC_CHANNELS.CITIES_GET_COUNTRIES, async (_event, payload: { continentCode: string }) =>
    cityCatalogService.getCountries(payload.continentCode),
  );

  ipcMain.handle(
    IPC_CHANNELS.CITIES_GET_CITIES,
    async (
      _event,
      payload: {
        continentCode: string;
        countryCode: string;
        query?: string;
        limit: number;
        offset: number;
      },
    ) => cityCatalogService.getCities(payload),
  );

  ipcMain.handle(IPC_CHANNELS.CITIES_GET_BY_IDS, async (_event, payload: { ids: string[] }) =>
    cityCatalogService.getByIds(payload.ids),
  );
}
