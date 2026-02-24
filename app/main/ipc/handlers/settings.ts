import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';
import type { RootListItem } from '@shared/types/ipc';
import type { AppSettings } from '@shared/types/settings';
import { normalizeFsPath } from '@shared/utils/path';
import { mergeRecentRoots } from '@shared/utils/recentRoots';

function uniquePositiveIds(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

function normalizeActiveRootIds(candidateIds: number[], context: IpcContext): number[] {
  const roots = context.rootsRepo.listRecent(1_000);
  const validIds = new Set(roots.map((root) => root.id));
  const filtered = uniquePositiveIds(candidateIds).filter((id) => validIds.has(id));
  if (filtered.length > 0) {
    return filtered;
  }
  return roots.map((root) => root.id);
}

function ensureActiveRoots(context: IpcContext): AppSettings {
  const current = context.settingsRepo.getSettings();
  const normalizedActiveRootIds = normalizeActiveRootIds(current.activeRootIds, context);
  const changed =
    normalizedActiveRootIds.length !== current.activeRootIds.length ||
    normalizedActiveRootIds.some((id, index) => id !== current.activeRootIds[index]);
  if (!changed) {
    return current;
  }
  return context.settingsRepo.setSettings({ activeRootIds: normalizedActiveRootIds });
}

async function syncWatcher(next: AppSettings, context: IpcContext): Promise<void> {
  if (!next.watchEnabled) {
    await context.fileWatcher.stop();
    return;
  }

  const rootRows = context.rootsRepo.listByIds(next.activeRootIds);
  await context.fileWatcher.sync(rootRows.map((row) => row.path));
}

function toRootListItems(context: IpcContext): RootListItem[] {
  const rows = context.rootsRepo.listRecent(1_000);
  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    lastScanAtMs: row.lastScanAtMs,
    updatedAtMs: row.updatedAtMs,
  }));
}

function applySettingsPatch(patch: Partial<AppSettings>, context: IpcContext): AppSettings {
  const nextPatch: Partial<AppSettings> = { ...patch };

  if (patch.activeRootIds) {
    nextPatch.activeRootIds = normalizeActiveRootIds(patch.activeRootIds, context);
  }

  const next = context.settingsRepo.setSettings(nextPatch);
  const normalizedActiveRootIds = normalizeActiveRootIds(next.activeRootIds, context);
  if (
    normalizedActiveRootIds.length !== next.activeRootIds.length ||
    normalizedActiveRootIds.some((id, index) => id !== next.activeRootIds[index])
  ) {
    return context.settingsRepo.setSettings({ activeRootIds: normalizedActiveRootIds });
  }
  return next;
}

async function persistSettingsWithSync(patch: Partial<AppSettings>, context: IpcContext): Promise<AppSettings> {
  const next = applySettingsPatch(patch, context);
  await syncWatcher(next, context);
  return next;
}

export function registerSettingsHandlers(context: IpcContext): void {
  const { ipcMain, settingsRepo, rootsRepo, clusterService, tripService } = context;

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => ensureActiveRoots(context));

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, patch: Partial<AppSettings>) => {
    return persistSettingsWithSync(patch, context);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_ADD_RECENT_ROOT, async (_event, payload: { path: string }) => {
    const safePath = normalizeFsPath(payload.path);
    const root = rootsRepo.ensure(safePath);
    const current = settingsRepo.getSettings();
    const recentRoots = mergeRecentRoots(current.recentRoots, safePath);
    const activeRootIds = uniquePositiveIds([root.id, ...current.activeRootIds]);
    return persistSettingsWithSync({ recentRoots, activeRootIds }, context);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_ADD_ROOT, async (_event, payload: { path: string }) => {
    const safePath = normalizeFsPath(payload.path);
    const root = rootsRepo.ensure(safePath);
    const current = settingsRepo.getSettings();
    const recentRoots = mergeRecentRoots(current.recentRoots, safePath);
    const activeRootIds = uniquePositiveIds([root.id, ...current.activeRootIds]);
    return persistSettingsWithSync({ recentRoots, activeRootIds }, context);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_REMOVE_ROOT, async (_event, payload: { rootId: number }) => {
    const root = rootsRepo.findById(payload.rootId);
    if (!root) {
      return ensureActiveRoots(context);
    }

    rootsRepo.deleteById(root.id);
    clusterService.invalidate();
    tripService.invalidate();

    const current = settingsRepo.getSettings();
    const recentRoots = current.recentRoots.filter((item) => item !== root.path);
    const activeRootIds = current.activeRootIds.filter((id) => id !== root.id);
    return persistSettingsWithSync({ recentRoots, activeRootIds }, context);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_ACTIVE_ROOTS, async (_event, payload: { rootIds: number[] }) => {
    return persistSettingsWithSync({ activeRootIds: payload.rootIds }, context);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_LIST_ROOTS, async () => toRootListItems(context));
}
