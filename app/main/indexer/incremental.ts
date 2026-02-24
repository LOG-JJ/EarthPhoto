import type { ExistingPhotoSnapshot } from '@main/db/repositories/photosRepo';
import type { ScanFile } from '@shared/types/photo';
import { normalizeFsPath } from '@shared/utils/path';

export interface IncrementalPlan {
  toProcess: ScanFile[];
  toRestore: string[];
  toDelete: string[];
  unchangedCount: number;
}

export function createIncrementalPlan(scanFiles: ScanFile[], existing: Map<string, ExistingPhotoSnapshot>): IncrementalPlan {
  const toProcess: ScanFile[] = [];
  const toRestore: string[] = [];
  const toDelete: string[] = [];
  let unchangedCount = 0;
  const seen = new Set<string>();

  for (const file of scanFiles) {
    const normalizedPath = normalizeFsPath(file.path);
    seen.add(normalizedPath);

    const existingRow = existing.get(normalizedPath);
    if (!existingRow) {
      toProcess.push(file);
      continue;
    }

    if (existingRow.mtimeMs !== file.mtimeMs || existingRow.sizeBytes !== file.sizeBytes) {
      toProcess.push(file);
      continue;
    }

    unchangedCount += 1;
    if (existingRow.isDeleted) {
      toRestore.push(normalizedPath);
    }
  }

  for (const [existingPath, snapshot] of existing.entries()) {
    if (!seen.has(existingPath) && !snapshot.isDeleted) {
      toDelete.push(existingPath);
    }
  }

  return { toProcess, toRestore, toDelete, unchangedCount };
}

export function createDeltaPlan(
  scanFiles: ScanFile[],
  removedPaths: string[],
  existing: Map<string, ExistingPhotoSnapshot>,
): IncrementalPlan {
  const toProcess: ScanFile[] = [];
  const toRestore: string[] = [];
  const toDelete: string[] = [];
  let unchangedCount = 0;

  for (const file of scanFiles) {
    const normalizedPath = normalizeFsPath(file.path);
    const existingRow = existing.get(normalizedPath);
    if (!existingRow) {
      toProcess.push(file);
      continue;
    }

    if (existingRow.mtimeMs !== file.mtimeMs || existingRow.sizeBytes !== file.sizeBytes) {
      toProcess.push(file);
      continue;
    }

    unchangedCount += 1;
    if (existingRow.isDeleted) {
      toRestore.push(normalizedPath);
    }
  }

  const removedUnique = Array.from(new Set(removedPaths.map((item) => normalizeFsPath(item))));
  for (const removedPath of removedUnique) {
    const existingRow = existing.get(removedPath);
    if (existingRow && !existingRow.isDeleted) {
      toDelete.push(removedPath);
    }
  }

  return { toProcess, toRestore, toDelete, unchangedCount };
}

