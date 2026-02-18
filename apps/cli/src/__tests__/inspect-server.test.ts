import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { InspectServer } from "../inspect-server.js";
import type { InspectEntry } from "../tunnel-client.js";

function makeEntry(overrides: Partial<InspectEntry> = {}): InspectEntry {
  return {
    id: `req-${Math.random().toString(36).slice(2, 8)}`,
    method: "GET",
    path: "/test",
    status: 200,
    duration: 12,
    timestamp: Date.now(),
    requestHeaders: { host: "example.com" },
    responseHeaders: { "content-type": "text/plain" },
    ...overrides,
  };
}

/** Helper: fetch JSON from the inspect server. */
async function fetchJson(port: number, path: string) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json() };
}

/** Helper: connect a WebSocket and wait for the first message. */
function connectWs(
  port: number,
  headers?: Record<string, string>,
): Promise<{ ws: WebSocket; firstMessage: any }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      resolve({ ws, firstMessage: msg });
    });
    ws.on("error", reject);
  });
}

/** Helper: wait for the next WS message. */
function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.once("message", (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

// Use a dynamic port to avoid conflicts when tests run in parallel
let port = 0;
let server: InspectServer;

describe("InspectServer", () => {
  beforeEach(async () => {
    // Use port 0 to get an OS-assigned ephemeral port
    port = 40000 + Math.floor(Math.random() * 10000);
    server = new InspectServer(port);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  // --- HTTP endpoint tests ---

  describe("HTTP endpoints", () => {
    it("GET / returns health JSON", async () => {
      const { status, body } = await fetchJson(port, "/");
      expect(status).toBe(200);
      expect(body).toEqual({
        status: "ok",
        entries: 0,
        clients: 0,
      });
    });

    it("GET /health returns health JSON", async () => {
      const { status, body } = await fetchJson(port, "/health");
      expect(status).toBe(200);
      expect(body.status).toBe("ok");
    });

    it("GET /entries returns empty array initially", async () => {
      const { status, body } = await fetchJson(port, "/entries");
      expect(status).toBe(200);
      expect(body).toEqual([]);
    });

    it("GET /entries returns pushed entries", async () => {
      const entry = makeEntry({ path: "/hello" });
      server.push(entry);

      const { body } = await fetchJson(port, "/entries");
      expect(body).toHaveLength(1);
      expect(body[0].path).toBe("/hello");
    });

    it("GET /unknown returns 404", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/unknown`);
      expect(res.status).toBe(404);
    });

    it("OPTIONS returns 204 (CORS preflight)", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: "OPTIONS",
        headers: { origin: "https://local.xpose.dev" },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(
        "https://local.xpose.dev",
      );
    });

    it("does not set CORS headers for non-allowed origins", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { origin: "https://evil.com" },
      });
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("health reflects entry count after pushes", async () => {
      server.push(makeEntry());
      server.push(makeEntry());
      server.push(makeEntry());

      const { body } = await fetchJson(port, "/health");
      expect(body.entries).toBe(3);
    });
  });

  // --- Ring buffer tests ---

  describe("ring buffer", () => {
    it("caps at 200 entries", () => {
      for (let i = 0; i < 250; i++) {
        server.push(makeEntry({ id: `req-${i}` }));
      }

      // Access buffer via /entries endpoint
      return fetchJson(port, "/entries").then(({ body }) => {
        expect(body).toHaveLength(200);
        // First entry should be req-50 (oldest 50 were evicted)
        expect(body[0].id).toBe("req-50");
        expect(body[199].id).toBe("req-249");
      });
    });
  });

  // --- WebSocket tests ---

  describe("WebSocket", () => {
    it("sends snapshot on connect", async () => {
      server.push(makeEntry({ path: "/a" }));
      server.push(makeEntry({ path: "/b" }));

      const { ws, firstMessage } = await connectWs(port);
      try {
        expect(firstMessage.type).toBe("snapshot");
        expect(firstMessage.data).toHaveLength(2);
        expect(firstMessage.data[0].path).toBe("/a");
        expect(firstMessage.data[1].path).toBe("/b");
      } finally {
        ws.close();
      }
    });

    it("sends empty snapshot when no entries exist", async () => {
      const { ws, firstMessage } = await connectWs(port);
      try {
        expect(firstMessage.type).toBe("snapshot");
        expect(firstMessage.data).toEqual([]);
      } finally {
        ws.close();
      }
    });

    it("broadcasts new entries to connected clients", async () => {
      const { ws, firstMessage } = await connectWs(port);
      expect(firstMessage.type).toBe("snapshot");

      try {
        const msgPromise = nextMessage(ws);
        server.push(makeEntry({ path: "/live" }));

        const msg = await msgPromise;
        expect(msg.type).toBe("entry");
        expect(msg.data.path).toBe("/live");
      } finally {
        ws.close();
      }
    });

    it("broadcasts to multiple connected clients", async () => {
      const { ws: ws1 } = await connectWs(port);
      const { ws: ws2 } = await connectWs(port);

      try {
        const p1 = nextMessage(ws1);
        const p2 = nextMessage(ws2);

        server.push(makeEntry({ path: "/multi" }));

        const [msg1, msg2] = await Promise.all([p1, p2]);
        expect(msg1.data.path).toBe("/multi");
        expect(msg2.data.path).toBe("/multi");
      } finally {
        ws1.close();
        ws2.close();
      }
    });

    it("responds to ping with pong", async () => {
      const { ws } = await connectWs(port);

      try {
        const pongPromise = nextMessage(ws);
        ws.send(JSON.stringify({ type: "ping" }));

        const msg = await pongPromise;
        expect(msg.type).toBe("pong");
      } finally {
        ws.close();
      }
    });

    it("allows connections without an origin header", async () => {
      const { ws, firstMessage } = await connectWs(port);
      try {
        expect(firstMessage.type).toBe("snapshot");
      } finally {
        ws.close();
      }
    });

    it("allows connections from localhost origins", async () => {
      const { ws, firstMessage } = await connectWs(port, {
        origin: "http://localhost:3000",
      });
      try {
        expect(firstMessage.type).toBe("snapshot");
      } finally {
        ws.close();
      }
    });

    it("allows connections from the allowed origin", async () => {
      const { ws, firstMessage } = await connectWs(port, {
        origin: "https://local.xpose.dev",
      });
      try {
        expect(firstMessage.type).toBe("snapshot");
      } finally {
        ws.close();
      }
    });

    it("rejects connections from disallowed origins", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
        headers: { origin: "https://evil.com" },
      });

      const closePromise = new Promise<{ code: number; reason: string }>(
        (resolve) => {
          ws.on("close", (code, reason) => {
            resolve({ code, reason: reason.toString() });
          });
        },
      );

      const result = await closePromise;
      expect(result.code).toBe(4003);
      expect(result.reason).toBe("Origin not allowed");
    });
  });

  // --- Lifecycle tests ---

  describe("lifecycle", () => {
    it("reports correct clientCount", async () => {
      expect(server.clientCount).toBe(0);

      const { ws: ws1 } = await connectWs(port);
      // Give server a moment to register the connection
      await new Promise((r) => setTimeout(r, 50));
      expect(server.clientCount).toBe(1);

      const { ws: ws2 } = await connectWs(port);
      await new Promise((r) => setTimeout(r, 50));
      expect(server.clientCount).toBe(2);

      ws1.close();
      await new Promise((r) => setTimeout(r, 50));
      expect(server.clientCount).toBe(1);

      ws2.close();
      await new Promise((r) => setTimeout(r, 50));
      expect(server.clientCount).toBe(0);
    });

    it("reports correct boundPort", () => {
      expect(server.boundPort).toBe(port);
    });

    it("can be stopped and restarted", async () => {
      await server.stop();

      // Should fail to connect
      await expect(fetchJson(port, "/")).rejects.toThrow();

      // Restart
      server = new InspectServer(port);
      await server.start();

      // Should work again
      const { status } = await fetchJson(port, "/");
      expect(status).toBe(200);
    });

    it("stop() closes connected WebSocket clients", async () => {
      const { ws } = await connectWs(port);

      const closePromise = new Promise<number>((resolve) => {
        ws.on("close", (code) => resolve(code));
      });

      await server.stop();

      const code = await closePromise;
      expect(code).toBe(1000);
    });
  });
});
