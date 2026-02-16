import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../index.js";
import type { Env } from "../types.js";

const testEnv = env as unknown as Env;

// Mock WEB_APP service binding that echoes back a simple HTML page
const mockWebApp = {
  fetch: async () => new Response("<html><body>xpose landing</body></html>", {
    headers: { "content-type": "text/html" },
  }),
} as unknown as Fetcher;

const defaultBindings = {
  TUNNEL_SESSION: testEnv.TUNNEL_SESSION,
  WEB_APP: mockWebApp,
  PUBLIC_DOMAIN: "xpose.dev",
};

describe("Hono router", () => {
  describe("bare domain", () => {
    it("forwards to WEB_APP service binding", async () => {
      const res = await app.request("https://xpose.dev/", undefined, {
        ...defaultBindings,
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("xpose landing");
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    it("forwards bare domain with path to WEB_APP", async () => {
      const res = await app.request("https://xpose.dev/anything", undefined, {
        ...defaultBindings,
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("xpose landing");
    });
  });

  describe("www redirect", () => {
    it("redirects www.xpose.dev to xpose.dev with 301", async () => {
      const res = await app.request(
        "https://www.xpose.dev/some/path",
        undefined,
        { ...defaultBindings },
      );
      expect(res.status).toBe(301);
      const location = res.headers.get("location");
      expect(location).toBe("https://xpose.dev/some/path");
    });

    it("preserves query string on www redirect", async () => {
      const res = await app.request(
        "https://www.xpose.dev/page?foo=bar&baz=1",
        undefined,
        { ...defaultBindings },
      );
      expect(res.status).toBe(301);
      const location = res.headers.get("location");
      expect(location).toBe("https://xpose.dev/page?foo=bar&baz=1");
    });
  });

  describe("subdomain with no tunnel connected", () => {
    it("returns 502 Tunnel not connected", async () => {
      const res = await app.request("https://abc123.xpose.dev/", undefined, {
        ...defaultBindings,
      });
      expect(res.status).toBe(502);
      const text = await res.text();
      expect(text).toContain("Tunnel not connected");
    });

    it("includes retry-after header on 502", async () => {
      const res = await app.request(
        "https://abc123.xpose.dev/hello",
        undefined,
        { ...defaultBindings },
      );
      expect(res.status).toBe(502);
      expect(res.headers.get("retry-after")).toBe("5");
    });
  });

  describe("tunnel connect path", () => {
    it("returns 426 when no WebSocket upgrade header is present", async () => {
      const res = await app.request(
        "https://mysub.xpose.dev/_tunnel/connect",
        { method: "GET" },
        { ...defaultBindings },
      );
      expect(res.status).toBe(426);
      const text = await res.text();
      expect(text).toContain("Expected WebSocket upgrade");
    });

    it("returns 101 on valid WebSocket upgrade", async () => {
      const res = await app.request(
        "https://mysub.xpose.dev/_tunnel/connect",
        { headers: { upgrade: "websocket" } },
        { ...defaultBindings },
      );
      expect(res.status).toBe(101);
      expect(res.webSocket).toBeDefined();
    });
  });

  describe("proxy forwarding headers", () => {
    it("sets x-forwarded-proto to https", async () => {
      const res = await app.request(
        "https://testsub.xpose.dev/api/data",
        {
          method: "POST",
          headers: { "cf-connecting-ip": "1.2.3.4" },
          body: "hello",
        },
        { ...defaultBindings },
      );
      // The DO has no connected WebSocket, so it returns 502
      expect(res.status).toBe(502);
    });
  });

  describe("custom public domain", () => {
    const customBindings = {
      TUNNEL_SESSION: testEnv.TUNNEL_SESSION,
      WEB_APP: mockWebApp,
      PUBLIC_DOMAIN: "tunnel.example.com",
    };

    it("supports www redirect on custom domain", async () => {
      const res = await app.request(
        "https://www.tunnel.example.com/path?q=1",
        undefined,
        customBindings,
      );
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe("https://tunnel.example.com/path?q=1");
    });

    it("routes subdomains on custom domain", async () => {
      const res = await app.request(
        "https://abc.tunnel.example.com/hello",
        undefined,
        customBindings,
      );
      expect(res.status).toBe(502);
      const text = await res.text();
      expect(text).toContain("Tunnel not connected");
    });
  });
});
