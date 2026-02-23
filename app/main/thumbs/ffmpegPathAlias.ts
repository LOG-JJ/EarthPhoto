import fs from 'node:fs/promises';
import path from 'node:path';

import { sha1 } from '@shared/utils/hash';

const NON_ASCII_PATH_PATTERN = /[^\x00-\x7F]/;
const aliasCache = new Map<string, string>();

async function getFileIdentity(filePath: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const stat = await fs.stat(filePath);
    return {
      size: stat.size,
      mtimeMs: Math.trunc(stat.mtimeMs),
    };
  } catch {
    return null;
  }
}

async function ensureAliasFile(sourcePath: string, aliasPath: string): Promise<void> {
  const sourceIdentity = await getFileIdentity(sourcePath);
  if (!sourceIdentity) {
    throw new Error(`Source file is not accessible: ${sourcePath}`);
  }

  const aliasIdentity = await getFileIdentity(aliasPath);
  if (
    aliasIdentity &&
    aliasIdentity.size === sourceIdentity.size &&
    Math.abs(aliasIdentity.mtimeMs - sourceIdentity.mtimeMs) <= 1_000
  ) {
    return;
  }

  await fs.rm(aliasPath, { force: true });
  try {
    await fs.link(sourcePath, aliasPath);
  } catch {
    await fs.copyFile(sourcePath, aliasPath);
    const copiedIdentity = await getFileIdentity(sourcePath);
    if (copiedIdentity) {
      await fs.utimes(aliasPath, copiedIdentity.mtimeMs / 1000, copiedIdentity.mtimeMs / 1000);
    }
  }
}

export async function resolveFfmpegInputPath(sourcePath: string): Promise<string> {
  if (!NON_ASCII_PATH_PATTERN.test(sourcePath)) {
    return sourcePath;
  }

  const cached = aliasCache.get(sourcePath);
  if (cached) {
    try {
      await ensureAliasFile(sourcePath, cached);
      return cached;
    } catch {
      aliasCache.delete(sourcePath);
    }
  }

  const sourceRoot = path.parse(sourcePath).root || path.resolve(sourcePath).slice(0, 3);
  const extension = path.extname(sourcePath) || '.bin';
  const hash = sha1(sourcePath);
  const candidates = [path.join(sourceRoot, 'PhotoGlobeViewerTmp'), path.join(sourceRoot, 'Temp', 'PhotoGlobeViewerTmp')];

  for (const directory of candidates) {
    try {
      await fs.mkdir(directory, { recursive: true });
      const aliasPath = path.join(directory, `${hash}${extension.toLowerCase()}`);
      await ensureAliasFile(sourcePath, aliasPath);
      aliasCache.set(sourcePath, aliasPath);
      return aliasPath;
    } catch {
      // Try next directory candidate.
    }
  }

  return sourcePath;
}
