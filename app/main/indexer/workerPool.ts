export interface MapPoolOptions {
  isCancelled: () => boolean;
  onItemDone?: () => void;
}

export interface BatchedMapPoolOptions<R> extends MapPoolOptions {
  batchSize: number;
  onBatch: (batch: R[]) => Promise<void> | void;
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

export async function mapWithConcurrencyBatched<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options: BatchedMapPoolOptions<R>,
): Promise<void> {
  const batchSize = Math.max(1, Math.trunc(options.batchSize));
  let cursor = 0;
  const pending: R[] = [];
  let flushChain: Promise<void> = Promise.resolve();
  let flushError: unknown = null;

  const scheduleFlush = (force = false) => {
    if (flushError) {
      return;
    }
    if (!force && pending.length < batchSize) {
      return;
    }
    if (pending.length === 0) {
      return;
    }
    const batch = pending.splice(0, pending.length);
    flushChain = flushChain
      .then(() => options.onBatch(batch))
      .catch((error) => {
        flushError = error;
        throw error;
      });
  };

  async function runWorker(): Promise<void> {
    while (true) {
      if (options.isCancelled()) {
        throw new CancelledError();
      }
      if (flushError) {
        throw flushError;
      }

      const current = cursor;
      cursor += 1;
      if (current >= items.length) {
        return;
      }

      const result = await worker(items[current], current);
      pending.push(result);
      options.onItemDone?.();
      scheduleFlush(false);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => runWorker());
  await Promise.all(workers);
  scheduleFlush(true);
  await flushChain;
}

