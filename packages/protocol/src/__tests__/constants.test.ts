import { describe, it, expect } from "vitest";
import { PROTOCOL } from "../constants.js";

describe("PROTOCOL constants", () => {
  it("has all expected keys", () => {
    const expectedKeys = [
      "SUBDOMAIN_LENGTH",
      "SUBDOMAIN_ALPHABET",
      "REQUEST_ID_LENGTH",
      "REQUEST_TIMEOUT_MS",
      "RECONNECT_GRACE_PERIOD_MS",
      "DEFAULT_MAX_BODY_SIZE_BYTES",
      "BACKOFF_BASE_MS",
      "BACKOFF_MULTIPLIER",
      "BACKOFF_MAX_MS",
      "BACKOFF_MAX_ATTEMPTS",
      "BACKOFF_JITTER_MIN",
      "BACKOFF_JITTER_MAX",
      "DEFAULT_TTL_SECONDS",
      "MAX_TTL_SECONDS",
      "TUNNEL_CONNECT_PATH",
      "PING_MESSAGE",
      "PONG_MESSAGE",
    ];

    for (const key of expectedKeys) {
      expect(PROTOCOL).toHaveProperty(key);
    }
  });

  it("DEFAULT_TTL_SECONDS is less than MAX_TTL_SECONDS", () => {
    expect(PROTOCOL.DEFAULT_TTL_SECONDS).toBeLessThan(
      PROTOCOL.MAX_TTL_SECONDS,
    );
  });

  it("BACKOFF_BASE_MS is greater than 0", () => {
    expect(PROTOCOL.BACKOFF_BASE_MS).toBeGreaterThan(0);
  });

  it("TUNNEL_CONNECT_PATH starts with /", () => {
    expect(PROTOCOL.TUNNEL_CONNECT_PATH.startsWith("/")).toBe(true);
  });
});
