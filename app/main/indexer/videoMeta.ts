function parseDurationText(value: string): number | null {
  const directSeconds = Number.parseFloat(value);
  if (Number.isFinite(directSeconds)) {
    return Math.round(directSeconds * 1000);
  }

  const hhmmss = value.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (hhmmss) {
    const hours = Number.parseInt(hhmmss[1], 10);
    const minutes = Number.parseInt(hhmmss[2], 10);
    const seconds = Number.parseFloat(hhmmss[3]);
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }

  const secToken = value.match(/([\d.]+)\s*s/i);
  if (secToken) {
    const seconds = Number.parseFloat(secToken[1]);
    if (Number.isFinite(seconds)) {
      return Math.round(seconds * 1000);
    }
  }

  return null;
}

export function parseDurationMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 1000);
  }

  if (typeof value === 'string') {
    return parseDurationText(value.trim());
  }

  if (value && typeof value === 'object' && 'seconds' in (value as Record<string, unknown>)) {
    const seconds = Number((value as Record<string, unknown>).seconds);
    if (Number.isFinite(seconds)) {
      return Math.round(seconds * 1000);
    }
  }

  return null;
}

