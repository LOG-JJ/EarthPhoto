import type { BrowserWindow, IpcMain } from 'electron';

import type { ClusterService } from '@main/cluster/clusterService';
import type { CityCatalogService } from '@main/cities/catalogService';
import type { IndexCoordinator } from '@main/indexer/indexCoordinator';
import type { ThumbnailService } from '@main/thumbs/thumbService';
import type { TripService } from '@main/trips/tripService';
import type { FileWatcherService } from '@main/watcher/fileWatcher';
import type { SettingsRepository } from '@main/db/repositories/settingsRepo';
import type { RootsRepository } from '@main/db/repositories/rootsRepo';
import type { MetricsService } from '@main/metrics/metricsService';

export interface IpcContext {
  ipcMain: IpcMain;
  getMainWindow: () => BrowserWindow | null;
  indexCoordinator: IndexCoordinator;
  clusterService: ClusterService;
  tripService: TripService;
  thumbnailService: ThumbnailService;
  cityCatalogService: CityCatalogService;
  settingsRepo: SettingsRepository;
  rootsRepo: RootsRepository;
  fileWatcher: FileWatcherService;
  metricsService: MetricsService;
}
