import { ExifDate, ExifDateTime, ExifTool, type Tags } from 'exiftool-vendored';

import type { MediaType } from '@shared/types/photo';

import { parseDurationMs } from './videoMeta';

export interface ExtractedMetadata {
  lat: number | null;
  lng: number | null;
  alt: number | null;
  takenAtMs: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  cameraModel: string | null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDateMs(value: unknown): number | null {
  if (!value) {
    return null;
  }
  if (value instanceof ExifDateTime || value instanceof ExifDate) {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  return null;
}

function pickTakenAtMs(tags: Tags): number | null {
  return (
    parseDateMs(tags.DateTimeOriginal) ??
    parseDateMs(tags.CreateDate) ??
    parseDateMs(tags.MediaCreateDate) ??
    parseDateMs(tags.TrackCreateDate) ??
    parseDateMs(tags.FileModifyDate) ??
    null
  );
}

function pickResolution(tags: Tags): { width: number | null; height: number | null } {
  const looseTags = tags as Record<string, unknown>;
  const width =
    parseNumber(tags.ImageWidth) ??
    parseNumber(tags.ExifImageWidth) ??
    parseNumber(tags.SourceImageWidth) ??
    parseNumber(looseTags.VideoFrameWidth) ??
    null;
  const height =
    parseNumber(tags.ImageHeight) ??
    parseNumber(tags.ExifImageHeight) ??
    parseNumber(tags.SourceImageHeight) ??
    parseNumber(looseTags.VideoFrameHeight) ??
    null;
  return { width, height };
}

export class ExifMetadataExtractor {
  private readonly exiftools: ExifTool[];

  constructor(poolSize: number) {
    const safePoolSize = Math.max(1, poolSize);
    this.exiftools = Array.from(
      { length: safePoolSize },
      () =>
        new ExifTool({
          taskTimeoutMillis: 30_000,
        }),
    );
  }

  private pickTool(workerHint = 0): ExifTool {
    return this.exiftools[Math.abs(workerHint) % this.exiftools.length];
  }

  private toMetadata(tags: Tags, mediaType: MediaType, includeCameraModel: boolean): ExtractedMetadata {
    const { width, height } = pickResolution(tags);
    return {
      lat: parseNumber(tags.GPSLatitude) ?? null,
      lng: parseNumber(tags.GPSLongitude) ?? null,
      alt: parseNumber(tags.GPSAltitude) ?? null,
      takenAtMs: pickTakenAtMs(tags),
      width,
      height,
      durationMs: mediaType === 'video' ? parseDurationMs(tags.Duration) : null,
      cameraModel: includeCameraModel && typeof tags.Model === 'string' ? tags.Model : null,
    };
  }

  async extractQuick(filePath: string, mediaType: MediaType, workerHint = 0): Promise<ExtractedMetadata> {
    const tool = this.pickTool(workerHint);
    const tags = await tool.read(filePath, { readArgs: ['-fast2'] });
    return this.toMetadata(tags, mediaType, true);
  }

  async extractFull(filePath: string, mediaType: MediaType, workerHint = 0): Promise<ExtractedMetadata> {
    const tool = this.pickTool(workerHint);
    const tags = await tool.read(filePath, { readArgs: [] });
    return this.toMetadata(tags, mediaType, true);
  }

  async extract(filePath: string, mediaType: MediaType, workerHint = 0): Promise<ExtractedMetadata> {
    const tool = this.exiftools[Math.abs(workerHint) % this.exiftools.length];
    const tags = await tool.read(filePath);
    return this.toMetadata(tags, mediaType, true);
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.exiftools.map((tool) => tool.end()));
  }
}

