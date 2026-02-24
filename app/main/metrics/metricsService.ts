import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { SessionMetricsSummary, UxEventName, UxEventProps, UxEventRecord } from '@shared/types/ipc';

interface SessionMetricsRecord {
  sessionId: string;
  startedAtMs: number;
  endedAtMs: number | null;
  events: UxEventRecord[];
}

interface MetricsStorageFile {
  version: 1;
  current: SessionMetricsRecord | null;
  sessions: SessionMetricsRecord[];
}

const STORAGE_VERSION = 1;
const HISTORY_LIMIT = 30;
const FUNNEL_STEPS: UxEventName[] = [
  'app_opened',
  'first_data_visible',
  'point_or_cluster_clicked',
  'timeline_opened',
  'trip_enabled',
  'source_opened',
];

const EVENT_NAMES: readonly UxEventName[] = [
  'app_opened',
  'first_data_visible',
  'point_or_cluster_clicked',
  'timeline_opened',
  'trip_enabled',
  'playback_started',
  'source_opened',
  'index_started',
  'index_completed',
  'index_failed',
] as const;

function isUxEventName(value: unknown): value is UxEventName {
  return typeof value === 'string' && EVENT_NAMES.includes(value as UxEventName);
}

function sanitizeProps(value: unknown): UxEventProps | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  const output: UxEventProps = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      output[key] = item;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function sanitizeEvent(value: unknown): UxEventRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<UxEventRecord>;
  if (!isUxEventName(raw.name) || typeof raw.atMs !== 'number' || !Number.isFinite(raw.atMs)) {
    return null;
  }
  return {
    name: raw.name,
    atMs: raw.atMs,
    props: sanitizeProps(raw.props),
  };
}

function sanitizeSession(value: unknown): SessionMetricsRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<SessionMetricsRecord>;
  if (typeof raw.sessionId !== 'string' || raw.sessionId.length === 0) {
    return null;
  }
  if (typeof raw.startedAtMs !== 'number' || !Number.isFinite(raw.startedAtMs)) {
    return null;
  }
  const endedAtMs = typeof raw.endedAtMs === 'number' && Number.isFinite(raw.endedAtMs) ? raw.endedAtMs : null;
  const eventsRaw = Array.isArray(raw.events) ? raw.events : [];
  const events = eventsRaw
    .map((item) => sanitizeEvent(item))
    .filter((item): item is UxEventRecord => item !== null)
    .sort((a, b) => a.atMs - b.atMs);
  return {
    sessionId: raw.sessionId,
    startedAtMs: raw.startedAtMs,
    endedAtMs,
    events,
  };
}

function createSession(nowMs = Date.now()): SessionMetricsRecord {
  return {
    sessionId: randomUUID(),
    startedAtMs: nowMs,
    endedAtMs: null,
    events: [],
  };
}

function findEventAtMs(session: SessionMetricsRecord, name: UxEventName): number | null {
  if (name === 'trip_enabled') {
    const tripEvent = session.events.find((event) => event.name === 'trip_enabled');
    if (tripEvent) {
      return tripEvent.atMs;
    }
    const playbackEvent = session.events.find((event) => event.name === 'playback_started');
    return playbackEvent ? playbackEvent.atMs : null;
  }
  const found = session.events.find((event) => event.name === name);
  return found ? found.atMs : null;
}

function toSummary(session: SessionMetricsRecord): SessionMetricsSummary {
  return {
    sessionId: session.sessionId,
    startedAtMs: session.startedAtMs,
    endedAtMs: session.endedAtMs,
    eventCount: session.events.length,
    funnel: FUNNEL_STEPS.map((step) => {
      const atMs = findEventAtMs(session, step);
      return {
        step,
        reached: atMs !== null,
        atMs,
        elapsedFromStartMs: atMs === null ? null : Math.max(0, atMs - session.startedAtMs),
      };
    }),
  };
}

export class MetricsService {
  private readonly metricsDir: string;
  private readonly sessionsPath: string;
  private readonly exportsDir: string;
  private hydrated = false;
  private currentSession: SessionMetricsRecord = createSession();
  private sessions: SessionMetricsRecord[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(appDataRoot: string) {
    this.metricsDir = path.join(appDataRoot, 'metrics');
    this.sessionsPath = path.join(this.metricsDir, 'sessions.json');
    this.exportsDir = path.join(this.metricsDir, 'exports');
  }

  private async ensureHydrated(): Promise<void> {
    if (this.hydrated) {
      return;
    }
    this.hydrated = true;

    try {
      await fs.mkdir(this.metricsDir, { recursive: true });
      const raw = await fs.readFile(this.sessionsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<MetricsStorageFile>;
      if (parsed.version !== STORAGE_VERSION) {
        this.currentSession = createSession();
        this.sessions = [];
        return;
      }

      const current = sanitizeSession(parsed.current);
      const storedSessions = Array.isArray(parsed.sessions)
        ? parsed.sessions
            .map((item) => sanitizeSession(item))
            .filter((item): item is SessionMetricsRecord => item !== null)
        : [];
      const shouldArchiveCurrent = Boolean(current && (current.events.length > 0 || current.endedAtMs !== null));
      const archivedCurrent = shouldArchiveCurrent && current
        ? {
            ...current,
            endedAtMs: current.endedAtMs ?? Date.now(),
          }
        : null;

      const sessions = [archivedCurrent, ...storedSessions]
        .filter((item): item is SessionMetricsRecord => item !== null)
        .filter((item, index, arr) => arr.findIndex((target) => target.sessionId === item.sessionId) === index)
        .sort((a, b) => b.startedAtMs - a.startedAtMs)
        .slice(0, HISTORY_LIMIT);

      this.currentSession = createSession();
      this.sessions = sessions;

      if (shouldArchiveCurrent) {
        await this.persist();
      }
    } catch {
      this.currentSession = createSession();
      this.sessions = [];
    }
  }

  private async persist(): Promise<void> {
    const payload: MetricsStorageFile = {
      version: STORAGE_VERSION,
      current: this.currentSession,
      sessions: this.sessions.slice(0, HISTORY_LIMIT),
    };

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(this.metricsDir, { recursive: true });
        await fs.writeFile(this.sessionsPath, JSON.stringify(payload, null, 2), 'utf-8');
      });
    await this.writeQueue;
  }

  private getRecentRecords(limit: number): SessionMetricsRecord[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return [this.currentSession, ...this.sessions]
      .sort((a, b) => b.startedAtMs - a.startedAtMs)
      .slice(0, safeLimit);
  }

  async track(payload: { name: UxEventName; props?: UxEventProps }): Promise<void> {
    await this.ensureHydrated();
    this.currentSession.events.push({
      name: payload.name,
      atMs: Date.now(),
      props: sanitizeProps(payload.props),
    });
    await this.persist();
  }

  async getSessionSummary(): Promise<SessionMetricsSummary> {
    await this.ensureHydrated();
    return toSummary(this.currentSession);
  }

  async listRecentSessions(limit: number): Promise<SessionMetricsSummary[]> {
    await this.ensureHydrated();
    return this.getRecentRecords(limit).map((record) => toSummary(record));
  }

  async exportRecentSessions(limit: number, format: 'json'): Promise<{ path: string }> {
    await this.ensureHydrated();
    const records = this.getRecentRecords(limit);
    if (format !== 'json') {
      throw new Error(`Unsupported export format: ${format}`);
    }

    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
    const filePath = path.join(this.exportsDir, `metrics-export-${stamp}.json`);
    await fs.mkdir(this.exportsDir, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          generatedAtMs: Date.now(),
          sessions: records.map((record) => ({
            ...toSummary(record),
            events: record.events,
          })),
        },
        null,
        2,
      ),
      'utf-8',
    );
    return { path: filePath };
  }

  async resetCurrentSession(): Promise<void> {
    await this.ensureHydrated();
    const finalized: SessionMetricsRecord = {
      ...this.currentSession,
      endedAtMs: this.currentSession.endedAtMs ?? Date.now(),
    };
    this.sessions = [finalized, ...this.sessions]
      .sort((a, b) => b.startedAtMs - a.startedAtMs)
      .slice(0, HISTORY_LIMIT);
    this.currentSession = createSession();
    await this.persist();
  }
}
