import { useEffect, useMemo, useRef } from 'react';

import type { Filters } from '@shared/types/settings';

import type { PhotoGlobeGateway } from '@renderer/infrastructure/photoGlobeGateway';
import { windowPhotoGlobeGateway } from '@renderer/infrastructure/windowPhotoGlobeGateway';
import { useAppStore } from '@renderer/store/useAppStore';

const IDLE_WAIT_MS = 2000;
const BATCH_SIZE = 150;
const MAX_IDS = 1200;
const SECOND_STAGE_IDS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function splitForConcurrency(ids: number[], parts: number): number[][] {
  const buckets: number[][] = Array.from({ length: parts }, () => []);
  for (let index = 0; index < ids.length; index += 1) {
    buckets[index % parts].push(ids[index]);
  }
  return buckets.filter((bucket) => bucket.length > 0);
}

function buildWarmupKey(filters: Filters): string {
  return JSON.stringify({
    dateFromMs: filters.dateFromMs ?? null,
    dateToMs: filters.dateToMs ?? null,
    includeUndated: filters.includeUndated ?? false,
    rootIds: filters.rootIds ?? [],
    mediaTypes: filters.mediaTypes ?? [],
    hasGps: filters.hasGps ?? null,
    cameraModelQuery: filters.cameraModelQuery ?? null,
    minWidthPx: filters.minWidthPx ?? null,
    minHeightPx: filters.minHeightPx ?? null,
    durationFromMs: filters.durationFromMs ?? null,
    durationToMs: filters.durationToMs ?? null,
  });
}

interface UseBackgroundWarmupParams {
  apiReady: boolean;
  filters: Filters;
  paused: boolean;
  gateway?: PhotoGlobeGateway;
}

export function useBackgroundWarmup({
  apiReady,
  filters,
  paused,
  gateway = windowPhotoGlobeGateway,
}: UseBackgroundWarmupParams) {
  const setWarmupStatus = useAppStore((state) => state.setWarmupStatus);
  const warmupKey = useMemo(() => buildWarmupKey(filters), [filters]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!apiReady || !gateway.isAvailable()) {
      return;
    }

    let cancelled = false;
    const lastInteractionAt = { value: Date.now() };
    const markInteraction = () => {
      lastInteractionAt.value = Date.now();
    };
    const isIdle = () => Date.now() - lastInteractionAt.value >= IDLE_WAIT_MS;

    window.addEventListener('pointermove', markInteraction, { passive: true });
    window.addEventListener('pointerdown', markInteraction, { passive: true });
    window.addEventListener('wheel', markInteraction, { passive: true });
    window.addEventListener('keydown', markInteraction);

    const waitUntilResumable = async () => {
      while (!cancelled) {
        if (!pausedRef.current && isIdle()) {
          return true;
        }
        setWarmupStatus((prev) => ({
          ...prev,
          running: true,
          stage: 'paused',
        }));
        await sleep(500);
      }
      return false;
    };

    void (async () => {
      setWarmupStatus({
        stage: 'idle',
        running: true,
        total: 0,
        processed: 0,
      });

      await sleep(IDLE_WAIT_MS);
      if (cancelled) return;

      if (!(await waitUntilResumable())) return;

      setWarmupStatus({
        stage: 'counting',
        running: true,
        total: 0,
        processed: 0,
      });

      try {
        const count = await gateway.mediaCountPrefetchTargets({ filters });
        const total = Math.max(0, Math.min(MAX_IDS, count.total));
        if (total === 0) {
          setWarmupStatus({
            stage: 'complete',
            running: false,
            total: 0,
            processed: 0,
          });
          return;
        }

        const ids: number[] = [];
        let offset = 0;
        while (!cancelled && ids.length < total) {
          if (!(await waitUntilResumable())) return;
          const page = await gateway.mediaGetPrefetchTargetIds({ filters, limit: BATCH_SIZE, offset });
          if (page.ids.length === 0) {
            break;
          }
          ids.push(...page.ids);
          offset += page.ids.length;
        }

        const trimmed = ids.slice(0, total);
        const secondStageTotal = Math.min(SECOND_STAGE_IDS, trimmed.length);
        setWarmupStatus({
          stage: 'warming64',
          running: true,
          total: trimmed.length + secondStageTotal,
          processed: 0,
        });

        let processed = 0;
        for (let index = 0; index < trimmed.length; index += BATCH_SIZE) {
          if (cancelled) return;
          if (!(await waitUntilResumable())) return;
          const batch = trimmed.slice(index, index + BATCH_SIZE);
          const groups = splitForConcurrency(batch, 2);
          await Promise.all(
            groups.map((group) => gateway.mediaPrefetchThumbnails({ photoIds: group, size: 64, priority: 'low' })),
          );
          processed += batch.length;
          setWarmupStatus((prev) => ({ ...prev, stage: 'warming64', processed }));
          await sleep(500);
        }

        const secondStageIds = trimmed.slice(0, secondStageTotal);
        setWarmupStatus((prev) => ({ ...prev, stage: 'warming128' }));
        for (let index = 0; index < secondStageIds.length; index += BATCH_SIZE) {
          if (cancelled) return;
          if (!(await waitUntilResumable())) return;
          const batch = secondStageIds.slice(index, index + BATCH_SIZE);
          const groups = splitForConcurrency(batch, 2);
          await Promise.all(
            groups.map((group) => gateway.mediaPrefetchThumbnails({ photoIds: group, size: 128, priority: 'low' })),
          );
          processed += batch.length;
          setWarmupStatus((prev) => ({ ...prev, stage: 'warming128', processed }));
          await sleep(500);
        }

        setWarmupStatus((prev) => ({
          ...prev,
          stage: 'complete',
          running: false,
          processed: prev.total,
        }));
      } catch (error) {
        if (cancelled) return;
        setWarmupStatus((prev) => ({
          ...prev,
          stage: 'error',
          running: false,
          message: error instanceof Error ? error.message : 'Warmup failed',
        }));
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('pointermove', markInteraction);
      window.removeEventListener('pointerdown', markInteraction);
      window.removeEventListener('wheel', markInteraction);
      window.removeEventListener('keydown', markInteraction);
      setWarmupStatus((prev) => ({
        ...prev,
        running: false,
      }));
    };
  }, [apiReady, gateway, setWarmupStatus, warmupKey]);
}
