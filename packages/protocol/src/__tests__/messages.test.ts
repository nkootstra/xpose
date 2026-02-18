import { describe, it, expect } from "vitest";
import { parseTextMessage, isTunnelMessage } from "../messages.js";

describe("parseTextMessage", () => {
  it('returns typed message for "auth"', () => {
    const raw = JSON.stringify({
      type: "auth",
      subdomain: "abc123",
      ttl: 3600,
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("auth");
  });

  it('returns typed message for "auth" with tunnel config', () => {
    const raw = JSON.stringify({
      type: "auth",
      subdomain: "abc123",
      ttl: 3600,
      config: {
        allowedIps: ["192.168.1.0/24", "10.0.0.1"],
        rateLimit: 100,
        cors: true,
        customHeaders: { "x-custom": "value" },
      },
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("auth");
  });

  it('returns typed message for "auth-ack"', () => {
    const raw = JSON.stringify({
      type: "auth-ack",
      subdomain: "abc123",
      url: "https://abc123.example.com",
      ttl: 3600,
      sessionId: "sess-1",
      maxBodySizeBytes: 5242880,
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("auth-ack");
  });

  it('returns typed message for "http-request"', () => {
    const raw = JSON.stringify({
      type: "http-request",
      id: "req-001",
      method: "GET",
      path: "/api/data",
      headers: { "content-type": "application/json" },
      hasBody: false,
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("http-request");
  });

  it('returns typed message for "http-response-meta"', () => {
    const raw = JSON.stringify({
      type: "http-response-meta",
      id: "req-001",
      status: 200,
      headers: { "content-type": "text/plain" },
      hasBody: true,
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("http-response-meta");
  });

  it('returns typed message for "http-body-chunk"', () => {
    const raw = JSON.stringify({
      type: "http-body-chunk",
      id: "req-001",
      done: false,
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("http-body-chunk");
  });

  it('returns typed message for "http-request-end"', () => {
    const raw = JSON.stringify({
      type: "http-request-end",
      id: "req-001",
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("http-request-end");
  });

  it('returns typed message for "http-response-end"', () => {
    const raw = JSON.stringify({
      type: "http-response-end",
      id: "req-001",
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("http-response-end");
  });

  it('returns typed message for "ping"', () => {
    const raw = JSON.stringify({ type: "ping" });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("ping");
  });

  it('returns typed message for "pong"', () => {
    const raw = JSON.stringify({ type: "pong" });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("pong");
  });

  it('returns typed message for "error"', () => {
    const raw = JSON.stringify({
      type: "error",
      message: "something went wrong",
      requestId: "req-001",
      status: 500,
    });
    const msg = parseTextMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("error");
  });

  it("returns null for invalid JSON", () => {
    expect(parseTextMessage("not json at all")).toBeNull();
    expect(parseTextMessage("{bad json")).toBeNull();
    expect(parseTextMessage("")).toBeNull();
  });

  it("returns null for JSON without type field", () => {
    const raw = JSON.stringify({ subdomain: "abc123" });
    expect(parseTextMessage(raw)).toBeNull();
  });

  it("returns null for non-object JSON values", () => {
    expect(parseTextMessage(JSON.stringify("a string"))).toBeNull();
    expect(parseTextMessage(JSON.stringify(42))).toBeNull();
    expect(parseTextMessage(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseTextMessage(JSON.stringify(null))).toBeNull();
    expect(parseTextMessage(JSON.stringify(true))).toBeNull();
  });
});

describe("isTunnelMessage", () => {
  it("returns true for a valid tunnel message object", () => {
    expect(isTunnelMessage({ type: "ping" })).toBe(true);
    expect(isTunnelMessage({ type: "auth", subdomain: "x" })).toBe(true);
    expect(isTunnelMessage({ type: "error", message: "fail" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isTunnelMessage(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isTunnelMessage(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isTunnelMessage("ping")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isTunnelMessage(123)).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isTunnelMessage([{ type: "ping" }])).toBe(false);
  });

  it("returns false for an object without type", () => {
    expect(isTunnelMessage({ subdomain: "abc" })).toBe(false);
  });

  it("returns false for an object with non-string type", () => {
    expect(isTunnelMessage({ type: 123 })).toBe(false);
    expect(isTunnelMessage({ type: true })).toBe(false);
    expect(isTunnelMessage({ type: null })).toBe(false);
  });
});
