import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import type { PhotoMetadataPatchInput, PhotosRepository } from '@main/db/repositories/photosRepo';
import type { RootsRepository } from '@main/db/repositories/rootsRepo';
import type { SettingsRepository } from '@main/db/repositories/settingsRepo';
import type { IndexStatus } from '@shared/types/ipc';
import type { MediaType, PhotoUpsertInput, ScanFile } from '@shared/types/photo';
import { sha1 } from '@shared/utils/hash';
import { normalizeFsPath } from '@shared/utils/path';
import { mergeRecentRoots } from '@shared/utils/recentRoots';

import { createDeltaPlan, createIncrementalPlan, type IncrementalPlan } from './incremental';
import { ExifMetadataExtractor } from './exifExtract';
import { scanMediaFiles, scanSpecificMediaFiles } from './scanner';
import { CancelledError, mapWithConcurrencyBatched } from './workerPool';

interface IndexCoordinatorOptions {
  photosRepo: PhotosRepository;
  rootsRepo: RootsRepository;
  settingsRepo: SettingsRepository;
  onDataChanged?: () => void;
}

interface MutableJob {
  cancelRequested: boolean;
  runToken: number;
  status: IndexStatus;
}

export interface IndexDeltaPayload {
  addedOrChangedPaths: string[];
  removedPaths: string[];
  overflow: boolean;
}

interface EnrichmentTarget {
  rootId: number;
  path: string;
  mediaType: MediaType;
}

interface EnrichmentTask {
  rootPath: string;
  token: number;
  jobId: string;
  targets: EnrichmentTarget[];
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function dedupePaths(paths: string[]): string[] {
  return Array.from(
    new Set(
      paths
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .map((item) => normalizeFsPath(item)),
    ),
  );
}

function needsEnrichment(row: PhotoUpsertInput): boolean {
  if (row.lat == null || row.lng == null || row.takenAtMs == null || row.width == null || row.height == null) {
    return true;
  }
  if (!row.cameraModel || row.cameraModel.trim().length === 0) {
    return true;
  }
  if (row.mediaType === 'video' && row.durationMs == null) {
    return true;
  }
  return false;
}

export class IndexCoordinator {
  private readonly jobs = new Map<string, MutableJob>();
  private readonly events = new EventEmitter();
  private readonly exifExtractor: ExifMetadataExtractor;
  private readonly indexConcurrency: number;
  private readonly enrichmentConcurrency = 2;
  private readonly batchSize = 256;
  private readonly enrichmentQueue: EnrichmentTask[] = [];
  private readonly enrichmentTokenByRoot = new Map<string, number>();
  private readonly indexRunTokenByRoot = new Map<string, number>();
  private enrichmentRunning = 0;

  constructor(private readonly options: IndexCoordinatorOptions) {
    const cpuCount = Math.max(2, os.cpus().length);
    const envIndexConcurrency = parsePositiveInt(process.env.PHOTOGLOBE_INDEX_CONCURRENCY);
    const envExifPool = parsePositiveInt(process.env.PHOTOGLOBE_EXIF_POOL);
    this.indexConcurrency = Math.max(1, Math.min(16, envIndexConcurrency ?? Math.min(8, cpuCount)));
    const exifPoolSize = Math.max(1, Math.min(12, envExifPool ?? Math.min(4, cpuCount)));
    this.exifExtractor = new ExifMetadataExtractor(exifPoolSize);
  }

  async dispose(): Promise<void> {
    await this.exifExtractor.shutdown();
  }

  onProgress(listener: (progress: IndexStatus) => void): () => void {
    this.events.on('progress', listener);
    return () => this.events.off('progress', listener);
  }

  start(rootPath: string): string {
    return this.startFull(rootPath);
  }

  startFull(rootPath: string): string {
    const normalizedRoot = normalizeFsPath(rootPath);
    this.bumpEnrichmentToken(normalizedRoot);
    const runToken = this.bumpIndexRunToken(normalizedRoot);
    return this.createAndRunJob(normalizedRoot, runToken, 'full');
  }

  startDelta(rootPath: string, delta: IndexDeltaPayload): string {
    const normalizedRoot = normalizeFsPath(rootPath);
    if (delta.overflow) {
      return this.startFull(normalizedRoot);
    }
    this.bumpEnrichmentToken(normalizedRoot);
    const runToken = this.bumpIndexRunToken(normalizedRoot);
    const normalizedDelta: IndexDeltaPayload = {
      addedOrChangedPaths: dedupePaths(delta.addedOrChangedPaths),
      removedPaths: dedupePaths(delta.removedPaths),
      overflow: false,
    };
    return this.createAndRunJob(normalizedRoot, runToken, 'delta', normalizedDelta);
  }

  enqueueEnrichment(rootPath: string, targets: EnrichmentTarget[], jobId: string): void {
    const normalizedRoot = normalizeFsPath(rootPath);
    const uniqueTargets = Array.from(
      new Map(targets.map((item) => [item.path, { ...item, path: normalizeFsPath(item.path) }])).values(),
    );
    if (uniqueTargets.length === 0) {
      return;
    }

    const token = this.bumpEnrichmentToken(normalizedRoot);
    this.enrichmentQueue.push({
      rootPath: normalizedRoot,
      token,
      jobId,
      targets: uniqueTargets,
    });
    this.drainEnrichmentQueue();
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }
    job.cancelRequested = true;
    return true;
  }

  getStatus(jobId: string): IndexStatus | null {
    return this.jobs.get(jobId)?.status ?? null;
  }

  private createAndRunJob(
    rootPath: string,
    runToken: number,
    mode: 'full' | 'delta',
    delta?: IndexDeltaPayload,
  ): string {
    const jobId = randomUUID();
    const status: IndexStatus = {
      jobId,
      rootPath,
      phase: 'idle',
      scanned: 0,
      queued: 0,
      processed: 0,
      indexed: 0,
      skipped: 0,
      errored: 0,
      percent: 0,
      startedAtMs: Date.now(),
      finishedAtMs: null,
    };
    this.jobs.set(jobId, { cancelRequested: false, runToken, status });
    this.emitStatus(status);
    void this.runJob(jobId, mode, delta);
    return jobId;
  }

  private updateRecentRoots(rootPath: string): void {
    const settings = this.options.settingsRepo.getSettings();
    const merged = mergeRecentRoots(settings.recentRoots, rootPath);
    this.options.settingsRepo.setSettings({ recentRoots: merged });
  }

  private async runJob(jobId: string, mode: 'full' | 'delta', delta?: IndexDeltaPayload): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    try {
      const root = this.options.rootsRepo.ensure(job.status.rootPath);
      this.updateRecentRoots(job.status.rootPath);

      this.setPhase(job, 'scanning');
      const existing = this.options.photosRepo.getExistingByRoot(root.id);
      const { plan, scannedCount } = await this.buildPlan(mode, job.status.rootPath, delta, existing);
      job.status.scanned = scannedCount;
      job.status.queued = plan.toProcess.length;
      job.status.skipped = plan.unchangedCount;
      this.emitStatus(job.status);

      this.throwIfCancelled(job);
      this.setPhase(job, 'extracting');

      const enrichmentTargets: EnrichmentTarget[] = [];
      const enrichmentSeen = new Set<string>();
      const nowMs = Date.now();

      if (plan.toProcess.length > 0) {
        await mapWithConcurrencyBatched(
          plan.toProcess,
          this.indexConcurrency,
          async (file, index) => this.extractFileQuick(root.id, file, index),
          {
            batchSize: this.batchSize,
            isCancelled: () => job.cancelRequested,
            onItemDone: () => {
              job.status.processed += 1;
              job.status.percent = this.getExtractingPercent(job.status.processed, job.status.queued);
              this.emitStatus(job.status);
            },
            onBatch: async (batch) => {
              this.options.photosRepo.upsertBatch(batch);
              for (const row of batch) {
                if (row.lastError) {
                  job.status.errored += 1;
                } else {
                  job.status.indexed += 1;
                }
                if (needsEnrichment(row) && !enrichmentSeen.has(row.path)) {
                  enrichmentSeen.add(row.path);
                  enrichmentTargets.push({
                    rootId: row.rootId,
                    path: row.path,
                    mediaType: row.mediaType,
                  });
                }
              }
            },
          },
        );
      } else {
        job.status.percent = 90;
        this.emitStatus(job.status);
      }

      this.throwIfCancelled(job);
      this.setPhase(job, 'saving');

      if (plan.toRestore.length > 0) {
        this.options.photosRepo.restoreByPaths(plan.toRestore, nowMs);
      }
      if (plan.toDelete.length > 0) {
        this.options.photosRepo.markDeletedByPaths(root.id, plan.toDelete, nowMs);
      }
      job.status.percent = 99;
      this.emitStatus(job.status);

      this.options.rootsRepo.setLastScan(root.id, Date.now());
      this.options.onDataChanged?.();
      this.complete(job, 'complete');

      if (this.isLatestIndexRun(job.status.rootPath, job.runToken)) {
        this.enqueueEnrichment(job.status.rootPath, enrichmentTargets, job.status.jobId);
      }
    } catch (error) {
      if (error instanceof CancelledError || job.cancelRequested) {
        this.complete(job, 'cancelled');
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown indexing error';
      this.complete(job, 'error', message);
    }
  }

  private async buildPlan(
    mode: 'full' | 'delta',
    rootPath: string,
    delta: IndexDeltaPayload | undefined,
    existing: Map<string, { id: number; path: string; mtimeMs: number; sizeBytes: number; isDeleted: number }>,
  ): Promise<{ plan: IncrementalPlan; scannedCount: number }> {
    if (mode === 'full') {
      const scannedFiles = await scanMediaFiles(rootPath);
      return {
        plan: createIncrementalPlan(scannedFiles, existing),
        scannedCount: scannedFiles.length,
      };
    }

    const fallbackDelta = delta ?? { addedOrChangedPaths: [], removedPaths: [], overflow: true };
    if (fallbackDelta.overflow) {
      const scannedFiles = await scanMediaFiles(rootPath);
      return {
        plan: createIncrementalPlan(scannedFiles, existing),
        scannedCount: scannedFiles.length,
      };
    }

    const scanTargets = dedupePaths(fallbackDelta.addedOrChangedPaths);
    const removedTargets = dedupePaths(fallbackDelta.removedPaths);
    const scannedFiles = await scanSpecificMediaFiles(scanTargets);
    const scannedSet = new Set(scannedFiles.map((file) => normalizeFsPath(file.path)));
    const missingAsRemoved = scanTargets.filter((pathItem) => !scannedSet.has(pathItem));
    const plan = createDeltaPlan(scannedFiles, [...removedTargets, ...missingAsRemoved], existing);
    return {
      plan,
      scannedCount: scanTargets.length + removedTargets.length,
    };
  }

  private async extractFileQuick(rootId: number, file: ScanFile, workerHint: number): Promise<PhotoUpsertInput> {
    const now = Date.now();
    try {
      const metadata = await this.exifExtractor.extractQuick(file.path, file.mediaType, workerHint);
      return {
        rootId,
        path: file.path,
        pathHash: sha1(file.path),
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtimeMs,
        mediaType: file.mediaType,
        mime: file.mime,
        lat: metadata.lat,
        lng: metadata.lng,
        alt: metadata.alt,
        takenAtMs: metadata.takenAtMs,
        width: metadata.width,
        height: metadata.height,
        durationMs: metadata.durationMs,
        cameraModel: metadata.cameraModel,
        thumbPath: null,
        thumbUpdatedAtMs: null,
        lastIndexedAtMs: now,
        lastError: null,
      };
    } catch (error) {
      const errorText = error instanceof Error ? error.message.slice(0, 400) : 'Metadata extraction failed';
      return {
        rootId,
        path: file.path,
        pathHash: sha1(file.path),
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtimeMs,
        mediaType: file.mediaType,
        mime: file.mime,
        lat: null,
        lng: null,
        alt: null,
        takenAtMs: null,
        width: null,
        height: null,
        durationMs: null,
        cameraModel: null,
        thumbPath: null,
        thumbUpdatedAtMs: null,
        lastIndexedAtMs: now,
        lastError: errorText,
      };
    }
  }

  private async extractEnrichment(target: EnrichmentTarget, workerHint: number): Promise<PhotoMetadataPatchInput> {
    const now = Date.now();
    try {
      const metadata = await this.exifExtractor.extractFull(target.path, target.mediaType, workerHint);
      return {
        rootId: target.rootId,
        path: target.path,
        lat: metadata.lat,
        lng: metadata.lng,
        alt: metadata.alt,
        takenAtMs: metadata.takenAtMs,
        width: metadata.width,
        height: metadata.height,
        durationMs: metadata.durationMs,
        cameraModel: metadata.cameraModel,
        lastIndexedAtMs: now,
        lastError: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 400) : 'Metadata enrichment failed';
      return {
        rootId: target.rootId,
        path: target.path,
        lat: null,
        lng: null,
        alt: null,
        takenAtMs: null,
        width: null,
        height: null,
        durationMs: null,
        cameraModel: null,
        lastIndexedAtMs: now,
        lastError: message,
      };
    }
  }

  private drainEnrichmentQueue(): void {
    if (this.enrichmentRunning >= 1) {
      return;
    }
    const nextTask = this.enrichmentQueue.shift();
    if (!nextTask) {
      return;
    }
    if (this.isEnrichmentCancelled(nextTask)) {
      this.drainEnrichmentQueue();
      return;
    }

    this.enrichmentRunning += 1;
    void this.runEnrichmentTask(nextTask)
      .catch(() => {})
      .finally(() => {
        this.enrichmentRunning = Math.max(0, this.enrichmentRunning - 1);
        this.drainEnrichmentQueue();
      });
  }

  private async runEnrichmentTask(task: EnrichmentTask): Promise<void> {
    if (task.targets.length === 0 || this.isEnrichmentCancelled(task)) {
      this.setJobMessage(task.jobId, undefined);
      return;
    }

    let processed = 0;
    this.setJobMessage(task.jobId, `enriching ${processed}/${task.targets.length}`);

    try {
      await mapWithConcurrencyBatched(
        task.targets,
        this.enrichmentConcurrency,
        async (target, index) => this.extractEnrichment(target, index),
        {
          batchSize: this.batchSize,
          isCancelled: () => this.isEnrichmentCancelled(task),
          onItemDone: () => {
            processed += 1;
            this.setJobMessage(task.jobId, `enriching ${processed}/${task.targets.length}`);
          },
          onBatch: async (batch) => {
            if (this.isEnrichmentCancelled(task)) {
              throw new CancelledError('Enrichment cancelled');
            }
            this.options.photosRepo.patchMetadataBatch(batch);
          },
        },
      );
      if (!this.isEnrichmentCancelled(task)) {
        this.options.onDataChanged?.();
      }
    } catch (error) {
      if (!(error instanceof CancelledError)) {
        this.setJobMessage(task.jobId, 'enrichment failed');
      }
    } finally {
      if (!this.isEnrichmentCancelled(task)) {
        this.setJobMessage(task.jobId, undefined);
      }
    }
  }

  private setJobMessage(jobId: string, message: string | undefined): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    job.status.message = message;
    this.emitStatus(job.status);
  }

  private bumpEnrichmentToken(rootPath: string): number {
    const normalizedRoot = normalizeFsPath(rootPath);
    const nextToken = (this.enrichmentTokenByRoot.get(normalizedRoot) ?? 0) + 1;
    this.enrichmentTokenByRoot.set(normalizedRoot, nextToken);
    return nextToken;
  }

  private bumpIndexRunToken(rootPath: string): number {
    const normalizedRoot = normalizeFsPath(rootPath);
    const nextToken = (this.indexRunTokenByRoot.get(normalizedRoot) ?? 0) + 1;
    this.indexRunTokenByRoot.set(normalizedRoot, nextToken);
    return nextToken;
  }

  private isLatestIndexRun(rootPath: string, runToken: number): boolean {
    return this.indexRunTokenByRoot.get(normalizeFsPath(rootPath)) === runToken;
  }

  private isEnrichmentCancelled(task: EnrichmentTask): boolean {
    return this.enrichmentTokenByRoot.get(task.rootPath) !== task.token;
  }

  private throwIfCancelled(job: MutableJob): void {
    if (job.cancelRequested) {
      throw new CancelledError();
    }
  }

  private getExtractingPercent(processed: number, total: number): number {
    if (total === 0) {
      return 90;
    }
    return Math.max(10, Math.min(90, Math.round((processed / total) * 90)));
  }

  private setPhase(job: MutableJob, phase: IndexStatus['phase']): void {
    job.status.phase = phase;
    this.emitStatus(job.status);
  }

  private complete(job: MutableJob, phase: IndexStatus['phase'], message?: string): void {
    job.status.phase = phase;
    job.status.percent = phase === 'complete' ? 100 : job.status.percent;
    job.status.finishedAtMs = Date.now();
    job.status.message = message;
    this.emitStatus(job.status);
  }

  private emitStatus(status: IndexStatus): void {
    this.events.emit('progress', { ...status });
  }
}
