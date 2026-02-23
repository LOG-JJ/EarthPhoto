import type { IpcContext } from './context';
import { registerClusterHandlers } from './handlers/clusters';
import { registerCitiesHandlers } from './handlers/cities';
import { registerIndexingHandlers } from './handlers/indexing';
import { registerPointsHandlers } from './handlers/points';
import { registerSelectFolderHandler } from './handlers/selectFolder';
import { registerSettingsHandlers } from './handlers/settings';
import { registerThumbnailHandlers } from './handlers/thumbnail';
import { registerWindowControlHandlers } from './handlers/windowControls';

export function registerIpcHandlers(context: IpcContext): void {
  registerSelectFolderHandler(context);
  registerWindowControlHandlers(context);
  registerIndexingHandlers(context);
  registerClusterHandlers(context);
  registerPointsHandlers(context);
  registerCitiesHandlers(context);
  registerThumbnailHandlers(context);
  registerSettingsHandlers(context);
}
