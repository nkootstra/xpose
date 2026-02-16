import WebSocket from "ws";
import { EventEmitter } from "node:events";
import {
  PROTOCOL,
  parseTextMessage,
  encodeBinaryFrame,
  decodeBinaryFrame,
  type TunnelMessage,
  type HttpRequestMessage,
} from "@xpose/protocol";
import type { TrafficEntry, TunnelStatus } from "./logger.js";

interface BufferedBody {
  chunks: Uint8Array[];
  totalBytes: number;
}

export interface TunnelClientOptions {
  subdomain: string;
  port: number;
  ttl: number;
  host: string;
  domain?: string;
}

export interface TunnelClient {
  connect(): void;
  disconnect(): void;
  on(event: "status", listener: (status: TunnelStatus) => void): void;
  on(
    event: "authenticated",
    listener: (data: {
      url: string;
      ttl: number;
      sessionId: string;
      maxBodySizeBytes: number;
    }) => void,
  ): void;
  on(event: "traffic", listener: (entry: TrafficEntry) => void): void;
  on(event: "error", listener: (err: Error) => void): void;
  on(event: "expired", listener: () => void): void;
}

function parseContentLength(raw: string | undefined): number | null {
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

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

export function createTunnelClient(opts: TunnelClientOptions): TunnelClient {
  const emitter = new EventEmitter();
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let sessionId: string | null = null;
  let disconnectedIntentionally = false;
  let maxBodySizeBytes = PROTOCOL.DEFAULT_MAX_BODY_SIZE_BYTES;

  // Track incoming request bodies and metadata
  const requestBodyChunks = new Map<string, Uint8Array[]>();
  const requestBodySizes = new Map<string, number>();
  const oversizedRequestIds = new Set<string>();
  const pendingRequestMeta = new Map<string, HttpRequestMessage>();

  const tunnelDomain = opts.domain?.trim() || PROTOCOL.DEFAULT_PUBLIC_DOMAIN;
  const wsUrl = `wss://${opts.subdomain}.${tunnelDomain}${PROTOCOL.TUNNEL_CONNECT_PATH}`;

  function emitStatus(status: TunnelStatus) {
    emitter.emit("status", status);
  }

  function sendMessage(message: TunnelMessage) {
    ws?.send(JSON.stringify(message));
  }

  async function readBodyWithinLimit(
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
        if (totalBytes > maxBodySizeBytes) {
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return { chunks, totalBytes };
  }

  function respondWith413(requestId: string, message: string) {
    sendMessage({
      type: "error",
      message,
      requestId,
      status: 413,
    } satisfies TunnelMessage);
  }

  function handleBinaryFrame(data: ArrayBuffer) {
    const { requestId, body } = decodeBinaryFrame(data);
    const chunks = requestBodyChunks.get(requestId);
    if (!chunks) return;
    if (oversizedRequestIds.has(requestId)) return;

    const nextSize = (requestBodySizes.get(requestId) ?? 0) + body.byteLength;
    requestBodySizes.set(requestId, nextSize);

    if (nextSize > maxBodySizeBytes) {
      oversizedRequestIds.add(requestId);
      requestBodyChunks.delete(requestId);
      return;
    }

    chunks.push(body);
  }

  function connect() {
    emitStatus(reconnectAttempts > 0 ? "reconnecting" : "connecting");
    disconnectedIntentionally = false;

    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.on("open", () => {
      reconnectAttempts = 0;

      sendMessage({
        type: "auth",
        subdomain: opts.subdomain,
        ttl: opts.ttl,
        sessionId: sessionId ?? undefined,
      } satisfies TunnelMessage);
    });

    ws.on("message", (data: WebSocket.Data) => {
      // Binary frame: body chunk for an incoming request
      if (data instanceof ArrayBuffer) {
        handleBinaryFrame(data);
        return;
      }

      // Node.js ws delivers binary as Buffer, not ArrayBuffer
      if (Buffer.isBuffer(data)) {
        const str = data.toString("utf8");
        if (!str.startsWith("{")) {
          const ab = data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          );
          handleBinaryFrame(ab as ArrayBuffer);
          return;
        }
        // Otherwise it's a JSON text message in Buffer form
        const msg = parseTextMessage(str);
        if (msg) handleTextMessage(msg);
        return;
      }

      // String text frame
      const raw =
        typeof data === "string" ? data : String(data);
      const msg = parseTextMessage(raw);
      if (msg) handleTextMessage(msg);
    });

    ws.on("close", () => {
      if (disconnectedIntentionally) return;
      scheduleReconnect();
    });

    ws.on("error", (err) => {
      emitter.emit("error", err);
    });
  }

  function handleTextMessage(msg: TunnelMessage) {
    switch (msg.type) {
      case "auth-ack": {
        sessionId = msg.sessionId;
        maxBodySizeBytes = msg.maxBodySizeBytes;
        emitStatus("connected");
        emitter.emit("authenticated", {
          url: msg.url,
          ttl: msg.ttl,
          sessionId: msg.sessionId,
          maxBodySizeBytes: msg.maxBodySizeBytes,
        });
        break;
      }

      case "http-request": {
        const contentLength = parseContentLength(
          headerValue(msg.headers, "content-length"),
        );
        if (contentLength !== null && contentLength > maxBodySizeBytes) {
          respondWith413(msg.id, `Request body exceeds ${maxBodySizeBytes} byte limit`);
          break;
        }

        if (msg.hasBody) {
          // Store metadata; wait for body chunks + http-request-end
          requestBodyChunks.set(msg.id, []);
          requestBodySizes.set(msg.id, 0);
          pendingRequestMeta.set(msg.id, msg);
        } else {
          // No body, handle immediately
          handleHttpRequest(msg, null);
        }
        break;
      }

      case "http-request-end": {
        const chunks = requestBodyChunks.get(msg.id);
        requestBodyChunks.delete(msg.id);

        const reqMeta = pendingRequestMeta.get(msg.id);
        pendingRequestMeta.delete(msg.id);
        requestBodySizes.delete(msg.id);

        if (!reqMeta) break;

        if (oversizedRequestIds.delete(msg.id)) {
          respondWith413(msg.id, `Request body exceeds ${maxBodySizeBytes} byte limit`);
          break;
        }

        const body = concatChunks(chunks ?? []);
        handleHttpRequest(reqMeta, body.byteLength > 0 ? body : null);
        break;
      }

      case "http-body-chunk": {
        // Binary data follows, handled in binary frame branch.
        break;
      }

      case "error": {
        if (msg.message === "Tunnel TTL expired") {
          emitStatus("expired");
          emitter.emit("expired");
        } else {
          emitter.emit("error", new Error(msg.message));
        }
        break;
      }
    }
  }

  async function handleHttpRequest(
    msg: HttpRequestMessage,
    body: Uint8Array | null,
  ) {
    const startTime = Date.now();
    const localUrl = `http://${opts.host}:${opts.port}${msg.path}`;

    try {
      const reqHeaders = new Headers();
      for (const [key, value] of Object.entries(msg.headers)) {
        const lower = key.toLowerCase();
        if (
          lower === "host" ||
          lower === "connection" ||
          lower === "transfer-encoding"
        )
          continue;
        reqHeaders.set(key, value);
      }

      const response = await fetch(localUrl, {
        method: msg.method,
        headers: reqHeaders,
        body: body ? toArrayBuffer(body) : undefined,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const contentLength = parseContentLength(
        headerValue(responseHeaders, "content-length"),
      );
      if (contentLength !== null && contentLength > maxBodySizeBytes) {
        respondWith413(msg.id, `Response body exceeds ${maxBodySizeBytes} byte limit`);
        emitter.emit("traffic", {
          id: msg.id,
          method: msg.method,
          path: msg.path,
          status: 413,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        } satisfies TrafficEntry);
        return;
      }

      const bufferedResponse = await readBodyWithinLimit(response.body);
      if (!bufferedResponse) {
        respondWith413(msg.id, `Response body exceeds ${maxBodySizeBytes} byte limit`);
        emitter.emit("traffic", {
          id: msg.id,
          method: msg.method,
          path: msg.path,
          status: 413,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        } satisfies TrafficEntry);
        return;
      }

      const hasBody = bufferedResponse.totalBytes > 0;

      sendMessage({
        type: "http-response-meta",
        id: msg.id,
        status: response.status,
        headers: responseHeaders,
        hasBody,
      } satisfies TunnelMessage);

      if (hasBody) {
        for (const chunk of bufferedResponse.chunks) {
          sendMessage({
            type: "http-body-chunk",
            id: msg.id,
            done: false,
          } satisfies TunnelMessage);
          ws?.send(encodeBinaryFrame(msg.id, chunk));
        }
      }

      sendMessage({
        type: "http-response-end",
        id: msg.id,
      } satisfies TunnelMessage);

      emitter.emit("traffic", {
        id: msg.id,
        method: msg.method,
        path: msg.path,
        status: response.status,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      } satisfies TrafficEntry);
    } catch (err) {
      sendMessage({
        type: "error",
        message: `Failed to reach localhost:${opts.port}: ${(err as Error).message}`,
        requestId: msg.id,
        status: 502,
      } satisfies TunnelMessage);

      emitter.emit("traffic", {
        id: msg.id,
        method: msg.method,
        path: msg.path,
        status: 502,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      } satisfies TrafficEntry);
    }
  }

  function concatChunks(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= PROTOCOL.BACKOFF_MAX_ATTEMPTS) {
      emitStatus("disconnected");
      return;
    }

    emitStatus("reconnecting");

    const baseDelay =
      PROTOCOL.BACKOFF_BASE_MS *
      Math.pow(PROTOCOL.BACKOFF_MULTIPLIER, reconnectAttempts);
    const delay = Math.min(baseDelay, PROTOCOL.BACKOFF_MAX_MS);
    const jitter =
      delay *
      (PROTOCOL.BACKOFF_JITTER_MIN +
        Math.random() *
          (PROTOCOL.BACKOFF_JITTER_MAX - PROTOCOL.BACKOFF_JITTER_MIN));

    reconnectAttempts++;
    setTimeout(() => connect(), delay + jitter);
  }

  function disconnect() {
    disconnectedIntentionally = true;
    emitStatus("disconnected");
    ws?.close(1000, "Client disconnect");
    ws = null;
  }

  return {
    connect,
    disconnect,
    on: emitter.on.bind(emitter) as TunnelClient["on"],
  };
}
