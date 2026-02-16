import { DurableObject } from "cloudflare:workers";
import {
  PROTOCOL,
  parseTextMessage,
  encodeBinaryFrame,
  decodeBinaryFrame,
  validateSubdomain,
  type TunnelMessage,
} from "@xpose/protocol";
import type { Env } from "./types.js";

interface PendingRequest {
  resolve: (response: Response) => void;
  timeout: ReturnType<typeof setTimeout>;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  bodyChunks: Uint8Array[];
  responseBodyBytes: number;
}

interface BufferedBody {
  chunks: Uint8Array[];
  totalBytes: number;
}

/** Attachment stored on each WebSocket to distinguish CLI vs browser connections. */
interface WsAttachment {
  role: "cli" | "browser";
  /** For browser sockets: the streamId used to correlate relay messages. */
  streamId?: string;
}

function parseMaxBodySizeBytes(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return PROTOCOL.DEFAULT_MAX_BODY_SIZE_BYTES;
  }
  return parsed;
}

function getPublicDomain(env: Env): string {
  const normalized = env.PUBLIC_DOMAIN?.trim().toLowerCase();
  return normalized && normalized.length > 0
    ? normalized
    : PROTOCOL.DEFAULT_PUBLIC_DOMAIN;
}

function parseContentLength(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function payloadTooLargeResponse(kind: "Request" | "Response", maxBytes: number) {
  return new Response(`${kind} body exceeds ${maxBytes} byte limit`, {
    status: 413,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export class TunnelSession extends DurableObject<Env> {
  private pendingRequests = new Map<string, PendingRequest>();
  /** Maps streamId -> resolve function for pending ws-upgrade-ack. */
  private pendingWsUpgrades = new Map<string, {
    resolve: (response: Response) => void;
    browserWs: WebSocket;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private readonly maxBodySizeBytes: number;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.maxBodySizeBytes = parseMaxBodySizeBytes(env.MAX_BODY_SIZE_BYTES);

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        PROTOCOL.PING_MESSAGE,
        PROTOCOL.PONG_MESSAGE,
      ),
    );
  }

  // ---- Helpers for socket role identification ----

  private getAttachment(ws: WebSocket): WsAttachment | null {
    try {
      return ws.deserializeAttachment() as WsAttachment | null;
    } catch {
      return null;
    }
  }

  private getCliSocket(): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.getAttachment(ws);
      if (att?.role === "cli") return ws;
    }
    return null;
  }

  private hasCliSocket(): boolean {
    return this.getCliSocket() !== null;
  }

  /** Look up a browser WebSocket by streamId from the runtime's tracked sockets.
   *  This is hibernation-safe — it doesn't depend on in-memory maps. */
  private getBrowserSocket(streamId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.getAttachment(ws);
      if (att?.role === "browser" && att.streamId === streamId) return ws;
    }
    return null;
  }

  // ---- Fetch handler ----

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PROTOCOL.TUNNEL_CONNECT_PATH) {
      return this.handleCliWebSocketUpgrade();
    }

    // Check if this is a browser WebSocket upgrade request
    const upgradeHeader = request.headers.get("upgrade");
    if (upgradeHeader?.toLowerCase() === "websocket") {
      return this.handleBrowserWebSocketUpgrade(request);
    }

    return this.handleProxyRequest(request);
  }

  // ---- CLI WebSocket connection ----

  private handleCliWebSocketUpgrade(): Response {
    // Close any existing CLI connection (only one CLI per DO).
    for (const socket of this.ctx.getWebSockets()) {
      const att = this.getAttachment(socket);
      if (att?.role === "cli") {
        socket.close(1000, "Replaced by a newer connection");
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: "cli" } satisfies WsAttachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- Browser WebSocket relay ----

  private handleBrowserWebSocketUpgrade(request: Request): Response {
    if (!this.hasCliSocket()) {
      return new Response("Tunnel not connected", {
        status: 502,
        headers: { "retry-after": "5" },
      });
    }

    const cliWs = this.getCliSocket()!;
    const streamId = crypto.randomUUID().slice(0, 12);
    const url = new URL(request.url);

    // Accept browser WebSocket
    const pair = new WebSocketPair();
    const [browserClient, browserServer] = Object.values(pair);

    this.ctx.acceptWebSocket(browserServer);
    browserServer.serializeAttachment({
      role: "browser",
      streamId,
    } satisfies WsAttachment);

    // Collect request headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Ask the CLI to open a local WebSocket
    try {
      cliWs.send(
        JSON.stringify({
          type: "ws-upgrade",
          streamId,
          path: url.pathname + url.search,
          headers,
        } satisfies TunnelMessage),
      );
    } catch {
      return new Response("Tunnel not connected", {
        status: 502,
        headers: { "retry-after": "5" },
      });
    }

    // Echo Sec-WebSocket-Protocol back to the browser so the handshake succeeds.
    // Without this, browsers reject the upgrade when they sent a subprotocol header
    // (e.g. Vite HMR sends "vite-hmr").
    const responseHeaders = new Headers();
    const requestedProtocol = request.headers.get("sec-websocket-protocol");
    if (requestedProtocol) {
      responseHeaders.set("sec-websocket-protocol", requestedProtocol.split(",")[0].trim());
    }

    return new Response(null, {
      status: 101,
      webSocket: browserClient,
      headers: responseHeaders,
    });
  }

  // ---- HTTP proxy ----

  private async readBodyWithinLimit(
    body: ReadableStream<Uint8Array> | null,
  ): Promise<BufferedBody | null> {
    if (!body) {
      return { chunks: [], totalBytes: 0 };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > this.maxBodySizeBytes) {
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return { chunks, totalBytes };
  }

  private async handleProxyRequest(request: Request): Promise<Response> {
    if (!this.hasCliSocket()) {
      return new Response("Tunnel not connected", {
        status: 502,
        headers: { "retry-after": "5" },
      });
    }

    const contentLength = parseContentLength(request.headers.get("content-length"));
    if (contentLength !== null && contentLength > this.maxBodySizeBytes) {
      return payloadTooLargeResponse("Request", this.maxBodySizeBytes);
    }

    const bufferedBody = await this.readBodyWithinLimit(request.body);
    if (!bufferedBody) {
      return payloadTooLargeResponse("Request", this.maxBodySizeBytes);
    }

    const cliWs = this.getCliSocket()!;
    const requestId = crypto.randomUUID().slice(0, 12);
    const url = new URL(request.url);
    const hasBody = bufferedBody.totalBytes > 0;

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const responsePromise = new Promise<Response>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve(new Response("Gateway Timeout", { status: 504 }));
      }, PROTOCOL.REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        resolve,
        timeout,
        bodyChunks: [],
        responseBodyBytes: 0,
      });
    });

    try {
      cliWs.send(
        JSON.stringify({
          type: "http-request",
          id: requestId,
          method: request.method,
          path: url.pathname + url.search,
          headers,
          hasBody,
        } satisfies TunnelMessage),
      );

      if (hasBody) {
        for (const chunk of bufferedBody.chunks) {
          cliWs.send(
            JSON.stringify({
              type: "http-body-chunk",
              id: requestId,
              done: false,
            } satisfies TunnelMessage),
          );
          cliWs.send(encodeBinaryFrame(requestId, chunk));
        }

        cliWs.send(
          JSON.stringify({
            type: "http-request-end",
            id: requestId,
          } satisfies TunnelMessage),
        );
      }
    } catch {
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
      }
      return new Response("Tunnel not connected", {
        status: 502,
        headers: { "retry-after": "5" },
      });
    }

    return responsePromise;
  }

  // ---- Hibernation API handlers ----

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const att = this.getAttachment(ws);

    // Messages from a BROWSER WebSocket → relay to CLI
    if (att?.role === "browser" && att.streamId) {
      const cliWs = this.getCliSocket();
      if (!cliWs) return;

      try {
        if (message instanceof ArrayBuffer) {
          // Binary frame from browser
          cliWs.send(
            JSON.stringify({
              type: "ws-frame",
              streamId: att.streamId,
              frameType: "binary",
            } satisfies TunnelMessage),
          );
          cliWs.send(encodeBinaryFrame(att.streamId, new Uint8Array(message)));
        } else {
          // Text frame from browser → encode as binary with the text content
          const encoder = new TextEncoder();
          cliWs.send(
            JSON.stringify({
              type: "ws-frame",
              streamId: att.streamId,
              frameType: "text",
            } satisfies TunnelMessage),
          );
          cliWs.send(encodeBinaryFrame(att.streamId, encoder.encode(message)));
        }
      } catch {
        // CLI disconnected, close browser WS
        this.cleanupBrowserStream(att.streamId);
      }
      return;
    }

    // Messages from the CLI WebSocket
    if (message instanceof ArrayBuffer) {
      const { requestId, body } = decodeBinaryFrame(message);

      // Check if this is a WS relay binary frame
      const browserWs = this.getBrowserSocket(requestId);
      if (browserWs) {
        try {
          if ((browserWs as any).__nextFrameIsText) {
            // This binary frame contains UTF-8 text that should be sent as a text frame
            const decoder = new TextDecoder();
            browserWs.send(decoder.decode(body));
            (browserWs as any).__nextFrameIsText = false;
          } else {
            browserWs.send(body);
          }
        } catch {
          this.cleanupBrowserStream(requestId);
        }
        return;
      }

      // Otherwise it's an HTTP response body chunk
      const pending = this.pendingRequests.get(requestId);
      if (!pending) return;

      pending.responseBodyBytes += body.byteLength;
      if (pending.responseBodyBytes > this.maxBodySizeBytes) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
        pending.resolve(payloadTooLargeResponse("Response", this.maxBodySizeBytes));
        return;
      }

      pending.bodyChunks.push(body);
      return;
    }

    const msg = parseTextMessage(message);
    if (!msg) return;

    switch (msg.type) {
      case "auth": {
        const validation = validateSubdomain(msg.subdomain);
        if (!validation.ok) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: `Invalid subdomain: ${validation.reason}`,
            } satisfies TunnelMessage),
          );
          ws.close(1008, "Invalid subdomain");
          break;
        }

        const requestedTtl = Math.min(
          msg.ttl ?? PROTOCOL.DEFAULT_TTL_SECONDS,
          PROTOCOL.MAX_TTL_SECONDS,
        );

        const existingAlarm = await this.ctx.storage.getAlarm();
        let remainingTtl: number;

        if (existingAlarm !== null && existingAlarm > Date.now()) {
          remainingTtl = Math.ceil((existingAlarm - Date.now()) / 1000);
        } else {
          remainingTtl = requestedTtl;
          await this.ctx.storage.setAlarm(Date.now() + requestedTtl * 1000);
        }

        const sessionId = crypto.randomUUID();

        ws.send(
          JSON.stringify({
            type: "auth-ack",
            subdomain: msg.subdomain,
            url: `https://${msg.subdomain}.${getPublicDomain(this.env)}`,
            ttl: requestedTtl,
            remainingTtl,
            sessionId,
            maxBodySizeBytes: this.maxBodySizeBytes,
          } satisfies TunnelMessage),
        );
        break;
      }

      case "http-response-meta": {
        const pending = this.pendingRequests.get(msg.id);
        if (!pending) break;

        const contentLength = parseContentLength(
          headerValue(msg.headers, "content-length"),
        );
        if (contentLength !== null && contentLength > this.maxBodySizeBytes) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.id);
          pending.resolve(payloadTooLargeResponse("Response", this.maxBodySizeBytes));
          break;
        }

        pending.responseStatus = msg.status;
        pending.responseHeaders = msg.headers;

        if (!msg.hasBody) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.id);
          pending.resolve(
            new Response(null, {
              status: msg.status,
              headers: msg.headers,
            }),
          );
        }
        break;
      }

      case "http-body-chunk": {
        // Binary data handled above in ArrayBuffer branch.
        break;
      }

      case "http-response-end": {
        const pending = this.pendingRequests.get(msg.id);
        if (!pending) break;

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(msg.id);

        const totalLength = pending.bodyChunks.reduce(
          (sum, chunk) => sum + chunk.byteLength,
          0,
        );
        const body = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of pending.bodyChunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }

        pending.resolve(
          new Response(body, {
            status: pending.responseStatus ?? 200,
            headers: pending.responseHeaders ?? {},
          }),
        );
        break;
      }

      case "error": {
        if (msg.requestId) {
          const pending = this.pendingRequests.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(msg.requestId);
            pending.resolve(
              new Response(msg.message, { status: msg.status ?? 502 }),
            );
          }
        }
        break;
      }

      // ---- WebSocket relay messages from CLI ----

      case "ws-upgrade-ack": {
        const pendingUpgrade = this.pendingWsUpgrades.get(msg.streamId);
        if (!pendingUpgrade) break;

        clearTimeout(pendingUpgrade.timeout);
        this.pendingWsUpgrades.delete(msg.streamId);

        if (!msg.ok) {
          // CLI couldn't connect to local WS. Close browser WS.
          this.cleanupBrowserStream(msg.streamId);
        }
        // If ok, the browser WS is already connected and ready for relaying.
        break;
      }

      case "ws-frame": {
        const browserWs = this.getBrowserSocket(msg.streamId);
        if (!browserWs) break;

        // The actual frame data follows as a binary frame (handled in ArrayBuffer branch above).
        // For text frames, the CLI sends the text encoded in a binary frame;
        // we need to decode and send as text to the browser.
        // This is handled in the binary branch by checking browserWebSockets map.
        // However, for text frames we need to know to send as string vs ArrayBuffer.
        // We store the frameType so the binary handler can use it.
        // For simplicity, we track this on the map.

        // Actually, the binary branch sends raw bytes to the browser WS.
        // For text frames: CLI encodes text as UTF-8 bytes in the binary frame.
        // We need to decode those back to a string for the browser WS.
        // Let's handle this by tagging the next expected frame type.
        if (msg.frameType === "text") {
          // Mark that the next binary frame for this streamId should be sent as text
          (browserWs as any).__nextFrameIsText = true;
        }
        break;
      }

      case "ws-close": {
        this.cleanupBrowserStream(msg.streamId, msg.code, msg.reason);
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = this.getAttachment(ws);

    if (att?.role === "browser" && att.streamId) {
      // Browser disconnected — notify CLI
      const cliWs = this.getCliSocket();
      if (cliWs) {
        try {
          cliWs.send(
            JSON.stringify({
              type: "ws-close",
              streamId: att.streamId,
              code: 1000,
              reason: "Browser disconnected",
            } satisfies TunnelMessage),
          );
        } catch {
          // CLI already gone
        }
      }
      return;
    }

    if (att?.role === "cli") {
      // CLI disconnected — close all browser WS connections
      for (const socket of this.ctx.getWebSockets()) {
        const socketAtt = this.getAttachment(socket);
        if (socketAtt?.role === "browser") {
          try {
            socket.close(1001, "Tunnel disconnected");
          } catch {
            // Already closed
          }
        }
      }

      // Grace period: reject pending HTTP requests
      setTimeout(() => {
        if (this.hasCliSocket()) {
          return;
        }

        for (const [, pending] of this.pendingRequests) {
          clearTimeout(pending.timeout);
          pending.resolve(
            new Response("Tunnel disconnected", { status: 502 }),
          );
        }
        this.pendingRequests.clear();
      }, PROTOCOL.RECONNECT_GRACE_PERIOD_MS);
    }
  }

  async webSocketError(): Promise<void> {
    // Connection state is derived from ctx.getWebSockets() / getAttachment,
    // so no in-memory flag needs updating here.
  }

  // ---- TTL expiration ----

  async alarm(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const att = this.getAttachment(ws);
      if (att?.role === "cli") {
        try {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Tunnel TTL expired",
            } satisfies TunnelMessage),
          );
        } catch {
          // Already closed
        }
      }
      ws.close(1000, "TTL expired");
    }

    // Clean up pending WS upgrades
    this.pendingWsUpgrades.clear();

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.resolve(
        new Response("Tunnel expired", { status: 502 }),
      );
    }
    this.pendingRequests.clear();
  }

  // ---- Helper: clean up a browser WS stream ----

  private cleanupBrowserStream(streamId: string, code = 1000, reason = "Stream closed") {
    const browserWs = this.getBrowserSocket(streamId);
    if (browserWs) {
      try {
        browserWs.close(code, reason);
      } catch {
        // Already closed
      }
    }

    const pendingUpgrade = this.pendingWsUpgrades.get(streamId);
    if (pendingUpgrade) {
      clearTimeout(pendingUpgrade.timeout);
      this.pendingWsUpgrades.delete(streamId);
    }
  }
}
