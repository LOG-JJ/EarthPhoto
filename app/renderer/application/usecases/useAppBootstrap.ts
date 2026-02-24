import { useEffect, useRef } from 'react';

import { useAppStore } from '@renderer/store/useAppStore';
import { trackUxEvent } from '@renderer/application/metrics/uxMetrics';

import type { PhotoGlobeGateway } from '@renderer/infrastructure/photoGlobeGateway';
import { windowPhotoGlobeGateway } from '@renderer/infrastructure/windowPhotoGlobeGateway';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useAppBootstrap(gateway: PhotoGlobeGateway = windowPhotoGlobeGateway): boolean {
  const apiReady = useAppStore((state) => state.apiReady);
  const setApiReady = useAppStore((state) => state.setApiReady);
  const setSettings = useAppStore((state) => state.setSettings);
  const setRootPath = useAppStore((state) => state.setRootPath);
  const setIsFullscreen = useAppStore((state) => state.setIsFullscreen);
  const updateIndexProgress = useAppStore((state) => state.updateIndexProgress);
  const trackedTerminalJobIdsRef = useRef<Set<string>>(new Set());
  const trackedAppOpenedRef = useRef(false);

  useEffect(() => {
    if (apiReady) return;

    let retryCount = 0;
    const timer = window.setInterval(() => {
      if (gateway.isAvailable()) {
        setApiReady(true);
        window.clearInterval(timer);
        return;
      }
      retryCount += 1;
      if (retryCount >= 20) {
        gateway.reloadWindow();
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [apiReady, gateway, setApiReady]);

  useEffect(() => {
    if (!apiReady) return;
    return gateway.indexOnProgress((progress) => {
      updateIndexProgress(progress);
      if (progress.phase === 'complete' && !trackedTerminalJobIdsRef.current.has(progress.jobId)) {
        trackedTerminalJobIdsRef.current.add(progress.jobId);
        void trackUxEvent(gateway, 'index_completed', {
          jobId: progress.jobId,
          rootPath: progress.rootPath,
          indexed: progress.indexed,
          errored: progress.errored,
        });
      }
      if (progress.phase === 'error' && !trackedTerminalJobIdsRef.current.has(progress.jobId)) {
        trackedTerminalJobIdsRef.current.add(progress.jobId);
        void trackUxEvent(gateway, 'index_failed', {
          jobId: progress.jobId,
          rootPath: progress.rootPath,
          message: progress.message ?? 'unknown',
        });
      }
    });
  }, [apiReady, gateway, updateIndexProgress]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < 20 && !cancelled; attempt += 1) {
        try {
          const [saved, windowState] = await Promise.all([
            gateway.settingsGet(),
            gateway.appGetWindowState(),
          ]);
          if (cancelled) {
            return;
          }
          setIsFullscreen(windowState.isFullScreen);
          setSettings(saved);
          setRootPath(saved.recentRoots[0] ?? null);
          await gateway.i18nChangeLanguage(saved.language);
          if (!trackedAppOpenedRef.current) {
            trackedAppOpenedRef.current = true;
            await trackUxEvent(gateway, 'app_opened', { language: saved.language });
          }
          return;
        } catch {
          await sleep(300);
        }
      }

      if (!cancelled) {
        console.error('[bootstrap] Failed to initialize settings/window state after retries');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiReady, gateway, setIsFullscreen, setRootPath, setSettings]);

  useEffect(() => {
    if (!apiReady) return;

    const syncWindowState = () => {
      window.setTimeout(() => {
        void gateway.appGetWindowState().then((state) => {
          setIsFullscreen(state.isFullScreen);
        });
      }, 70);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F11' || event.key === 'Escape' || (event.altKey && event.key === 'Enter')) {
        syncWindowState();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [apiReady, gateway, setIsFullscreen]);

  return apiReady;
}
