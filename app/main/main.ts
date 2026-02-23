import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import * as electronModule from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import { lookup as lookupMime } from 'mime-types';

import { ClusterService } from '@main/cluster/clusterService';
import { CityCatalogService } from '@main/cities/catalogService';
import { createDbClient } from '@main/db/client';
import { PhotosRepository } from '@main/db/repositories/photosRepo';
import { RootsRepository } from '@main/db/repositories/rootsRepo';
import { SettingsRepository } from '@main/db/repositories/settingsRepo';
import { IndexCoordinator } from '@main/indexer/indexCoordinator';
import type { IpcContext } from '@main/ipc/context';
import { registerIpcHandlers } from '@main/ipc/registerHandlers';
import { ThumbnailService } from '@main/thumbs/thumbService';
import { FileWatcherService } from '@main/watcher/fileWatcher';
import { createMainWindow } from '@main/window';
import { normalizeFsPath } from '@shared/utils/path';

const electron = (electronModule as typeof electronModule & { default?: typeof electronModule }).default ?? electronModule;
const { app, BrowserWindow, ipcMain, protocol, net } = electron;

app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.setName('PhotoGlobeViewer');

let mainWindow: BrowserWindowType | null = null;
let isCleaningUp = false;
let protocolRegistered = false;

const appDataRoot = path.join(app.getPath('appData'), 'PhotoGlobeViewer');
const thumbnailRoot = normalizeFsPath(path.join(appDataRoot, 'thumbs'));
const dbClient = createDbClient(path.join(appDataRoot, 'db'));
const photosRepo = new PhotosRepository(dbClient.db);
const rootsRepo = new RootsRepository(dbClient.db);
const settingsRepo = new SettingsRepository(dbClient.db);
const clusterService = new ClusterService(photosRepo);
const thumbnailService = new ThumbnailService(photosRepo, appDataRoot);
const cityCatalogService = new CityCatalogService(path.join(appDataRoot, 'cities'), path.join(appDataRoot, 'logs'));
const indexCoordinator = new IndexCoordinator({
  photosRepo,
  rootsRepo,
  settingsRepo,
  onDataChanged: () => clusterService.invalidate(),
});
const fileWatcher = new FileWatcherService((rootPath) => {
  indexCoordinator.start(rootPath);
});

function isPathInside(rootPath: string, filePath: string): boolean {
  if (filePath === rootPath) {
    return true;
  }
  const rootWithSeparator = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
  return filePath.startsWith(rootWithSeparator);
}

function registerAppProtocol(): void {
  if (protocolRegistered) {
    return;
  }

  protocol.handle('photoglobe', async (request) => {
    try {
      const requestUrl = new URL(request.url);
      let requestedPath = '';

      if (requestUrl.hostname === 'thumb-by-id') {
        const rawPhotoId = requestUrl.searchParams.get('photoId');
        const rawSize = requestUrl.searchParams.get('size');
        const photoId = rawPhotoId ? Number.parseInt(rawPhotoId, 10) : NaN;
        const size = rawSize ? Number.parseInt(rawSize, 10) : 128;
        const normalizedSize = size <= 64 ? 64 : size <= 128 ? 128 : size <= 256 ? 256 : 512;
        if (!Number.isInteger(photoId) || photoId <= 0) {
          return new Response('Bad Request', { status: 400 });
        }
        const thumb = await thumbnailService.getThumbnail(photoId, normalizedSize, 'low');
        requestedPath = normalizeFsPath(path.normalize(thumb.path));
        if (!isPathInside(thumbnailRoot, requestedPath)) {
          return new Response('Forbidden', { status: 403 });
        }
      } else {
        const rawPath = requestUrl.searchParams.get('path');
        if (!rawPath) {
          return new Response('Bad Request', { status: 400 });
        }

        requestedPath = normalizeFsPath(path.normalize(rawPath));
        if (requestUrl.hostname === 'thumb') {
          if (!isPathInside(thumbnailRoot, requestedPath)) {
            return new Response('Forbidden', { status: 403 });
          }
        } else if (requestUrl.hostname === 'media') {
          const roots = rootsRepo.listRecent(1_000).map((root) => normalizeFsPath(path.normalize(root.path)));
          const isAllowed = roots.some((rootPath) => isPathInside(rootPath, requestedPath));
          if (!isAllowed) {
            return new Response('Forbidden', { status: 403 });
          }
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }

      const upstream = await net.fetch(
        new Request(pathToFileURL(requestedPath).toString(), {
          method: request.method,
          headers: request.headers,
        }),
      );
      if (!upstream.ok) {
        return new Response('Not Found', { status: 404 });
      }

      const headers = new Headers(upstream.headers);
      const mime = lookupMime(requestedPath);
      if (typeof mime === 'string') {
        headers.set('content-type', mime);
      }
      headers.set(
        'cache-control',
        requestUrl.hostname === 'thumb' || requestUrl.hostname === 'thumb-by-id'
          ? 'private, max-age=86400, stale-while-revalidate=86400'
          : 'private, max-age=600',
      );

      return new Response(upstream.body, {
        status: upstream.status,
        headers,
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });

  protocolRegistered = true;
}

async function waitForFile(filePath: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return false;
}

function createWindow(): void {
  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap(): Promise<void> {
  if (process.env.VITE_DEV_SERVER_URL) {
    const preloadPath = path.join(__dirname, 'preload.js');
    const preloadReady = await waitForFile(preloadPath, 15_000);
    if (!preloadReady) {
      console.error(`[startup] preload script not ready after timeout: ${preloadPath}`);
    }
  }

  registerAppProtocol();
  createWindow();

  const context: IpcContext = {
    ipcMain,
    getMainWindow: () => mainWindow,
    indexCoordinator,
    clusterService,
    thumbnailService,
    cityCatalogService,
    settingsRepo,
    fileWatcher,
  };
  registerIpcHandlers(context);

  const settings = settingsRepo.getSettings();
  const recentRoot = settings.recentRoots[0];

  if (settings.watchEnabled && recentRoot) {
    await fileWatcher.start(recentRoot);
  }
  if (recentRoot) {
    indexCoordinator.start(recentRoot);
  }
}

async function cleanup(): Promise<void> {
  if (isCleaningUp) {
    return;
  }
  isCleaningUp = true;
  await fileWatcher.stop();
  await indexCoordinator.dispose();
  cityCatalogService.close();
  dbClient.close();
}

app.whenReady().then(() => {
  void bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (isCleaningUp) {
    return;
  }
  event.preventDefault();
  void cleanup().finally(() => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
