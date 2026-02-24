import fs from 'node:fs';
import { spawn } from 'node:child_process';

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

const DEFAULT_FFMPEG_TIMEOUT_MS = Math.max(
  5_000,
  Number.parseInt(process.env.PHOTOGLOBE_FFMPEG_TIMEOUT_MS ?? '12000', 10) || 12_000,
);

function getFfmpegCandidates(): string[] {
  const candidates: string[] = [];
  const envPath = process.env.PHOTOGLOBE_FFMPEG_PATH?.trim();
  if (envPath) {
    candidates.push(envPath);
  }
  if (typeof ffmpegInstaller?.path === 'string' && ffmpegInstaller.path.length > 0 && fs.existsSync(ffmpegInstaller.path)) {
    candidates.push(ffmpegInstaller.path);
  }
  if (typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0 && fs.existsSync(ffmpegStatic)) {
    candidates.push(ffmpegStatic);
  }
  candidates.push('ffmpeg');
  return [...new Set(candidates)];
}

function runSingleFfmpegCore(
  command: string,
  args: string[],
  options: { inputFilePath?: string; captureStdout?: boolean; timeoutMs?: number } = {},
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [options.inputFilePath ? 'pipe' : 'ignore', options.captureStdout ? 'pipe' : 'ignore', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    const stdoutChunks: Buffer[] = [];
    let stderr = '';
    let stdinError: Error | null = null;
    let settled = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_FFMPEG_TIMEOUT_MS;
    const timeoutHandle = setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill();
      settled = true;
      reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    if (options.captureStdout) {
      child.stdout?.on('data', (chunk) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
    }

    if (options.inputFilePath && child.stdin) {
      const stream = fs.createReadStream(options.inputFilePath);
      stream.on('error', (error) => {
        stdinError = error;
        child.kill();
      });
      stream.pipe(child.stdin);
    }

    child.stderr?.on('data', (chunk) => {
      if (stderr.length >= 2000) {
        return;
      }
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      if (stdinError) {
        reject(stdinError);
        return;
      }
      if (code === 0) {
        resolve(options.captureStdout ? Buffer.concat(stdoutChunks) : null);
        return;
      }
      const detail = stderr.trim().replace(/\s+/g, ' ').slice(0, 280);
      reject(new Error(detail ? `ffmpeg exited with code ${code}: ${detail}` : `ffmpeg exited with code ${code}`));
    });
  });
}

interface FfmpegRunOptions {
  timeoutMs?: number;
}

export async function runFfmpegWithFallback(argVariants: string[][], options: FfmpegRunOptions = {}): Promise<void> {
  const candidates = getFfmpegCandidates();
  const errors: string[] = [];

  for (const command of candidates) {
    for (const args of argVariants) {
      try {
        await runSingleFfmpegCore(command, args, { timeoutMs: options.timeoutMs });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${command}: ${message}`);
      }
    }
  }

  throw new Error(`FFmpeg failed for all candidates. ${errors.slice(-4).join(' | ')}`);
}

export async function runFfmpegPipeInputToBuffer(
  argVariants: string[][],
  inputFilePath: string,
  options: FfmpegRunOptions = {},
): Promise<Buffer> {
  const candidates = getFfmpegCandidates();
  const errors: string[] = [];

  for (const command of candidates) {
    for (const args of argVariants) {
      try {
        const output = await runSingleFfmpegCore(command, args, {
          inputFilePath,
          captureStdout: true,
          timeoutMs: options.timeoutMs,
        });
        if (output && output.length > 0) {
          return output;
        }
        errors.push(`${command}: ffmpeg output was empty`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${command}: ${message}`);
      }
    }
  }

  throw new Error(`FFmpeg failed for all candidates. ${errors.slice(-4).join(' | ')}`);
}

export async function runFfmpegPipeInputToFile(
  argVariants: string[][],
  inputFilePath: string,
  options: FfmpegRunOptions = {},
): Promise<void> {
  const candidates = getFfmpegCandidates();
  const errors: string[] = [];

  for (const command of candidates) {
    for (const args of argVariants) {
      try {
        await runSingleFfmpegCore(command, args, {
          inputFilePath,
          captureStdout: false,
          timeoutMs: options.timeoutMs,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${command}: ${message}`);
      }
    }
  }

  throw new Error(`FFmpeg failed for all candidates. ${errors.slice(-4).join(' | ')}`);
}
