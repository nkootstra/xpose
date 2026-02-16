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
  private clientConnected = false;
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

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PROTOCOL.TUNNEL_CONNECT_PATH) {
      return this.handleWebSocketUpgrade();
    }

    return this.handleProxyRequest(request);
  }

  private handleWebSocketUpgrade(): Response {
    // Keep one active CLI session per subdomain/DO instance.
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(1000, "Replaced by a newer connection");
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    this.clientConnected = true;

    return new Response(null, { status: 101, webSocket: client });
  }

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
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0 || !this.clientConnected) {
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

    const ws = sockets[0];
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

    ws.send(
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
        ws.send(
          JSON.stringify({
            type: "http-body-chunk",
            id: requestId,
            done: false,
          } satisfies TunnelMessage),
        );
        ws.send(encodeBinaryFrame(requestId, chunk));
      }

      ws.send(
        JSON.stringify({
          type: "http-request-end",
          id: requestId,
        } satisfies TunnelMessage),
      );
    }

    return responsePromise;
  }

  // ---- Hibernation API handlers ----

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    // Binary frame: body chunk from CLI response
    if (message instanceof ArrayBuffer) {
      const { requestId, body } = decodeBinaryFrame(message);
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

        const ttl = Math.min(
          msg.ttl ?? PROTOCOL.DEFAULT_TTL_SECONDS,
          PROTOCOL.MAX_TTL_SECONDS,
        );

        await this.ctx.storage.setAlarm(Date.now() + ttl * 1000);

        const sessionId = crypto.randomUUID();

        ws.send(
          JSON.stringify({
            type: "auth-ack",
            subdomain: msg.subdomain,
            url: `https://${msg.subdomain}.${getPublicDomain(this.env)}`,
            ttl,
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
    }
  }

  async webSocketClose(): Promise<void> {
    this.clientConnected = this.ctx.getWebSockets().length > 0;

    // Grace period: reject pending requests if CLI doesn't reconnect.
    setTimeout(() => {
      if (this.ctx.getWebSockets().length > 0) {
        this.clientConnected = true;
        return;
      }

      this.clientConnected = false;
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.resolve(
          new Response("Tunnel disconnected", { status: 502 }),
        );
      }
      this.pendingRequests.clear();
    }, PROTOCOL.RECONNECT_GRACE_PERIOD_MS);
  }

  async webSocketError(): Promise<void> {
    this.clientConnected = this.ctx.getWebSockets().length > 0;
  }

  // TTL expiration
  async alarm(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Tunnel TTL expired",
        } satisfies TunnelMessage),
      );
      ws.close(1000, "TTL expired");
    }

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.resolve(
        new Response("Tunnel expired", { status: 502 }),
      );
    }
    this.pendingRequests.clear();
    this.clientConnected = false;
  }
}
