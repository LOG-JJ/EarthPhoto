export interface MapPoolOptions {
  isCancelled: () => boolean;
  onItemDone?: () => void;
}

export class CancelledError extends Error {
  constructor(message = 'Job cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options: MapPoolOptions,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      if (options.isCancelled()) {
        throw new CancelledError();
      }

      const current = cursor;
      cursor += 1;
      if (current >= items.length) {
        return;
      }

      results[current] = await worker(items[current], current);
      options.onItemDone?.();
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

