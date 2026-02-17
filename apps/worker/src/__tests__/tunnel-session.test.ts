import { describe, it, expect } from "vitest";
import {
  env,
  runDurableObjectAlarm,
} from "cloudflare:test";
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
