import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { InspectEntry } from "./tunnel-client.js";

const RING_BUFFER_SIZE = 200;
const ALLOWED_ORIGIN = "https://local.xpose.dev";

/**
 * Local HTTP + WebSocket server for the request inspection dashboard.
 *
 * The hosted web app at local.xpose.dev connects to ws://localhost:<port>
 * to receive live traffic data and the initial buffer of recent entries.
 *
 * Architecture mirrors Drizzle Studio Local: the dashboard is a hosted SPA
 * that connects back to a local server for data.
 */
export class InspectServer {
  private buffer: InspectEntry[] = [];
  private wss: WebSocketServer | null = null;
  private server: ReturnType<typeof createServer> | null = null;
  private port: number;

  constructor(port: number) {
    this.port = port;
  }

  /** Push a new entry into the ring buffer and broadcast to all connected clients. */
  push(entry: InspectEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > RING_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(this.buffer.length - RING_BUFFER_SIZE);
    }
    this.broadcast({ type: "entry", data: entry });
  }

  /** Start the HTTP + WS server. Returns a promise that resolves when listening. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleHttp(req, res));

      this.wss = new WebSocketServer({ server: this.server });
      this.wss.on("connection", (ws, req) => this.handleWsConnection(ws, req));

      this.server.on("error", (err) => {
        reject(err);
      });

      this.server.listen(this.port, "127.0.0.1", () => {
        resolve();
      });
    });
  }

  /** Stop the server and close all connections. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all WebSocket connections
      if (this.wss) {
        for (const client of this.wss.clients) {
          client.close(1000, "Server shutting down");
        }
        this.wss.close();
        this.wss = null;
      }

      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  /** Number of connected dashboard clients. */
  get clientCount(): number {
    return this.wss?.clients.size ?? 0;
  }

  /** Current port the server is bound to. */
  get boundPort(): number {
    return this.port;
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    // CORS preflight
    const origin = req.headers.origin;
    if (origin === ALLOWED_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          entries: this.buffer.length,
          clients: this.clientCount,
        }),
      );
      return;
    }

    // Serve current buffer as JSON (useful for non-WS clients or debugging)
    if (req.url === "/entries") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.buffer));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }

  private handleWsConnection(ws: WebSocket, req: IncomingMessage): void {
    const origin = req.headers.origin;

    // Allow connections from the hosted dashboard and from localhost (dev)
    const isAllowed =
      !origin ||
      origin === ALLOWED_ORIGIN ||
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:");

    if (!isAllowed) {
      ws.close(4003, "Origin not allowed");
      return;
    }

    // Send the current buffer as the initial snapshot
    ws.send(JSON.stringify({ type: "snapshot", data: this.buffer }));

    // No messages expected from client, but handle ping/pong for keepalive
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        // Ignore malformed messages
      }
    });
  }

  private broadcast(message: { type: string; data: unknown }): void {
    if (!this.wss) return;
    const payload = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}
