import type { MediaType } from '@shared/types/photo';

export const PHOTO_EXTENSIONS = [
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
] as const;

export const VIDEO_EXTENSIONS = ['mov', 'mp4'] as const;

export const SUPPORTED_MEDIA_EXTENSIONS = [...PHOTO_EXTENSIONS, ...VIDEO_EXTENSIONS] as const;

const PHOTO_EXTENSION_SET = new Set<string>(PHOTO_EXTENSIONS);
const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS);

export function getMediaGlobPattern(): string {
  return `**/*.{${SUPPORTED_MEDIA_EXTENSIONS.join(',')}}`;
}

export function detectMediaTypeFromPath(filePath: string): MediaType | null {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (!extension) {
    return null;
  }
  if (PHOTO_EXTENSION_SET.has(extension)) {
    return 'photo';
  }
  if (VIDEO_EXTENSION_SET.has(extension)) {
    return 'video';
  }
  return null;
}
