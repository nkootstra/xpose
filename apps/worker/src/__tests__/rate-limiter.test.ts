import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../rate-limiter.js";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const limiter = new RateLimiter(5);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("1.2.3.4").allowed).toBe(true);
    }
  });

  it("blocks requests over the limit", () => {
    const limiter = new RateLimiter(3);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);

    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates rate limits per IP", () => {
    const limiter = new RateLimiter(2);
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(false);

    // Different IP should still be allowed
    expect(limiter.check("2.2.2.2").allowed).toBe(true);
  });

  it("resets after the window expires", () => {
    const limiter = new RateLimiter(2);
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(false);

    // Advance past the 60-second window
    vi.advanceTimersByTime(61_000);

    expect(limiter.check("1.1.1.1").allowed).toBe(true);
  });

  it("returns correct retryAfterSeconds", () => {
    const limiter = new RateLimiter(1);

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(limiter.check("1.1.1.1").allowed).toBe(true);

    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    const result = limiter.check("1.1.1.1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(30);
  });

  it("cleans up stale entries", () => {
    const limiter = new RateLimiter(100);

    // Create entries for many IPs
    for (let i = 0; i < 50; i++) {
      limiter.check(`10.0.0.${i}`);
    }

    // Advance past window
    vi.advanceTimersByTime(61_000);

    // New check should trigger cleanup
    limiter.check("10.0.0.1");

    // All old entries should be cleaned up — new requests should be allowed
    for (let i = 0; i < 50; i++) {
      expect(limiter.check(`10.0.0.${i}`).allowed).toBe(true);
    }
  });

  it("retryAfterSeconds is at least 1", () => {
    const limiter = new RateLimiter(1);
    limiter.check("1.1.1.1");

    // Advance to nearly the end of the window
    vi.advanceTimersByTime(59_999);

    const result = limiter.check("1.1.1.1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
