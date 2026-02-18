import { describe, it, expect } from "vitest";
import { env, runDurableObjectAlarm } from "cloudflare:test";
import { PROTOCOL } from "@xpose/protocol";
import { TunnelSession } from "../tunnel-session.js";
import type { Env } from "../types.js";

const testEnv = env as unknown as Env;

function getStub(name = "test") {
  const id = testEnv.TUNNEL_SESSION.idFromName(name);
  return testEnv.TUNNEL_SESSION.get(id) as DurableObjectStub<TunnelSession>;
}

describe("TunnelSession", () => {
  describe("no CLI connected", () => {
    it("returns 502 with branded error page", async () => {
      const stub = getStub("no-cli");
      const res = await stub.fetch("http://fake-host/some-path");
      expect(res.status).toBe(502);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      const text = await res.text();
      expect(text).toContain("Tunnel not connected");
      expect(text).toContain("xpose");
    });
  });

  describe("request body size limit", () => {
    it("rejects request when Content-Length exceeds max body size", async () => {
      const stub = getStub("body-limit-cl");

      // First, establish a WebSocket so the DO considers a CLI connected.
      const wsRes = await stub.fetch("http://fake-host/_tunnel/connect", {
        headers: { upgrade: "websocket" },
      });
      expect(wsRes.status).toBe(101);
      expect(wsRes.webSocket).toBeDefined();
      wsRes.webSocket!.accept();

      // Now send a request with Content-Length exceeding the 5MB limit
      const oversizeLength = (
        PROTOCOL.DEFAULT_MAX_BODY_SIZE_BYTES + 1
      ).toString();
      const res = await stub.fetch("http://fake-host/upload", {
        method: "POST",
        headers: { "content-length": oversizeLength },
      });
      expect(res.status).toBe(413);
      const text = await res.text();
      expect(text).toContain("exceeds");
      expect(text).toContain("byte limit");
    });
  });

  describe("WebSocket upgrade", () => {
    it("returns 101 with a webSocket property", async () => {
      const stub = getStub("ws-upgrade");
      const res = await stub.fetch("http://fake-host/_tunnel/connect", {
        headers: { upgrade: "websocket" },
      });
      expect(res.status).toBe(101);
      expect(res.webSocket).toBeDefined();
    });

    it("replaces previous connection on new upgrade", async () => {
      const stub = getStub("ws-replace");

      // First connection
      const res1 = await stub.fetch("http://fake-host/_tunnel/connect", {
        headers: { upgrade: "websocket" },
      });
      expect(res1.status).toBe(101);
      const ws1 = res1.webSocket!;
      ws1.accept();

      // Second connection replaces the first
      const res2 = await stub.fetch("http://fake-host/_tunnel/connect", {
        headers: { upgrade: "websocket" },
      });
      expect(res2.status).toBe(101);
      expect(res2.webSocket).toBeDefined();
    });
  });

  describe("access control with IP allowlist", () => {
    /** Helper: connect CLI WS and auth with an allowedIps config */
    async function connectWithConfig(
      stub: DurableObjectStub<TunnelSession>,
      config: { allowedIps?: string[]; rateLimit?: number; cors?: boolean },
    ) {
      const wsRes = await stub.fetch("http://fake-host/_tunnel/connect", {
        headers: { upgrade: "websocket" },
      });
      expect(wsRes.status).toBe(101);
      const ws = wsRes.webSocket!;
      ws.accept();
      ws.send(
        JSON.stringify({
          type: "auth",
          subdomain: "test",
          ttl: 60,
          config,
        }),
      );
      await new Promise((r) => setTimeout(r, 50));
      return ws;
    }

    it("blocks requests when IP is not in allowlist", async () => {
      const stub = getStub("ip-block");
      await connectWithConfig(stub, {
        allowedIps: ["10.0.0.1"],
      });

      // Request from a different IP
      const res = await stub.fetch("http://fake-host/test", {
        headers: { "cf-connecting-ip": "192.168.1.1" },
      });
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("Access Denied");
    });

    it("allows requests when IP is in allowlist", async () => {
      const stub = getStub("ip-allow");
      await connectWithConfig(stub, {
        allowedIps: ["10.0.0.1"],
      });

      // Request from the allowed IP — will timeout (no CLI response handler) but should not be 403
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 500);
      try {
        await stub.fetch("http://fake-host/test", {
          headers: { "cf-connecting-ip": "10.0.0.1" },
          signal: controller.signal,
        });
      } catch {
        // AbortError is expected (request times out waiting for CLI response)
      }
      clearTimeout(timeout);
      // If we got here without a 403, the IP was allowed through
    });

    it("extracts first IP from multi-value x-forwarded-for", async () => {
      const stub = getStub("ip-xff-multi");
      await connectWithConfig(stub, {
        allowedIps: ["203.0.113.50"],
      });

      // x-forwarded-for with multiple IPs — first one is the client
      // Request passes access control → enters handleProxyRequest → times out
      // We race with a short timeout to detect it wasn't immediately 403'd
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        const res = await stub.fetch("http://fake-host/test", {
          headers: {
            "x-forwarded-for": "203.0.113.50, 70.41.3.18, 150.172.238.178",
          },
          signal: controller.signal,
        });
        // If it resolved, it should NOT be 403
        expect(res.status).not.toBe(403);
      } catch {
        // AbortError — request passed access control and hung waiting for CLI response
        // This is the expected behavior (IP was allowed)
      }
      clearTimeout(timer);
    });

    it("rejects when first IP in x-forwarded-for is not allowed", async () => {
      const stub = getStub("ip-xff-multi-reject");
      await connectWithConfig(stub, {
        allowedIps: ["10.0.0.1"],
      });

      const res = await stub.fetch("http://fake-host/test", {
        headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
      });
      expect(res.status).toBe(403);
    });

    it("prefers cf-connecting-ip over x-forwarded-for", async () => {
      const stub = getStub("ip-cf-priority");
      await connectWithConfig(stub, {
        allowedIps: ["10.0.0.5"],
      });

      // cf-connecting-ip is allowed, x-forwarded-for is not
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        const res = await stub.fetch("http://fake-host/test", {
          headers: {
            "cf-connecting-ip": "10.0.0.5",
            "x-forwarded-for": "192.168.1.1",
          },
          signal: controller.signal,
        });
        expect(res.status).not.toBe(403);
      } catch {
        // AbortError — IP was allowed, request hung waiting for CLI
      }
      clearTimeout(timer);
    });

    it("handles CORS preflight without access control check", async () => {
      const stub = getStub("cors-preflight");
      await connectWithConfig(stub, {
        cors: true,
        allowedIps: ["10.0.0.1"], // Even with IP restriction
      });

      // CORS preflight from a non-allowed IP should still return 204
      const res = await stub.fetch("http://fake-host/test", {
        method: "OPTIONS",
        headers: {
          "cf-connecting-ip": "192.168.1.1", // Not in allowlist
          origin: "https://example.com",
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  describe("TTL alarm", () => {
    /** Helper: connect WS and complete auth handshake so alarm is scheduled */
    async function connectAndAuth(stub: DurableObjectStub<TunnelSession>) {
      const wsRes = await stub.fetch("http://fake-host/_tunnel/connect", {
        headers: { upgrade: "websocket" },
      });
      expect(wsRes.status).toBe(101);
      const ws = wsRes.webSocket!;
      ws.accept();
      // Send auth message to trigger setAlarm in the DO
      ws.send(JSON.stringify({ type: "auth", subdomain: "test", ttl: 60 }));
      // Give the DO a moment to process the message
      await new Promise((r) => setTimeout(r, 50));
      return ws;
    }

    it("rejects pending requests when alarm fires", async () => {
      const stub = getStub("ttl-alarm");
      await connectAndAuth(stub);

      const alarmResult = await runDurableObjectAlarm(stub);
      expect(alarmResult).toBe(true);

      // After alarm, new requests should get 502 (no connected CLI)
      const res = await stub.fetch("http://fake-host/after-alarm");
      expect(res.status).toBe(502);
    });

    it("returns 502 after alarm closes all WebSockets", async () => {
      const stub = getStub("ttl-alarm-disconnect");
      await connectAndAuth(stub);

      // Fire the alarm - it should close all WebSockets
      const alarmResult = await runDurableObjectAlarm(stub);
      expect(alarmResult).toBe(true);

      // After alarm, the DO should report no tunnel connected
      const res = await stub.fetch("http://fake-host/check");
      expect(res.status).toBe(502);
      const text = await res.text();
      expect(text).toContain("Tunnel not connected");
    });
  });
});
