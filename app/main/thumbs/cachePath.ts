import fs from 'node:fs';
import path from 'node:path';

import { sha1 } from '@shared/utils/hash';

const PHOTO_THUMB_CACHE_VERSION = 'p2';
const VIDEO_THUMB_CACHE_VERSION = 'v4';

export function getThumbnailPath(
  cacheRoot: string,
  sourcePath: string,
  size: number,
  mediaType: 'photo' | 'video' = 'photo',
): string {
  const version = mediaType === 'video' ? VIDEO_THUMB_CACHE_VERSION : PHOTO_THUMB_CACHE_VERSION;
  const hash = sha1(`${version}:${sourcePath}`);
  return path.join(cacheRoot, 'thumbs', String(size), `${hash}.jpg`);
}

export function getHoverPreviewPath(cacheRoot: string, sourcePath: string, width: number): string {
  const hash = sha1(sourcePath);
  return path.join(cacheRoot, 'thumbs', 'hover', String(width), `${hash}.mp4`);
}

export function getPlaceholderPath(cacheRoot: string, sourcePath: string, size: number): string {
  const hash = sha1(sourcePath);
  return path.join(cacheRoot, 'thumbs', 'placeholder', String(size), `${hash}.jpg`);
}

export function ensureThumbnailDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
