import path from 'node:path';

import chokidar, { type FSWatcher } from 'chokidar';
import debounce from 'lodash.debounce';

import { getMediaGlobPattern } from '@shared/utils/mediaExtensions';
import { normalizeFsPath } from '@shared/utils/path';

const WATCH_GLOB = getMediaGlobPattern();
const OVERFLOW_THRESHOLD = 1200;

export interface WatcherDeltaPayload {
  rootPath: string;
  addedOrChangedPaths: string[];
  removedPaths: string[];
  overflow: boolean;
}

export class FileWatcherService {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly triggers = new Map<string, ReturnType<typeof debounce>>();
  private readonly pendingAddedOrChanged = new Map<string, Set<string>>();
  private readonly pendingRemoved = new Map<string, Set<string>>();

  constructor(private readonly onChange: (payload: WatcherDeltaPayload) => void) {}

  async sync(rootPaths: string[]): Promise<void> {
    const normalized = Array.from(
      new Set(
        rootPaths
          .map((value) => normalizeFsPath(value))
          .filter((value) => value.trim().length > 0),
      ),
    );
    const targetSet = new Set(normalized);

    const pendingClose: Promise<void>[] = [];
    for (const [rootPath, watcher] of this.watchers.entries()) {
      if (targetSet.has(rootPath)) {
        continue;
      }
      const trigger = this.triggers.get(rootPath);
      if (trigger) {
        trigger.cancel();
      }
      this.triggers.delete(rootPath);
      this.pendingAddedOrChanged.delete(rootPath);
      this.pendingRemoved.delete(rootPath);
      this.watchers.delete(rootPath);
      pendingClose.push(watcher.close());
    }
    await Promise.all(pendingClose);

    for (const rootPath of normalized) {
      if (this.watchers.has(rootPath)) {
        continue;
      }

      this.pendingAddedOrChanged.set(rootPath, new Set());
      this.pendingRemoved.set(rootPath, new Set());

      const trigger = debounce(() => {
        const added = Array.from(this.pendingAddedOrChanged.get(rootPath) ?? []);
        const removed = Array.from(this.pendingRemoved.get(rootPath) ?? []);
        this.pendingAddedOrChanged.set(rootPath, new Set());
        this.pendingRemoved.set(rootPath, new Set());

        if (added.length === 0 && removed.length === 0) {
          return;
        }

        this.onChange({
          rootPath,
          addedOrChangedPaths: added,
          removedPaths: removed,
          overflow: added.length + removed.length > OVERFLOW_THRESHOLD,
        });
      }, 1500);

      const toAbsolutePath = (filePath: string) => normalizeFsPath(path.resolve(rootPath, filePath));
      const enqueueAddedOrChanged = (filePath: string) => {
        const absolutePath = toAbsolutePath(filePath);
        const addedSet = this.pendingAddedOrChanged.get(rootPath);
        const removedSet = this.pendingRemoved.get(rootPath);
        addedSet?.add(absolutePath);
        removedSet?.delete(absolutePath);
        trigger();
      };
      const enqueueRemoved = (filePath: string) => {
        const absolutePath = toAbsolutePath(filePath);
        const addedSet = this.pendingAddedOrChanged.get(rootPath);
        const removedSet = this.pendingRemoved.get(rootPath);
        removedSet?.add(absolutePath);
        addedSet?.delete(absolutePath);
        trigger();
      };

      const watcher = chokidar.watch(WATCH_GLOB, {
        cwd: rootPath,
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 1500,
          pollInterval: 100,
        },
      });

      watcher.on('add', enqueueAddedOrChanged);
      watcher.on('change', enqueueAddedOrChanged);
      watcher.on('unlink', enqueueRemoved);
      this.watchers.set(rootPath, watcher);
      this.triggers.set(rootPath, trigger);
    }
  }

  async start(rootPath: string): Promise<void> {
    await this.sync([rootPath]);
  }

  async stop(): Promise<void> {
    const pendingClose: Promise<void>[] = [];
    for (const trigger of this.triggers.values()) {
      trigger.cancel();
    }
    this.triggers.clear();
    this.pendingAddedOrChanged.clear();
    this.pendingRemoved.clear();

    for (const watcher of this.watchers.values()) {
      pendingClose.push(watcher.close());
    }
    this.watchers.clear();
    await Promise.all(pendingClose);
  }
}
