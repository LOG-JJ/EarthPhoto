import fs from 'node:fs/promises';
import os from 'node:os';

import fg from 'fast-glob';
import { lookup as lookupMime } from 'mime-types';

import type { MediaType, ScanFile } from '@shared/types/photo';
import { normalizeFsPath } from '@shared/utils/path';

const PHOTO_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'heic',
  'heif',
  'dng',
  'cr2',
  'cr3',
  'nef',
  'nrw',
  'arw',
  'sr2',
  'rw2',
  'orf',
  'raf',
  'pef',
  'srw',
  'raw',
];
const VIDEO_EXTENSIONS = ['mov', 'mp4'];
const SUPPORTED_EXTENSIONS = [...PHOTO_EXTENSIONS, ...VIDEO_EXTENSIONS];
const SCAN_STAT_CONCURRENCY = Math.max(8, Math.min(96, os.cpus().length * 6));

function detectMediaType(filePath: string): MediaType | null {
  const lower = filePath.toLowerCase();
  if (PHOTO_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`))) {
    return 'photo';
  }
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`))) {
    return 'video';
  }
  return null;
}

export async function scanMediaFiles(rootPath: string): Promise<ScanFile[]> {
  const pattern = `**/*.{${SUPPORTED_EXTENSIONS.join(',')}}`;
  const matches = await fg(pattern, {
    cwd: rootPath,
    absolute: true,
    onlyFiles: true,
    unique: true,
    caseSensitiveMatch: false,
    dot: false,
    followSymbolicLinks: false,
    ignore: ['**/$RECYCLE.BIN/**', '**/System Volume Information/**'],
  });

  const files = new Array<ScanFile | null>(matches.length).fill(null);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(SCAN_STAT_CONCURRENCY, Math.max(1, matches.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= matches.length) {
        return;
      }

      const absolutePath = matches[index];
      try {
        const stat = await fs.stat(absolutePath);
        const mediaType = detectMediaType(absolutePath);
        if (!mediaType) {
          continue;
        }
        const mime = lookupMime(absolutePath);
        files[index] = {
          path: normalizeFsPath(absolutePath),
          sizeBytes: stat.size,
          mtimeMs: Math.trunc(stat.mtimeMs),
          mediaType,
          mime: typeof mime === 'string' ? mime : null,
        };
      } catch {
        files[index] = null;
      }
    }
  });

  await Promise.all(workers);

  return files.filter((file): file is ScanFile => Boolean(file));
}
