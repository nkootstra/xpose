import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Use vi.hoisted so the mock class is available when vi.mock factory runs
const { MockWebSocket, getCapturedWs, resetCapturedWs } = vi.hoisted(() => {
  const { EventEmitter } = require("node:events");

  let _capturedWs: any = null;

  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    binaryType = "arraybuffer";
    url: string;
    sendMock = vi.fn();

    constructor(url: string) {
      super();
      this.url = url;
      _capturedWs = this;
    }

    send(data: unknown) {
      this.sendMock(data);
    }

    close(_code?: number, _reason?: string) {
      this.readyState = 3;
    }
  }

  return {
    MockWebSocket,
    getCapturedWs: () => _capturedWs as InstanceType<typeof MockWebSocket> | null,
    resetCapturedWs: () => { _capturedWs = null; },
  };
});

vi.mock("ws", () => {
  return { default: MockWebSocket };
});

import { createTunnelClient } from "../tunnel-client.js";
import type { TunnelStatus } from "../logger.js";

const defaultOpts = {
  subdomain: "test-sub",
  port: 3000,
  ttl: 3600,
  host: "localhost",
};

describe("createTunnelClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCapturedWs();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("emits 'connecting' status when connect() is called", () => {
    const client = createTunnelClient(defaultOpts);
    const statusHandler = vi.fn();
    client.on("status", statusHandler);

    client.connect();

    expect(statusHandler).toHaveBeenCalledWith("connecting");
  });

  it("uses custom domain when provided", () => {
    const client = createTunnelClient({
      ...defaultOpts,
      domain: "tunnel.example.com",
    });

    client.connect();

    const ws = getCapturedWs()!;
    expect(ws.url).toBe("wss://test-sub.tunnel.example.com/_tunnel/connect");
  });

  it("sends auth message on WebSocket open", () => {
    const client = createTunnelClient(defaultOpts);
    client.connect();

    const ws = getCapturedWs()!;
    expect(ws).not.toBeNull();
    ws.emit("open");

    expect(ws.sendMock).toHaveBeenCalledTimes(1);
    const sentMessage = JSON.parse(ws.sendMock.mock.calls[0][0]);
    expect(sentMessage.type).toBe("auth");
    expect(sentMessage.subdomain).toBe("test-sub");
    expect(sentMessage.ttl).toBe(3600);
  });

  it("emits 'authenticated' on auth-ack message", () => {
    const client = createTunnelClient(defaultOpts);
    const authHandler = vi.fn();
    const statusHandler = vi.fn();
    client.on("authenticated", authHandler);
    client.on("status", statusHandler);

    client.connect();
    const ws = getCapturedWs()!;
    ws.emit("open");

    const authAck = JSON.stringify({
      type: "auth-ack",
      subdomain: "test-sub",
      url: "https://test-sub.xpose.dev",
      ttl: 3600,
      sessionId: "sess-123",
      maxBodySizeBytes: 5242880,
    });
    ws.emit("message", authAck);

    expect(authHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://test-sub.xpose.dev",
        ttl: 3600,
        sessionId: "sess-123",
        maxBodySizeBytes: 5242880,
      }),
    );
    expect(statusHandler).toHaveBeenCalledWith("connected");
  });

  it("emits 'expired' on TTL expired error message", () => {
    const client = createTunnelClient(defaultOpts);
    const expiredHandler = vi.fn();
    const statusHandler = vi.fn();
    client.on("expired", expiredHandler);
    client.on("status", statusHandler);

    client.connect();
    const ws = getCapturedWs()!;
    ws.emit("open");

    const errorMsg = JSON.stringify({
      type: "error",
      message: "Tunnel TTL expired",
    });
    ws.emit("message", errorMsg);

    expect(expiredHandler).toHaveBeenCalledTimes(1);
    expect(statusHandler).toHaveBeenCalledWith("expired");
  });

  it("emits 'disconnected' on disconnect() and does not reconnect", () => {
    const client = createTunnelClient(defaultOpts);
    const statusHandler = vi.fn();
    client.on("status", statusHandler);

    client.connect();
    const ws = getCapturedWs()!;
    ws.emit("open");

    statusHandler.mockClear();
    client.disconnect();

    expect(statusHandler).toHaveBeenCalledWith("disconnected");

    // Simulate WebSocket close after disconnect - should not trigger reconnect
    ws.emit("close");

    // Advance all timers - no reconnecting status should be emitted
    vi.advanceTimersByTime(60_000);

    const allStatuses = statusHandler.mock.calls.map(
      (c) => c[0] as TunnelStatus,
    );
    expect(allStatuses).not.toContain("reconnecting");
  });

  it("schedules reconnect on unexpected WebSocket close", () => {
    const client = createTunnelClient(defaultOpts);
    const statusHandler = vi.fn();
    client.on("status", statusHandler);

    client.connect();
    const ws = getCapturedWs()!;
    ws.emit("open");

    statusHandler.mockClear();

    // Simulate unexpected close (not intentional disconnect)
    ws.emit("close");

    expect(statusHandler).toHaveBeenCalledWith("reconnecting");
  });

  it("emits error event for non-TTL error messages", () => {
    const client = createTunnelClient(defaultOpts);
    const errorHandler = vi.fn();
    client.on("error", errorHandler);

    client.connect();
    const ws = getCapturedWs()!;
    ws.emit("open");

    const errorMsg = JSON.stringify({
      type: "error",
      message: "Something went wrong",
    });
    ws.emit("message", errorMsg);

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(errorHandler.mock.calls[0][0].message).toBe("Something went wrong");
  });

  it("emits WebSocket errors via error event", () => {
    const client = createTunnelClient(defaultOpts);
    const errorHandler = vi.fn();
    client.on("error", errorHandler);

    client.connect();
    const ws = getCapturedWs()!;

    const wsError = new Error("connection refused");
    ws.emit("error", wsError);

    expect(errorHandler).toHaveBeenCalledWith(wsError);
  });

  it("proxies HTTP request to localhost and sends response back", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("OK", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const client = createTunnelClient(defaultOpts);
    const trafficHandler = vi.fn();
    client.on("traffic", trafficHandler);

    client.connect();
    const ws = getCapturedWs()!;
    ws.emit("open");

    // Authenticate first
    const authAck = JSON.stringify({
      type: "auth-ack",
      subdomain: "test-sub",
      url: "https://test-sub.xpose.dev",
      ttl: 3600,
      sessionId: "sess-123",
      maxBodySizeBytes: 5242880,
    });
    ws.emit("message", authAck);
    ws.sendMock.mockClear();

    // Send http-request with no body
    const httpReq = JSON.stringify({
      type: "http-request",
      id: "req-001",
      method: "GET",
      path: "/api/health",
      headers: { host: "test-sub.xpose.dev" },
      hasBody: false,
    });
    ws.emit("message", httpReq);

    // Allow async handleHttpRequest to complete
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/health",
      expect.objectContaining({ method: "GET" }),
    );

    // Should have emitted traffic
    expect(trafficHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "req-001",
        method: "GET",
        path: "/api/health",
        status: 200,
      }),
    );

    vi.unstubAllGlobals();
  });
});
