/**
 * Simple per-IP sliding window rate limiter.
 *
 * Tracks request counts per IP within 60-second windows.
 * Lives in Durable Object memory and resets on eviction (acceptable for dev tunnels).
 */

interface WindowEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000; // 1 minute window

export class RateLimiter {
  private windows = new Map<string, WindowEntry>();
  private readonly maxPerMinute: number;

  constructor(maxPerMinute: number) {
    this.maxPerMinute = maxPerMinute;
  }

  /**
   * Check if a request from the given IP should be allowed.
   *
   * @returns An object with `allowed` (boolean) and optionally `retryAfterSeconds`.
   */
  check(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    this.cleanup(now);

    const existing = this.windows.get(ip);

    if (!existing || now - existing.windowStart >= WINDOW_MS) {
      // New window
      this.windows.set(ip, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (existing.count >= this.maxPerMinute) {
      const windowEnd = existing.windowStart + WINDOW_MS;
      const retryAfterSeconds = Math.ceil((windowEnd - now) / 1000);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    existing.count++;
    return { allowed: true };
  }

  /**
   * Remove stale window entries to prevent memory leaks.
   */
  private cleanup(now: number): void {
    for (const [ip, entry] of this.windows) {
      if (now - entry.windowStart >= WINDOW_MS) {
        this.windows.delete(ip);
      }
    }
  }
}
