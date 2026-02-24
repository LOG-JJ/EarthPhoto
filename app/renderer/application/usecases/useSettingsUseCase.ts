import { useCallback, useRef } from 'react';

import type { AppLanguage, AppSettings } from '@shared/types/settings';

import { useAppStore } from '@renderer/store/useAppStore';
import { trackUxEvent } from '@renderer/application/metrics/uxMetrics';

import type { PhotoGlobeGateway } from '@renderer/infrastructure/photoGlobeGateway';
import { windowPhotoGlobeGateway } from '@renderer/infrastructure/windowPhotoGlobeGateway';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTerminalPhase(phase: 'idle' | 'scanning' | 'extracting' | 'saving' | 'complete' | 'cancelled' | 'error'): boolean {
  return phase === 'complete' || phase === 'cancelled' || phase === 'error';
}

export function useSettingsUseCase(gateway: PhotoGlobeGateway = windowPhotoGlobeGateway) {
  const rootPath = useAppStore((state) => state.rootPath);
  const activeIndexJobId = useAppStore((state) => state.activeIndexJobId);
  const indexQueueRunning = useAppStore((state) => state.indexQueueRunning);
  const setSettings = useAppStore((state) => state.setSettings);
  const setRootPath = useAppStore((state) => state.setRootPath);
  const setIsFullscreen = useAppStore((state) => state.setIsFullscreen);
  const setActiveIndexJobId = useAppStore((state) => state.setActiveIndexJobId);
  const setIndexQueueRunning = useAppStore((state) => state.setIndexQueueRunning);

  const queueRunTokenRef = useRef(0);
  const cancelQueueRef = useRef(false);

  const persistSettings = useCallback(
    (next: AppSettings) => {
      setSettings(next);
      return next;
    },
    [setSettings],
  );

  const handleSelectFolder = useCallback(async () => {
    const result = await gateway.appSelectFolder();
    if (!result.path) return null;
    setRootPath(result.path);
    const next = await gateway.settingsAddRoot({ path: result.path });
    persistSettings(next);
    return result.path;
  }, [gateway, persistSettings, setRootPath]);

  const waitForJobTerminal = useCallback(
    async (jobId: string, runToken: number): Promise<void> => {
      while (runToken === queueRunTokenRef.current) {
        const status = await gateway.indexStatus(jobId);
        if (status && isTerminalPhase(status.phase)) {
          return;
        }
        await sleep(350);
      }
    },
    [gateway],
  );

  const handleStartIndexing = useCallback(async () => {
    if (indexQueueRunning) {
      return [] as string[];
    }

    const [roots, latestSettings] = await Promise.all([gateway.settingsListRoots(), gateway.settingsGet()]);
    persistSettings(latestSettings);
    const activeRoots = roots.filter((root) => latestSettings.activeRootIds.includes(root.id));
    if (activeRoots.length === 0) {
      return [] as string[];
    }

    const nextToken = queueRunTokenRef.current + 1;
    queueRunTokenRef.current = nextToken;
    cancelQueueRef.current = false;
    setIndexQueueRunning(true);

    const startedJobIds: string[] = [];
    try {
      for (const root of activeRoots) {
        if (cancelQueueRef.current || queueRunTokenRef.current !== nextToken) {
          break;
        }
        setRootPath(root.path);
        const started = await gateway.indexStart({ rootPath: root.path });
        void trackUxEvent(gateway, 'index_started', {
          jobId: started.jobId,
          rootPath: root.path,
        });
        startedJobIds.push(started.jobId);
        setActiveIndexJobId(started.jobId);
        await waitForJobTerminal(started.jobId, nextToken);
      }
    } finally {
      if (queueRunTokenRef.current === nextToken) {
        setIndexQueueRunning(false);
        cancelQueueRef.current = false;
      }
    }
    return startedJobIds;
  }, [
    gateway,
    indexQueueRunning,
    persistSettings,
    setActiveIndexJobId,
    setIndexQueueRunning,
    setRootPath,
    waitForJobTerminal,
  ]);

  const handleCancelIndexing = useCallback(async () => {
    cancelQueueRef.current = true;
    if (!activeIndexJobId) return false;
    const result = await gateway.indexCancel({ jobId: activeIndexJobId });
    return result.ok;
  }, [activeIndexJobId, gateway]);

  const handleRetryIndexing = useCallback(async () => {
    return handleStartIndexing();
  }, [handleStartIndexing]);

  const handleLanguageChange = useCallback(
    async (language: AppLanguage) => {
      const next = await gateway.settingsSet({ language });
      persistSettings(next);
      await gateway.i18nChangeLanguage(language);
    },
    [gateway, persistSettings],
  );

  const handleWatchChange = useCallback(
    async (enabled: boolean) => {
      const next = await gateway.settingsSet({ watchEnabled: enabled });
      persistSettings(next);
    },
    [gateway, persistSettings],
  );

  const handleSetActiveRoots = useCallback(
    async (rootIds: number[]) => {
      const next = await gateway.settingsSetActiveRoots({ rootIds });
      persistSettings(next);
      return next;
    },
    [gateway, persistSettings],
  );

  const handleRemoveRoot = useCallback(
    async (rootId: number) => {
      const next = await gateway.settingsRemoveRoot({ rootId });
      persistSettings(next);
      if (rootPath && !next.recentRoots.includes(rootPath)) {
        setRootPath(next.recentRoots[0] ?? null);
      }
      return next;
    },
    [gateway, persistSettings, rootPath, setRootPath],
  );

  const handleToggleFullscreen = useCallback(async () => {
    const next = await gateway.appToggleFullscreen();
    setIsFullscreen(next.isFullScreen);
  }, [gateway, setIsFullscreen]);

  const handleFavoriteCityIdsChange = useCallback(
    async (favoriteCityIds: string[]) => {
      const next = await gateway.settingsSet({ favoriteCityIds });
      persistSettings(next);
    },
    [gateway, persistSettings],
  );

  return {
    handleSelectFolder,
    handleStartIndexing,
    handleCancelIndexing,
    handleRetryIndexing,
    handleLanguageChange,
    handleWatchChange,
    handleSetActiveRoots,
    handleRemoveRoot,
    handleToggleFullscreen,
    handleFavoriteCityIdsChange,
  };
}
