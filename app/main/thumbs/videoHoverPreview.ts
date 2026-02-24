import { resolveFfmpegInputPath } from './ffmpegPathAlias';
import { runFfmpegWithFallback } from './ffmpegRunner';

const HOVER_FFMPEG_TIMEOUT_MS = 5000;

export async function createVideoHoverPreview(sourcePath: string, targetPath: string, width: number): Promise<void> {
  const aliasSourcePath = await resolveFfmpegInputPath(sourcePath);
  const vf = `scale=${width}:-2:flags=fast_bilinear,fps=10,format=yuv420p`;
  const commonArgs = [
    '-y',
    '-v',
    'error',
    '-ss',
    '0.35',
    '-t',
    '1.8',
    '-i',
    aliasSourcePath,
    '-an',
    '-sn',
    '-vf',
    vf,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-threads',
    '2',
  ];

  try {
    await runFfmpegWithFallback([
      [
        ...commonArgs,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '32',
        '-g',
        '20',
        targetPath,
      ],
      [
        ...commonArgs,
        '-c:v',
        'mpeg4',
        '-qscale:v',
        '14',
        targetPath,
      ],
    ], { timeoutMs: HOVER_FFMPEG_TIMEOUT_MS });
  } catch {
    // Let caller fallback to static thumbnail image when hover clip creation fails.
    throw new Error('video hover preview generation failed');
  }
}
