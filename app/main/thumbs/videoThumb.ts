import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { createThumbnailFromEmbeddedPreview } from './embeddedPreview';
import { resolveFfmpegInputPath } from './ffmpegPathAlias';
import { runFfmpegWithFallback } from './ffmpegRunner';

function getVideoEncodeProfile(size: number): { quality: number; effort: number } {
  if (size <= 64) {
    return { quality: 40, effort: 0 };
  }
  if (size <= 128) {
    return { quality: 52, effort: 0 };
  }
  if (size <= 256) {
    return { quality: 62, effort: 1 };
  }
  return { quality: 72, effort: 1 };
}

function getFfmpegQscale(size: number): string {
  if (size <= 64) {
    return '20';
  }
  if (size <= 128) {
    return '14';
  }
  if (size <= 256) {
    return '9';
  }
  return '6';
}

export async function createVideoThumbnail(sourcePath: string, targetPath: string, size: number): Promise<void> {
  const aliasSourcePath = await resolveFfmpegInputPath(sourcePath);
  const targetBaseName = path.parse(targetPath).name;
  const tempJpg = path.join(path.dirname(targetPath), `${targetBaseName}.video.jpg`);
  const seekSeconds = size <= 64 ? '0.18' : size <= 128 ? '0.35' : '1';
  const scaleFilter = size <= 256 ? `scale=${size}:-2:flags=lanczos` : 'scale=iw:ih';
  const { quality, effort } = getVideoEncodeProfile(size);
  const qScale = getFfmpegQscale(size);

  try {
    await runFfmpegWithFallback([
      [
        '-y',
        '-v',
        'error',
        '-ss',
        seekSeconds,
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
        `thumbnail,${scaleFilter}`,
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
        '-ss',
        '0',
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
    ]);

    await sharp(tempJpg, { sequentialRead: true })
      .resize(size, size, {
        fit: 'cover',
        position: 'centre',
        fastShrinkOnLoad: true,
      })
      .jpeg({ quality, mozjpeg: true, progressive: false })
      .toFile(targetPath);
  } catch (ffmpegError) {
    const recovered = await createThumbnailFromEmbeddedPreview(sourcePath, targetPath, size, {
      rotate: false,
      quality,
      effort,
    });
    if (!recovered) {
      throw ffmpegError;
    }
  } finally {
    await fs.rm(tempJpg, { force: true });
  }
}
