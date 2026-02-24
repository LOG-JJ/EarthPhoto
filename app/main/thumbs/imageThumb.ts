import fs from 'node:fs/promises';
import path from 'node:path';

import heicDecode from 'heic-decode';
import sharp from 'sharp';

import { createThumbnailFromEmbeddedPreview } from './embeddedPreview';
import { resolveFfmpegInputPath } from './ffmpegPathAlias';
import { runFfmpegWithFallback } from './ffmpegRunner';

const THUMBNAIL_FFMPEG_TIMEOUT_MS = 3500;

const EMBEDDED_FIRST_EXTENSIONS = new Set([
  '.heic',
  '.heif',
  '.dng',
  '.cr2',
  '.cr3',
  '.nef',
  '.nrw',
  '.arw',
  '.sr2',
  '.rw2',
  '.orf',
  '.raf',
  '.pef',
  '.srw',
  '.raw',
]);
const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);

function getImageEncodeProfile(size: number): { quality: number; effort: number } {
  if (size <= 64) {
    return { quality: 36, effort: 0 };
  }
  if (size <= 128) {
    return { quality: 50, effort: 0 };
  }
  if (size <= 256) {
    return { quality: 64, effort: 1 };
  }
  return { quality: 72, effort: 2 };
}

function getFfmpegQscale(size: number): string {
  if (size <= 64) {
    return '22';
  }
  if (size <= 128) {
    return '16';
  }
  if (size <= 256) {
    return '10';
  }
  return '8';
}

async function tryCreateFromNativeImage(sourcePath: string, targetPath: string, size: number, quality: number): Promise<boolean> {
  try {
    const electronModule = await import('electron');
    const electron = electronModule as unknown as {
      default?: {
        nativeImage?: {
          createFromPath: (filePath: string) => { isEmpty: () => boolean; toPNG: () => Buffer };
        };
      };
      nativeImage?: {
        createFromPath: (filePath: string) => { isEmpty: () => boolean; toPNG: () => Buffer };
      };
    };
    const nativeImage = electron.default?.nativeImage ?? electron.nativeImage;
    if (!nativeImage) {
      return false;
    }
    const image = nativeImage.createFromPath(sourcePath);
    if (image.isEmpty()) {
      return false;
    }
    const buffer = image.toPNG();
    if (!buffer || buffer.length === 0) {
      return false;
    }
    await sharp(buffer, { failOn: 'none', sequentialRead: true })
      .rotate()
      .resize(size, size, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
        fastShrinkOnLoad: true,
      })
      .jpeg({ quality, mozjpeg: true, progressive: false })
      .toFile(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function tryCreateFromFfmpegStill(
  sourcePath: string,
  targetPath: string,
  size: number,
  quality: number,
): Promise<boolean> {
  const aliasSourcePath = await resolveFfmpegInputPath(sourcePath);
  const targetBaseName = path.parse(targetPath).name;
  const tempJpg = path.join(path.dirname(targetPath), `${targetBaseName}.ffmpeg.jpg`);
  const scaleFilter = size <= 256 ? `scale=${size}:-2:flags=bilinear` : 'scale=iw:ih';
  const qScale = getFfmpegQscale(size);

  try {
    await runFfmpegWithFallback([
      [
        '-y',
        '-v',
        'error',
        '-i',
        aliasSourcePath,
        '-an',
        '-sn',
        '-frames:v',
        '1',
        '-q:v',
        qScale,
        '-threads',
        '2',
        tempJpg,
      ],
      [
        '-y',
        '-v',
        'error',
        '-i',
        aliasSourcePath,
        '-an',
        '-sn',
        '-frames:v',
        '1',
        '-vf',
        scaleFilter,
        '-q:v',
        qScale,
        '-threads',
        '2',
        tempJpg,
      ],
    ], { timeoutMs: THUMBNAIL_FFMPEG_TIMEOUT_MS });

    await sharp(tempJpg, { failOn: 'none', sequentialRead: true })
      .rotate()
      .resize(size, size, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
        fastShrinkOnLoad: true,
      })
      .jpeg({ quality, mozjpeg: true, progressive: false })
      .toFile(targetPath);
    return true;
  } catch {
    return false;
  } finally {
    await fs.rm(tempJpg, { force: true });
  }
}

async function tryCreateFromHeicDecode(
  sourcePath: string,
  targetPath: string,
  size: number,
  quality: number,
): Promise<boolean> {
  try {
    const sourceBuffer = await fs.readFile(sourcePath);
    const decoded = await heicDecode({ buffer: sourceBuffer });
    if (!decoded || !decoded.width || !decoded.height || !decoded.data) {
      return false;
    }
    await sharp(decoded.data, {
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
      },
      failOn: 'none',
      sequentialRead: true,
    })
      .rotate()
      .resize(size, size, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
        fastShrinkOnLoad: true,
      })
      .jpeg({ quality, mozjpeg: true, progressive: false })
      .toFile(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function createImageThumbnail(sourcePath: string, targetPath: string, size: number): Promise<void> {
  const { quality, effort } = getImageEncodeProfile(size);
  const ext = path.extname(sourcePath).toLowerCase();

  if (EMBEDDED_FIRST_EXTENSIONS.has(ext)) {
    const recovered = await createThumbnailFromEmbeddedPreview(sourcePath, targetPath, size, { quality, effort });
    if (recovered) {
      return;
    }
    if (HEIC_EXTENSIONS.has(ext) && (await tryCreateFromHeicDecode(sourcePath, targetPath, size, quality))) {
      return;
    }
    if (await tryCreateFromNativeImage(sourcePath, targetPath, size, quality)) {
      return;
    }
    if (await tryCreateFromFfmpegStill(sourcePath, targetPath, size, quality)) {
      return;
    }
  }

  try {
    await sharp(sourcePath, { failOn: 'none', sequentialRead: true })
      .rotate()
      .resize(size, size, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
        fastShrinkOnLoad: true,
      })
      .jpeg({ quality, mozjpeg: true, progressive: false })
      .toFile(targetPath);
  } catch (error) {
    if (HEIC_EXTENSIONS.has(ext) && (await tryCreateFromHeicDecode(sourcePath, targetPath, size, quality))) {
      return;
    }
    if (await tryCreateFromNativeImage(sourcePath, targetPath, size, quality)) {
      return;
    }
    if (await tryCreateFromFfmpegStill(sourcePath, targetPath, size, quality)) {
      return;
    }
    const recovered = await createThumbnailFromEmbeddedPreview(sourcePath, targetPath, size, { quality, effort });
    if (recovered) {
      return;
    }
    throw error;
  }
}
