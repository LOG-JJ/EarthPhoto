export type MediaType = 'photo' | 'video';

export interface PhotoRecord {
  id: number;
  rootId: number;
  path: string;
  pathHash: string;
  sizeBytes: number;
  mtimeMs: number;
  mediaType: MediaType;
  mime: string | null;
  lat: number | null;
  lng: number | null;
  alt: number | null;
  takenAtMs: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  cameraModel: string | null;
  thumbPath: string | null;
  thumbUpdatedAtMs: number | null;
  isDeleted: number;
  lastIndexedAtMs: number;
  lastError: string | null;
}

export interface PhotoUpsertInput {
  rootId: number;
  path: string;
  pathHash: string;
  sizeBytes: number;
  mtimeMs: number;
  mediaType: MediaType;
  mime: string | null;
  lat: number | null;
  lng: number | null;
  alt: number | null;
  takenAtMs: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  cameraModel: string | null;
  thumbPath: string | null;
  thumbUpdatedAtMs: number | null;
  lastIndexedAtMs: number;
  lastError: string | null;
}

export interface RootRecord {
  id: number;
  path: string;
  lastScanAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ScanFile {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  mediaType: MediaType;
  mime: string | null;
}

export interface PointItem {
  id: number;
  lat: number;
  lng: number;
  mediaType: MediaType;
  takenAtMs: number | null;
  path: string;
  thumbPath: string | null;
}

