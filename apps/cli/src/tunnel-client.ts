import WebSocket from "ws";
import { EventEmitter } from "node:events";
import {
  PROTOCOL,
  parseTextMessage,
  encodeBinaryFrame,
  decodeBinaryFrame,
  type TunnelMessage,
  type TunnelConfig,
  type HttpRequestMessage,
  type WsFrameMessage,
} from "@xpose/protocol";
import { WsRelayManager } from "./ws-relay.js";
import type { TrafficEntry, TunnelStatus } from "@xpose/tunnel-core";

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
  /** Optional tunnel access-control and response configuration. */
  config?: TunnelConfig;
}

/** Max body size to capture for the inspection dashboard (128 KB). */
const INSPECT_MAX_BODY_BYTES = 128 * 1024;

/** Content types that are captured as text for the inspection dashboard. */
const TEXT_CONTENT_TYPES = [
  "application/json",
  "application/xml",
  "text/xml",
  "text/html",
  "text/plain",
  "text/css",
  "text/csv",
  "text/javascript",
  "application/javascript",
  "application/x-www-form-urlencoded",
  "application/graphql",
  "application/ld+json",
  "application/xhtml+xml",
  "application/soap+xml",
  "image/svg+xml",
];

/** Check whether the content-type header indicates textual content worth capturing. */
function isTextContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const mimeType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    TEXT_CONTENT_TYPES.some((t) => mimeType === t) ||
    mimeType.startsWith("text/") ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  );
}

/**
 * Capture a body as a UTF-8 string for the inspection dashboard.
 * Returns `null` for binary content or when the body is absent.
 */
function captureBodyForInspect(
  raw: Uint8Array | null,
  contentType: string | undefined,
): string | null {
  if (!raw || raw.byteLength === 0) return null;
  if (!isTextContentType(contentType)) return null;
  const bytes =
    raw.byteLength > INSPECT_MAX_BODY_BYTES
      ? raw.slice(0, INSPECT_MAX_BODY_BYTES)
      : raw;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Captured request/response data for the inspection dashboard. */
export interface InspectEntry {
  id: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string | null;
  responseBody?: string | null;
  requestContentType?: string;
  responseContentType?: string;
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
  on(event: "inspect", listener: (entry: InspectEntry) => void): void;
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

  // WebSocket relay support
  const wsRelayMgr = new WsRelayManager(opts.host, opts.port);
  // Track pending WS frame types (set by ws-frame text message, consumed by next binary frame)
  const pendingWsFrameTypes = new Map<string, "text" | "binary">();

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

    // Check if this is a WS relay frame
    const frameType = pendingWsFrameTypes.get(requestId);
    if (frameType !== undefined) {
      pendingWsFrameTypes.delete(requestId);
      wsRelayMgr.handleFrame(
        {
          type: "ws-frame",
          streamId: requestId,
          frameType,
        } satisfies WsFrameMessage,
        body,
      );
      return;
    }

    // Otherwise it's an HTTP request body chunk
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
        config: opts.config,
      } satisfies TunnelMessage);
    });

    ws.on("message", (data: WebSocket.Data) => {
      // Binary frame: body chunk for an incoming request or WS relay
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
      const raw = typeof data === "string" ? data : String(data);
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
        // Use remainingTtl for countdown if the server provided it
        const displayTtl = msg.remainingTtl > 0 ? msg.remainingTtl : msg.ttl;
        emitStatus("connected");
        emitter.emit("authenticated", {
          url: msg.url,
          ttl: displayTtl,
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
          respondWith413(
            msg.id,
            `Request body exceeds ${maxBodySizeBytes} byte limit`,
          );
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
          respondWith413(
            msg.id,
            `Request body exceeds ${maxBodySizeBytes} byte limit`,
          );
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

      case "ping": {
        sendMessage({ type: "pong" } satisfies TunnelMessage);
        break;
      }

      case "ws-upgrade": {
        // Server asks us to open a local WebSocket connection
        wsRelayMgr.handleUpgrade(ws!, msg, sendMessage);
        break;
      }

      case "ws-frame": {
        // A WS frame header from the server. The actual payload follows as a binary frame.
        // Store the frame type so handleBinaryFrame can dispatch correctly.
        pendingWsFrameTypes.set(msg.streamId, msg.frameType);
        break;
      }

      case "ws-close": {
        wsRelayMgr.handleClose(msg);
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

  /** Emit an inspect event with request/response metadata and captured bodies. */
  function emitInspect(
    msg: HttpRequestMessage,
    status: number,
    responseHeaders: Record<string, string>,
    duration: number,
    requestBody: Uint8Array | null,
    responseBody: Uint8Array | null,
  ): void {
    const reqContentType =
      headerValue(msg.headers, "content-type") ?? undefined;
    const resContentType =
      headerValue(responseHeaders, "content-type") ?? undefined;

    emitter.emit("inspect", {
      id: msg.id,
      method: msg.method,
      path: msg.path,
      status,
      duration,
      timestamp: Date.now(),
      requestHeaders: msg.headers,
      responseHeaders,
      requestBody: captureBodyForInspect(requestBody, reqContentType),
      responseBody: captureBodyForInspect(responseBody, resContentType),
      requestContentType: reqContentType,
      responseContentType: resContentType,
    } satisfies InspectEntry);
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
        redirect: "manual",
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const contentLength = parseContentLength(
        headerValue(responseHeaders, "content-length"),
      );
      if (contentLength !== null && contentLength > maxBodySizeBytes) {
        const duration = Date.now() - startTime;
        respondWith413(
          msg.id,
          `Response body exceeds ${maxBodySizeBytes} byte limit`,
        );
        emitter.emit("traffic", {
          id: msg.id,
          method: msg.method,
          path: msg.path,
          status: 413,
          duration,
          timestamp: new Date(),
        } satisfies TrafficEntry);
        emitInspect(msg, 413, responseHeaders, duration, body, null);
        return;
      }

      const bufferedResponse = await readBodyWithinLimit(response.body);
      if (!bufferedResponse) {
        const duration = Date.now() - startTime;
        respondWith413(
          msg.id,
          `Response body exceeds ${maxBodySizeBytes} byte limit`,
        );
        emitter.emit("traffic", {
          id: msg.id,
          method: msg.method,
          path: msg.path,
          status: 413,
          duration,
          timestamp: new Date(),
        } satisfies TrafficEntry);
        emitInspect(msg, 413, {}, duration, body, null);
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
        const chunkSize = 64 * 1024; // 64KB chunks
        for (const chunk of bufferedResponse.chunks) {
          // Split large chunks into 64KB pieces
          for (let offset = 0; offset < chunk.byteLength; offset += chunkSize) {
            const end = Math.min(offset + chunkSize, chunk.byteLength);
            const piece = chunk.slice(offset, end);

            sendMessage({
              type: "http-body-chunk",
              id: msg.id,
              done: false,
            } satisfies TunnelMessage);
            ws?.send(encodeBinaryFrame(msg.id, piece));
          }
        }
      }

      sendMessage({
        type: "http-response-end",
        id: msg.id,
      } satisfies TunnelMessage);

      const duration = Date.now() - startTime;
      const responseBodyConcat = hasBody
        ? concatChunks(bufferedResponse.chunks)
        : null;

      emitter.emit("traffic", {
        id: msg.id,
        method: msg.method,
        path: msg.path,
        status: response.status,
        duration,
        timestamp: new Date(),
      } satisfies TrafficEntry);

      emitInspect(
        msg,
        response.status,
        responseHeaders,
        duration,
        body,
        responseBodyConcat,
      );
    } catch (err) {
      const errMessage = (err as Error).message;
      const isConnectionRefused =
        errMessage.includes("ECONNREFUSED") ||
        errMessage.includes("fetch failed");

      sendMessage({
        type: "error",
        message: isConnectionRefused
          ? `Could not connect to localhost:${opts.port} — is your server running?`
          : `Failed to reach localhost:${opts.port}: ${errMessage}`,
        requestId: msg.id,
        status: 502,
      } satisfies TunnelMessage);

      const duration = Date.now() - startTime;
      emitter.emit("traffic", {
        id: msg.id,
        method: msg.method,
        path: msg.path,
        status: 502,
        duration,
        timestamp: new Date(),
      } satisfies TrafficEntry);

      emitInspect(msg, 502, {}, duration, body, null);
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
    wsRelayMgr.closeAll();
    ws?.close(1000, "Client disconnect");
    ws = null;
  }

  return {
    connect,
    disconnect,
    on: emitter.on.bind(emitter) as TunnelClient["on"],
  };
}
