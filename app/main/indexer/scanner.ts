import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import fg from 'fast-glob';
import { lookup as lookupMime } from 'mime-types';

import type { ScanFile } from '@shared/types/photo';
import { detectMediaTypeFromPath, getMediaGlobPattern } from '@shared/utils/mediaExtensions';
import { normalizeFsPath } from '@shared/utils/path';

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

const DEFAULT_SCAN_STAT_CONCURRENCY = Math.max(4, Math.min(32, os.cpus().length * 2));
const ENV_SCAN_STAT_CONCURRENCY = parsePositiveInt(process.env.PHOTOGLOBE_SCAN_CONCURRENCY);
const SCAN_STAT_CONCURRENCY = Math.max(1, Math.min(128, ENV_SCAN_STAT_CONCURRENCY ?? DEFAULT_SCAN_STAT_CONCURRENCY));

async function statMediaPath(absolutePath: string): Promise<ScanFile | null> {
  try {
    const stat = await fs.stat(absolutePath);
    const mediaType = detectMediaTypeFromPath(absolutePath);
    if (!mediaType) {
      return null;
    }
    const mime = lookupMime(absolutePath);
    return {
      path: normalizeFsPath(absolutePath),
      sizeBytes: stat.size,
      mtimeMs: Math.trunc(stat.mtimeMs),
      mediaType,
      mime: typeof mime === 'string' ? mime : null,
    };
  } catch {
    return null;
  }
}

async function statPathsWithConcurrency(paths: string[]): Promise<ScanFile[]> {
  const files = new Array<ScanFile | null>(paths.length).fill(null);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(SCAN_STAT_CONCURRENCY, Math.max(1, paths.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= paths.length) {
        return;
      }

      files[index] = await statMediaPath(paths[index]);
    }
  });

  await Promise.all(workers);
  return files.filter((file): file is ScanFile => Boolean(file));
}

export async function scanMediaFiles(rootPath: string): Promise<ScanFile[]> {
  const matches = await fg(getMediaGlobPattern(), {
    cwd: rootPath,
    absolute: true,
    onlyFiles: true,
    unique: true,
    caseSensitiveMatch: false,
    dot: false,
    followSymbolicLinks: false,
    ignore: ['**/$RECYCLE.BIN/**', '**/System Volume Information/**'],
  });

  return statPathsWithConcurrency(matches.map((item) => normalizeFsPath(item)));
}

export async function scanSpecificMediaFiles(filePaths: string[]): Promise<ScanFile[]> {
  const uniquePaths = Array.from(new Set(filePaths.map((item) => normalizeFsPath(path.resolve(item)))));
  if (uniquePaths.length === 0) {
    return [];
  }
  return statPathsWithConcurrency(uniquePaths);
}
