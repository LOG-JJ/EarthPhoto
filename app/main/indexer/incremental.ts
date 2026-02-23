import type { ExistingPhotoSnapshot } from '@main/db/repositories/photosRepo';
import type { ScanFile } from '@shared/types/photo';
import { normalizeFsPath } from '@shared/utils/path';

export interface IncrementalPlan {
  toProcess: ScanFile[];
  unchangedPaths: string[];
}

export function createIncrementalPlan(scanFiles: ScanFile[], existing: Map<string, ExistingPhotoSnapshot>): IncrementalPlan {
  const toProcess: ScanFile[] = [];
  const unchangedPaths: string[] = [];

  for (const file of scanFiles) {
    const existingRow = existing.get(normalizeFsPath(file.path));
    if (!existingRow) {
      toProcess.push(file);
      continue;
    }

    if (existingRow.mtimeMs !== file.mtimeMs || existingRow.sizeBytes !== file.sizeBytes) {
      toProcess.push(file);
      continue;
    }

    unchangedPaths.push(file.path);
  }

  return { toProcess, unchangedPaths };
}

