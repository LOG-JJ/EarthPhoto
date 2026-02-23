export class ClusterCache<T> {
  private readonly cache = new Map<string, T>();

  constructor(private readonly maxSize = 2) {}

  get(key: string): T | null {
    const value = this.cache.get(key);
    if (!value) {
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
