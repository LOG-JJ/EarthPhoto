import path from 'node:path';

export function normalizeFsPath(input: string): string {
  const normalized = path.normalize(input);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function toPosixPath(input: string): string {
  return input.replace(/\\/g, '/');
}

