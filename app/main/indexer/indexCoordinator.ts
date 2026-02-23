import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import type { PhotosRepository } from '@main/db/repositories/photosRepo';
import type { RootsRepository } from '@main/db/repositories/rootsRepo';
import type { SettingsRepository } from '@main/db/repositories/settingsRepo';
import type { IndexStatus } from '@shared/types/ipc';
import type { PhotoUpsertInput, ScanFile } from '@shared/types/photo';
import { sha1 } from '@shared/utils/hash';
import { normalizeFsPath } from '@shared/utils/path';

import { createIncrementalPlan } from './incremental';
import { ExifMetadataExtractor } from './exifExtract';
import { scanMediaFiles } from './scanner';
import { CancelledError, mapWithConcurrency } from './workerPool';

interface IndexCoordinatorOptions {
  photosRepo: PhotosRepository;
  rootsRepo: RootsRepository;
  settingsRepo: SettingsRepository;
  onDataChanged?: () => void;
}

interface MutableJob {
  cancelRequested: boolean;
  status: IndexStatus;
}

export class IndexCoordinator {
  private readonly jobs = new Map<string, MutableJob>();
  private readonly events = new EventEmitter();
  private readonly exifExtractor: ExifMetadataExtractor;
  private readonly concurrency: number;
  private readonly batchSize = 700;

  constructor(private readonly options: IndexCoordinatorOptions) {
    const cpuCount = Math.max(2, os.cpus().length);
    this.concurrency = Math.max(6, Math.min(24, cpuCount * 3));
    this.exifExtractor = new ExifMetadataExtractor(Math.max(3, Math.min(12, cpuCount)));
  }

  async dispose(): Promise<void> {
    await this.exifExtractor.shutdown();
  }

  onProgress(listener: (progress: IndexStatus) => void): () => void {
    this.events.on('progress', listener);
    return () => this.events.off('progress', listener);
  }

  start(rootPath: string): string {
    const normalizedRoot = normalizeFsPath(rootPath);
    const jobId = randomUUID();
    const status: IndexStatus = {
      jobId,
      rootPath: normalizedRoot,
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
    this.jobs.set(jobId, { cancelRequested: false, status });
    this.emitStatus(status);
    void this.runJob(jobId);
    return jobId;
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

  private updateRecentRoots(rootPath: string): void {
    const settings = this.options.settingsRepo.getSettings();
    const merged = [rootPath, ...settings.recentRoots.filter((item) => item !== rootPath)].slice(0, 10);
    this.options.settingsRepo.setSettings({ recentRoots: merged });
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    let scannedFiles: ScanFile[] = [];
    let rootId: number | null = null;

    try {
      const root = this.options.rootsRepo.ensure(job.status.rootPath);
      rootId = root.id;
      this.updateRecentRoots(job.status.rootPath);

      this.setPhase(job, 'scanning');
      scannedFiles = await scanMediaFiles(job.status.rootPath);
      job.status.scanned = scannedFiles.length;
      this.emitStatus(job.status);

      this.throwIfCancelled(job);

      const existing = this.options.photosRepo.getExistingByRoot(root.id);
      const plan = createIncrementalPlan(scannedFiles, existing);
      job.status.queued = plan.toProcess.length;
      job.status.skipped = plan.unchangedPaths.length;

      this.options.photosRepo.markAllDeleted(root.id);
      this.options.photosRepo.restoreUnchanged(plan.unchangedPaths, Date.now());

      this.setPhase(job, 'extracting');

      const extractedRows = await mapWithConcurrency(
        plan.toProcess,
        this.concurrency,
        async (file, index) => this.extractFile(root.id, file, index),
        {
          isCancelled: () => job.cancelRequested,
          onItemDone: () => {
            job.status.processed += 1;
            job.status.percent = this.getExtractingPercent(job.status.processed, job.status.queued);
            this.emitStatus(job.status);
          },
        },
      );

      this.throwIfCancelled(job);
      this.setPhase(job, 'saving');

      for (let index = 0; index < extractedRows.length; index += this.batchSize) {
        this.throwIfCancelled(job);
        const batch = extractedRows.slice(index, index + this.batchSize);
        this.options.photosRepo.upsertBatch(batch);
        for (const row of batch) {
          if (row.lastError) {
            job.status.errored += 1;
          } else {
            job.status.indexed += 1;
          }
        }
        job.status.percent = Math.min(99, this.getSavingPercent(index + batch.length, extractedRows.length));
        this.emitStatus(job.status);
      }

      this.options.rootsRepo.setLastScan(root.id, Date.now());
      this.options.onDataChanged?.();
      this.complete(job, 'complete');
    } catch (error) {
      if (rootId !== null && scannedFiles.length > 0) {
        // Roll back deletion markers if indexing didn't finish.
        this.options.photosRepo.restoreUnchanged(
          scannedFiles.map((file) => file.path),
          Date.now(),
        );
      }

      if (error instanceof CancelledError || job.cancelRequested) {
        this.complete(job, 'cancelled');
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown indexing error';
      this.complete(job, 'error', message);
    }
  }

  private async extractFile(rootId: number, file: ScanFile, workerHint: number): Promise<PhotoUpsertInput> {
    const now = Date.now();
    try {
      const metadata = await this.exifExtractor.extract(file.path, file.mediaType, workerHint);
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

  private getSavingPercent(saved: number, total: number): number {
    if (total === 0) {
      return 95;
    }
    return 90 + Math.round((saved / total) * 9);
  }

  private setPhase(job: MutableJob, phase: IndexStatus['phase']): void {
    job.status.phase = phase;
    this.emitStatus(job.status);
  }

  private complete(job: MutableJob, phase: IndexStatus['phase'], message?: string): void {
    job.status.phase = phase;
    job.status.percent = phase === 'complete' ? 100 : job.status.percent;
    job.status.finishedAtMs = Date.now();
    if (message) {
      job.status.message = message;
    }
    this.emitStatus(job.status);
  }

  private emitStatus(status: IndexStatus): void {
    this.events.emit('progress', { ...status });
  }
}
