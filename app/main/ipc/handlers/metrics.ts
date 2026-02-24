import { IPC_CHANNELS } from '@main/ipc/channels';
import type { IpcContext } from '@main/ipc/context';
import type { SessionMetricsSummary, UxEventName, UxEventProps } from '@shared/types/ipc';

const EMPTY_SUMMARY: SessionMetricsSummary = {
  sessionId: 'unavailable',
  startedAtMs: Date.now(),
  endedAtMs: null,
  eventCount: 0,
  funnel: [
    { step: 'app_opened', reached: false, atMs: null, elapsedFromStartMs: null },
    { step: 'first_data_visible', reached: false, atMs: null, elapsedFromStartMs: null },
    { step: 'point_or_cluster_clicked', reached: false, atMs: null, elapsedFromStartMs: null },
    { step: 'timeline_opened', reached: false, atMs: null, elapsedFromStartMs: null },
    { step: 'trip_enabled', reached: false, atMs: null, elapsedFromStartMs: null },
    { step: 'source_opened', reached: false, atMs: null, elapsedFromStartMs: null },
  ],
};

export function registerMetricsHandlers({ ipcMain, metricsService }: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.METRICS_TRACK,
    async (_event, payload: { name: UxEventName; props?: UxEventProps }) => {
      try {
        await metricsService.track(payload);
      } catch {
        // fail-open by design
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.METRICS_GET_SESSION_SUMMARY, async () => {
    try {
      return await metricsService.getSessionSummary();
    } catch {
      return EMPTY_SUMMARY;
    }
  });

  ipcMain.handle(IPC_CHANNELS.METRICS_LIST_RECENT_SESSIONS, async (_event, payload: { limit: number }) => {
    try {
      return await metricsService.listRecentSessions(payload.limit);
    } catch {
      return [] as SessionMetricsSummary[];
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.METRICS_EXPORT_RECENT_SESSIONS,
    async (_event, payload: { limit: number; format: 'json' }) => {
      try {
        return await metricsService.exportRecentSessions(payload.limit, payload.format);
      } catch {
        return { path: '' };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.METRICS_RESET_CURRENT_SESSION, async () => {
    try {
      await metricsService.resetCurrentSession();
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  });
}

