import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PhotosRepository } from '@main/db/repositories/photosRepo';
import sharp from 'sharp';
import type {
  DateMediaCountItem,
  HoverPreviewInfo,
  MediaSourceInfo,
  PreviewStripProgressPayload,
  PreviewStripRequestPayload,
  ThumbnailPriority,
  TimelineExtentInfo,
} from '@shared/types/ipc';
import type { Filters } from '@shared/types/settings';

import { ensureThumbnailDir, getHoverPreviewPath, getPlaceholderPath, getThumbnailPath } from './cachePath';
import { createImageThumbnail } from './imageThumb';
import { createVideoHoverPreview } from './videoHoverPreview';
import { createVideoThumbnail } from './videoThumb';

interface ThumbnailResult {
  path: string;
  cacheHit: boolean;
}

interface GenerationJob {
  key: string;
  priority: ThumbnailPriority;
  started: boolean;
  task: () => Promise<void>;
}

interface InFlightThumbnailTask {
  promise: Promise<ThumbnailResult>;
}

interface FailureState {
  failedAtMs: number;
  placeholderPath: string;
}

interface PreviewStripState {
  requestId: string;
  size: 64 | 128;
  cancelled: boolean;
  done: number;
  total: number;
  highQueue: number[];
  normalQueue: number[];
  lowQueue: number[];
  runningHighWorkers: number;
  runningBackgroundWorkers: number;
  emit: (progress: PreviewStripProgressPayload) => void;
}

const BASE_HIGH_CONCURRENCY = 1;
const BASE_BACKGROUND_CONCURRENCY = 1;
const BURST_WINDOW_MS = 1_600;
const BURST_HIGH_CONCURRENCY = 4;
const BURST_BACKGROUND_CONCURRENCY = 1;

function priorityWeight(priority: ThumbnailPriority): number {
  if (priority === 'high') {
    return 3;
  }
  if (priority === 'normal') {
    return 2;
  }
  return 1;
}

export class ThumbnailService {
  private readonly inFlight = new Map<string, InFlightThumbnailTask>();
  private readonly memoryCache = new Map<string, ThumbnailResult>();
  private readonly hoverInFlight = new Map<string, Promise<HoverPreviewInfo>>();
  private readonly hoverMemoryCache = new Map<string, HoverPreviewInfo>();
  private readonly maxMemoryItems = 800;
  private readonly maxHoverMemoryItems = 320;
  private readonly generationHighQueue: GenerationJob[] = [];
  private readonly generationNormalQueue: GenerationJob[] = [];
  private readonly generationLowQueue: GenerationJob[] = [];
  private readonly generationJobs = new Map<string, GenerationJob>();
  private readonly failureByKey = new Map<string, FailureState>();
  private readonly previewStripRequests = new Map<string, PreviewStripState>();
  private readonly failureCooldownMs = 10 * 60 * 1000;
  private runningGenerationCount = 0;
  private runningHighPriorityCount = 0;
  private runningBackgroundCount = 0;
  private burstUntilMs = 0;
  private burstResetTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly photosRepo: PhotosRepository,
    private readonly cacheRoot: string,
  ) {
    // Keep thumbnail generation responsive under load by limiting per-image libvips threads.
    const sharpThreads = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
    sharp.concurrency(sharpThreads);
    sharp.cache({
      memory: 64,
      items: 256,
      files: 0,
    });
  }

  async getThumbnail(photoId: number, size: 64 | 128 | 256 | 512, priority: ThumbnailPriority = 'normal'): Promise<ThumbnailResult> {
    const cacheKey = `${photoId}:${size}`;
    const memoized = this.memoryCache.get(cacheKey);
    if (memoized) {
      this.touchCache(cacheKey, memoized);
      return { ...memoized, cacheHit: true };
    }

    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      this.promoteGenerationJob(cacheKey, priority);
      return pending.promise;
    }

    const failure = this.failureByKey.get(cacheKey);
    if (failure && Date.now() - failure.failedAtMs < this.failureCooldownMs) {
      const fallbackPath = await this.findFallbackThumbPathByPhotoId(photoId, size);
      if (fallbackPath) {
        const recovered = { path: fallbackPath, cacheHit: true };
        this.failureByKey.delete(cacheKey);
        this.touchCache(cacheKey, recovered);
        return recovered;
      }
      try {
        await fs.access(failure.placeholderPath);
        const cachedFailure = { path: failure.placeholderPath, cacheHit: true };
        this.touchCache(cacheKey, cachedFailure);
        return cachedFailure;
      } catch {
        this.failureByKey.delete(cacheKey);
      }
    }

    const task = this.getThumbnailInternal(photoId, size, cacheKey, priority);
    this.inFlight.set(cacheKey, { promise: task });
    try {
      return await task;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  async prefetchThumbnails(
    photoIds: number[],
    size: 64 | 128 | 256 | 512,
    priority: ThumbnailPriority = 'low',
  ): Promise<{ queued: number }> {
    const uniqueIds = [...new Set(photoIds)].filter((id) => Number.isInteger(id) && id > 0).slice(0, 500);
    for (const photoId of uniqueIds) {
      void this.getThumbnail(photoId, size, priority).catch(() => {});
    }
    return { queued: uniqueIds.length };
  }

  requestPreviewStrip(
    payload: PreviewStripRequestPayload,
    emit: (progress: PreviewStripProgressPayload) => void,
  ): { ok: boolean } {
    const requestId = payload.requestId.trim();
    if (!requestId) {
      return { ok: false };
    }

    this.cancelPreviewStrip(requestId);

    const uniqueIds = [...new Set(payload.photoIds)].filter((id) => Number.isInteger(id) && id > 0).slice(0, 1_000);
    const safeVisibleCount = Math.max(1, Math.min(200, Math.trunc(payload.visibleCount) || 1));
    const highCount = Math.min(uniqueIds.length, safeVisibleCount);
    const normalCount = Math.min(Math.max(0, uniqueIds.length - highCount), safeVisibleCount);
    const highQueue = uniqueIds.slice(0, highCount);
    const normalQueue = uniqueIds.slice(highCount, highCount + normalCount);
    const lowQueue = uniqueIds.slice(highCount + normalCount);

    const state: PreviewStripState = {
      requestId,
      size: payload.size,
      cancelled: false,
      done: 0,
      total: uniqueIds.length,
      highQueue,
      normalQueue,
      lowQueue,
      runningHighWorkers: 0,
      runningBackgroundWorkers: 0,
      emit,
    };
    this.previewStripRequests.set(requestId, state);

    if (payload.burst === 'aggressive') {
      this.activateBurstWindow(BURST_WINDOW_MS);
    }

    if (state.total === 0) {
      emit({
        requestId: state.requestId,
        photoId: 0,
        path: null,
        cacheHit: true,
        done: 0,
        total: 0,
        status: 'complete',
      });
      this.previewStripRequests.delete(state.requestId);
      return { ok: true };
    }

    this.pumpPreviewStripWorkers(state);
    return { ok: true };
  }

  cancelPreviewStrip(requestId: string): { ok: boolean } {
    const state = this.previewStripRequests.get(requestId);
    if (!state) {
      return { ok: true };
    }

    state.cancelled = true;
    state.highQueue.length = 0;
    state.normalQueue.length = 0;
    state.lowQueue.length = 0;
    this.previewStripRequests.delete(requestId);
    state.emit({
      requestId: state.requestId,
      photoId: 0,
      path: null,
      cacheHit: false,
      done: state.done,
      total: state.total,
      status: 'cancelled',
    });
    return { ok: true };
  }

  countPrefetchTargets(filters: Filters): { total: number } {
    return {
      total: this.photosRepo.countPrefetchTargets(filters),
    };
  }

  getPrefetchTargetIds(filters: Filters, limit: number, offset: number): { ids: number[] } {
    return {
      ids: this.photosRepo.getPrefetchTargetIds(filters, limit, offset),
    };
  }

  getTimelineExtent(filters: Filters): TimelineExtentInfo {
    return this.photosRepo.getTimelineExtent(filters);
  }

  getDailyCounts(filters: Filters, limit?: number): DateMediaCountItem[] {
    return this.photosRepo.getDailyCounts(filters, limit);
  }

  getSource(photoId: number): MediaSourceInfo {
    const photo = this.photosRepo.getById(photoId);
    if (!photo) {
      throw new Error(`Photo not found: ${photoId}`);
    }

    return {
      path: photo.path,
      mediaType: photo.mediaType,
      mime: photo.mime,
    };
  }

  async getHoverPreview(photoId: number, width: 240 | 320 | 480): Promise<HoverPreviewInfo> {
    const cacheKey = `hover:${photoId}:${width}`;
    const memoized = this.hoverMemoryCache.get(cacheKey);
    if (memoized) {
      this.touchHoverCache(cacheKey, memoized);
      return { ...memoized, cacheHit: true };
    }

    const pending = this.hoverInFlight.get(cacheKey);
    if (pending) {
      return pending;
    }

    const task = this.getHoverPreviewInternal(photoId, width, cacheKey);
    this.hoverInFlight.set(cacheKey, task);
    try {
      return await task;
    } finally {
      this.hoverInFlight.delete(cacheKey);
    }
  }

  private async getHoverPreviewInternal(
    photoId: number,
    width: 240 | 320 | 480,
    cacheKey: string,
  ): Promise<HoverPreviewInfo> {
    const photo = this.photosRepo.getById(photoId);
    if (!photo) {
      throw new Error(`Photo not found: ${photoId}`);
    }

    if (photo.mediaType !== 'video') {
      const thumb = await this.getThumbnail(photoId, 256);
      return {
        ...thumb,
        kind: 'image',
      };
    }

    const targetPath = getHoverPreviewPath(this.cacheRoot, photo.path, width);
    ensureThumbnailDir(targetPath);

    try {
      await fs.access(targetPath);
      const cached: HoverPreviewInfo = { path: targetPath, cacheHit: true, kind: 'video' };
      this.touchHoverCache(cacheKey, cached);
      return cached;
    } catch {
      // cache miss
    }

    try {
      await createVideoHoverPreview(photo.path, targetPath, width);
      const result: HoverPreviewInfo = { path: targetPath, cacheHit: false, kind: 'video' };
      this.touchHoverCache(cacheKey, result);
      return result;
    } catch {
      const thumb = await this.getThumbnail(photoId, 256);
      return {
        ...thumb,
        kind: 'image',
      };
    }
  }

  private async getThumbnailInternal(
    photoId: number,
    size: 64 | 128 | 256 | 512,
    cacheKey: string,
    priority: ThumbnailPriority,
  ): Promise<ThumbnailResult> {
    const photo = this.photosRepo.getById(photoId);
    if (!photo) {
      throw new Error(`Photo not found: ${photoId}`);
    }

    const shouldReuseKnownThumbPath = photo.mediaType !== 'video';
    if (shouldReuseKnownThumbPath && photo.thumbPath && size >= 256 && !photo.lastError) {
      try {
        const knownSize = this.getThumbSizeFromPath(photo.thumbPath);
        const normalizedKnownSize =
          knownSize === 64 || knownSize === 128 || knownSize === 256 || knownSize === 512 ? knownSize : null;
        if (normalizedKnownSize !== null && normalizedKnownSize >= size) {
          const expectedPath = getThumbnailPath(this.cacheRoot, photo.path, normalizedKnownSize, photo.mediaType);
          if (path.normalize(expectedPath) !== path.normalize(photo.thumbPath)) {
            throw new Error('stale thumb cache version');
          }
          await fs.access(photo.thumbPath);
          const existing = { path: photo.thumbPath, cacheHit: true };
          this.touchCache(cacheKey, existing);
          return existing;
        }
      } catch {
        // stale DB path
      }
    }

    const targetPath = getThumbnailPath(this.cacheRoot, photo.path, size, photo.mediaType);
    ensureThumbnailDir(targetPath);

    if (!photo.lastError) {
      try {
        await fs.access(targetPath);
        const cached = { path: targetPath, cacheHit: true };
        this.touchCache(cacheKey, cached);
        return cached;
      } catch {
        // cache miss
      }
    } else {
      await fs.rm(targetPath, { force: true });
    }

    try {
      await this.runGenerationTask(cacheKey, priority, async () => {
        if (photo.mediaType === 'video') {
          await createVideoThumbnail(photo.path, targetPath, size);
        } else {
          await createImageThumbnail(photo.path, targetPath, size);
        }
      });
      if (size >= 256) {
        this.photosRepo.updateThumbnail(photoId, targetPath);
      } else {
        this.photosRepo.clearError(photoId);
      }
      const result = { path: targetPath, cacheHit: false };
      this.failureByKey.delete(cacheKey);
      this.touchCache(cacheKey, result);
      return result;
    } catch (error) {
      const recoveredPath = await this.findFallbackThumbPath(photo.path, size, photo.thumbPath);
      if (recoveredPath) {
        const message = error instanceof Error ? error.message : 'Thumbnail generation failed';
        this.photosRepo.setError(photoId, message);
        const recovered = { path: recoveredPath, cacheHit: true };
        this.failureByKey.delete(cacheKey);
        this.touchCache(cacheKey, recovered);
        return recovered;
      }

      const fallbackPath = await this.createPlaceholder(
        photo.path,
        size,
        photo.mediaType === 'video' ? 'VIDEO' : 'PHOTO',
      );
      const message = error instanceof Error ? error.message : 'Thumbnail generation failed';
      this.photosRepo.setError(photoId, message);
      this.failureByKey.set(cacheKey, {
        failedAtMs: Date.now(),
        placeholderPath: fallbackPath,
      });
      const result = { path: fallbackPath, cacheHit: false };
      this.touchCache(cacheKey, result);
      return result;
    }
  }

  private touchCache(key: string, value: ThumbnailResult): void {
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    }
    this.memoryCache.set(key, value);
    while (this.memoryCache.size > this.maxMemoryItems) {
      const oldest = this.memoryCache.keys().next().value;
      if (!oldest) {
        break;
      }
      this.memoryCache.delete(oldest);
    }
  }

  private touchHoverCache(key: string, value: HoverPreviewInfo): void {
    if (this.hoverMemoryCache.has(key)) {
      this.hoverMemoryCache.delete(key);
    }
    this.hoverMemoryCache.set(key, value);
    while (this.hoverMemoryCache.size > this.maxHoverMemoryItems) {
      const oldest = this.hoverMemoryCache.keys().next().value;
      if (!oldest) {
        break;
      }
      this.hoverMemoryCache.delete(oldest);
    }
  }

  private async createPlaceholder(sourcePath: string, size: number, label: string): Promise<string> {
    const targetPath = getPlaceholderPath(this.cacheRoot, sourcePath, size);
    ensureThumbnailDir(targetPath);
    const quality = size <= 64 ? 32 : size <= 128 ? 42 : size <= 256 ? 52 : 62;
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1f2933"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${Math.max(24, size / 6)}" fill="#3f4b57"/>
        <text x="50%" y="50%" fill="#f5f7fa" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${Math.max(18, Math.round(size / 9))}">
          ${label}
        </text>
      </svg>
    `;
    await sharp(Buffer.from(svg))
      .resize(size, size, { fit: 'cover' })
      .jpeg({ quality, mozjpeg: true, progressive: false })
      .toFile(targetPath);
    return targetPath;
  }

  private async runGenerationTask(key: string, priority: ThumbnailPriority, task: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const job: GenerationJob = {
        key,
        priority,
        started: false,
        task: async () => {
          try {
            await task();
            resolve();
          } catch (error) {
            reject(error);
          }
        },
      };
      this.generationJobs.set(key, job);
      this.enqueueGenerationJob(job);
      this.drainGenerationQueue();
    });
  }

  private enqueueGenerationJob(job: GenerationJob): void {
    if (job.priority === 'high') {
      this.generationHighQueue.push(job);
      return;
    }
    if (job.priority === 'normal') {
      this.generationNormalQueue.push(job);
      return;
    }
    this.generationLowQueue.push(job);
  }

  private isBurstActive(): boolean {
    return Date.now() < this.burstUntilMs;
  }

  private getGenerationHighConcurrencyLimit(): number {
    return this.isBurstActive() ? BURST_HIGH_CONCURRENCY : BASE_HIGH_CONCURRENCY;
  }

  private getGenerationBackgroundConcurrencyLimit(): number {
    return this.isBurstActive() ? BURST_BACKGROUND_CONCURRENCY : BASE_BACKGROUND_CONCURRENCY;
  }

  private getGenerationTotalConcurrencyLimit(): number {
    return this.getGenerationHighConcurrencyLimit() + this.getGenerationBackgroundConcurrencyLimit();
  }

  private activateBurstWindow(windowMs: number): void {
    const now = Date.now();
    this.burstUntilMs = Math.max(this.burstUntilMs, now + windowMs);
    if (this.burstResetTimer) {
      clearTimeout(this.burstResetTimer);
      this.burstResetTimer = null;
    }
    const remainingMs = Math.max(0, this.burstUntilMs - now);
    this.burstResetTimer = setTimeout(() => {
      this.burstResetTimer = null;
      this.drainGenerationQueue();
      for (const state of this.previewStripRequests.values()) {
        this.pumpPreviewStripWorkers(state);
      }
    }, remainingMs);
    this.drainGenerationQueue();
  }

  private takeNextGenerationJob(): GenerationJob | null {
    return this.generationHighQueue.shift() ?? null;
  }

  private takeNextBackgroundJob(): GenerationJob | null {
    return this.generationNormalQueue.shift() ?? this.generationLowQueue.shift() ?? null;
  }

  private drainGenerationQueue(): void {
    while (this.runningGenerationCount < this.getGenerationTotalConcurrencyLimit()) {
      let job: GenerationJob | null = null;
      if (this.runningHighPriorityCount < this.getGenerationHighConcurrencyLimit()) {
        job = this.takeNextGenerationJob();
      }
      if (!job && this.runningBackgroundCount < this.getGenerationBackgroundConcurrencyLimit()) {
        job = this.takeNextBackgroundJob();
      }
      if (!job) {
        return;
      }

      this.runningGenerationCount += 1;
      if (job.priority === 'high') {
        this.runningHighPriorityCount += 1;
      } else {
        this.runningBackgroundCount += 1;
      }
      job.started = true;
      this.generationJobs.delete(job.key);

      void job
        .task()
        .catch(() => {})
        .finally(() => {
          this.runningGenerationCount = Math.max(0, this.runningGenerationCount - 1);
          if (job.priority === 'high') {
            this.runningHighPriorityCount = Math.max(0, this.runningHighPriorityCount - 1);
          } else {
            this.runningBackgroundCount = Math.max(0, this.runningBackgroundCount - 1);
          }
          this.drainGenerationQueue();
        });
    }
  }

  private pumpPreviewStripWorkers(state: PreviewStripState): void {
    if (state.cancelled || this.previewStripRequests.get(state.requestId) !== state) {
      return;
    }

    const highWorkersLimit = this.getGenerationHighConcurrencyLimit();
    const backgroundWorkersLimit = this.getGenerationBackgroundConcurrencyLimit();

    while (state.runningHighWorkers < highWorkersLimit && state.highQueue.length > 0) {
      const nextPhotoId = state.highQueue.shift();
      if (typeof nextPhotoId !== 'number') {
        break;
      }
      state.runningHighWorkers += 1;
      void this.runPreviewStripWorkerTask(state, nextPhotoId, 'high', 'high');
    }

    while (state.runningBackgroundWorkers < backgroundWorkersLimit) {
      const next = this.takeNextPreviewStripBackgroundTask(state);
      if (!next) {
        break;
      }
      state.runningBackgroundWorkers += 1;
      void this.runPreviewStripWorkerTask(state, next.photoId, next.priority, 'background');
    }

    this.completePreviewStripIfDone(state);
  }

  private takeNextPreviewStripBackgroundTask(
    state: PreviewStripState,
  ): { photoId: number; priority: Extract<ThumbnailPriority, 'normal' | 'low'> } | null {
    const normalPhotoId = state.normalQueue.shift();
    if (typeof normalPhotoId === 'number') {
      return {
        photoId: normalPhotoId,
        priority: 'normal',
      };
    }
    const lowPhotoId = state.lowQueue.shift();
    if (typeof lowPhotoId === 'number') {
      return {
        photoId: lowPhotoId,
        priority: 'low',
      };
    }
    return null;
  }

  private async runPreviewStripWorkerTask(
    state: PreviewStripState,
    photoId: number,
    priority: ThumbnailPriority,
    lane: 'high' | 'background',
  ): Promise<void> {
    try {
      const result = await this.getThumbnail(photoId, state.size, priority);
      this.emitPreviewStripItem(state, {
        photoId,
        path: result.path,
        cacheHit: result.cacheHit,
        status: 'ready',
      });
    } catch {
      this.emitPreviewStripItem(state, {
        photoId,
        path: null,
        cacheHit: false,
        status: 'error',
      });
    } finally {
      if (lane === 'high') {
        state.runningHighWorkers = Math.max(0, state.runningHighWorkers - 1);
      } else {
        state.runningBackgroundWorkers = Math.max(0, state.runningBackgroundWorkers - 1);
      }

      if (state.cancelled || this.previewStripRequests.get(state.requestId) !== state) {
        return;
      }
      this.pumpPreviewStripWorkers(state);
    }
  }

  private emitPreviewStripItem(
    state: PreviewStripState,
    payload: Pick<PreviewStripProgressPayload, 'photoId' | 'path' | 'cacheHit' | 'status'>,
  ): void {
    if (state.cancelled || this.previewStripRequests.get(state.requestId) !== state) {
      return;
    }
    state.done = Math.min(state.total, state.done + 1);
    state.emit({
      requestId: state.requestId,
      photoId: payload.photoId,
      path: payload.path,
      cacheHit: payload.cacheHit,
      done: state.done,
      total: state.total,
      status: payload.status,
    });
    this.completePreviewStripIfDone(state);
  }

  private completePreviewStripIfDone(state: PreviewStripState): void {
    if (state.cancelled || this.previewStripRequests.get(state.requestId) !== state) {
      return;
    }
    if (state.done < state.total) {
      return;
    }
    if (state.runningHighWorkers > 0 || state.runningBackgroundWorkers > 0) {
      return;
    }
    if (state.highQueue.length > 0 || state.normalQueue.length > 0 || state.lowQueue.length > 0) {
      return;
    }
    state.emit({
      requestId: state.requestId,
      photoId: 0,
      path: null,
      cacheHit: true,
      done: state.done,
      total: state.total,
      status: 'complete',
    });
    this.previewStripRequests.delete(state.requestId);
  }

  private promoteGenerationJob(key: string, requested: ThumbnailPriority): void {
    if (requested === 'low') {
      return;
    }

    const job = this.generationJobs.get(key);
    if (!job || job.started) {
      return;
    }

    if (priorityWeight(job.priority) >= priorityWeight(requested)) {
      return;
    }

    this.removeGenerationJobFromQueue(job);
    job.priority = requested;
    this.enqueueGenerationJob(job);
  }

  private removeGenerationJobFromQueue(job: GenerationJob): void {
    const queue =
      job.priority === 'high' ? this.generationHighQueue : job.priority === 'normal' ? this.generationNormalQueue : this.generationLowQueue;
    const index = queue.indexOf(job);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  }

  private getThumbSizeFromPath(filePath: string): number | null {
    const parts = path.normalize(filePath).split(path.sep);
    const thumbsIndex = parts.lastIndexOf('thumbs');
    if (thumbsIndex < 0 || thumbsIndex + 1 >= parts.length) {
      return null;
    }
    const parsed = Number.parseInt(parts[thumbsIndex + 1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private isPlaceholderPath(filePath: string): boolean {
    return /[\\/]placeholder[\\/]/i.test(path.normalize(filePath));
  }

  private async findFallbackThumbPathByPhotoId(photoId: number, size: 64 | 128 | 256 | 512): Promise<string | null> {
    const photo = this.photosRepo.getById(photoId);
    if (!photo) {
      return null;
    }
    return this.findFallbackThumbPath(photo.path, size, photo.thumbPath);
  }

  private async findFallbackThumbPath(
    sourcePath: string,
    requestedSize: 64 | 128 | 256 | 512,
    knownThumbPath: string | null,
  ): Promise<string | null> {
    const candidateSizes =
      requestedSize === 512 ? [512, 256, 128, 64] : requestedSize === 256 ? [256, 128, 64] : requestedSize === 128 ? [128, 64] : [64];
    const candidates: string[] = [];

    if (knownThumbPath && !this.isPlaceholderPath(knownThumbPath)) {
      candidates.push(knownThumbPath);
    }

    for (const size of candidateSizes) {
      const photoCandidate = getThumbnailPath(this.cacheRoot, sourcePath, size, 'photo');
      if (!this.isPlaceholderPath(photoCandidate)) {
        candidates.push(photoCandidate);
      }
      const videoCandidate = getThumbnailPath(this.cacheRoot, sourcePath, size, 'video');
      if (!this.isPlaceholderPath(videoCandidate)) {
        candidates.push(videoCandidate);
      }
    }

    const uniqueCandidates = [...new Set(candidates)];
    for (const candidate of uniqueCandidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next candidate.
      }
    }
    return null;
  }
}
