type InvalidationCallback = (userId: string) => void;

const callbacks: InvalidationCallback[] = [];

export function registerJwtCacheInvalidator(cb: InvalidationCallback): void {
  callbacks.push(cb);
}

export function invalidateJwtUserCache(userId: string): void {
  for (const cb of callbacks) {
    try {
      cb(userId);
    } catch {
      // non-blocking
    }
  }
}
