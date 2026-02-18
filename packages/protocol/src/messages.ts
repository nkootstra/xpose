// ---- Text frame messages (sent as JSON strings over WebSocket) ----

/** Tunnel configuration sent from CLI to server during auth. */
export interface TunnelConfig {
  /** IP addresses or CIDR ranges allowed to access the tunnel. */
  allowedIps?: string[];
  /** Max requests per minute per source IP (0 = unlimited). */
  rateLimit?: number;
  /** Enable permissive CORS headers on all responses. */
  cors?: boolean;
  /** Custom response headers to inject. */
  customHeaders?: Record<string, string>;
}

export interface AuthMessage {
  type: "auth";
  subdomain: string;
  ttl?: number;
  sessionId?: string;
  /** Optional tunnel access-control and response configuration. */
  config?: TunnelConfig;
}

export interface AuthAckMessage {
  type: "auth-ack";
  subdomain: string;
  url: string;
  ttl: number;
  /** Actual seconds remaining on the alarm (may be less than ttl on resume) */
  remainingTtl: number;
  sessionId: string;
  maxBodySizeBytes: number;
  /** Echoed-back tunnel config accepted by the server. */
  config?: TunnelConfig;
}

export interface HttpRequestMessage {
  type: "http-request";
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  hasBody: boolean;
}

export interface HttpResponseMetaMessage {
  type: "http-response-meta";
  id: string;
  status: number;
  headers: Record<string, string>;
  hasBody: boolean;
}

export interface HttpBodyChunkMessage {
  type: "http-body-chunk";
  id: string;
  done: boolean;
}

export interface HttpRequestEndMessage {
  type: "http-request-end";
  id: string;
}

export interface HttpResponseEndMessage {
  type: "http-response-end";
  id: string;
}

export interface PingMessage {
  type: "ping";
}

export interface PongMessage {
  type: "pong";
}

export interface ErrorMessage {
  type: "error";
  message: string;
  requestId?: string;
  status?: number;
}

// ---- WebSocket relay messages (for proxying browser WS through tunnel) ----

export interface WsUpgradeMessage {
  type: "ws-upgrade";
  streamId: string;
  path: string;
  headers: Record<string, string>;
}

export interface WsUpgradeAckMessage {
  type: "ws-upgrade-ack";
  streamId: string;
  ok: boolean;
  error?: string;
}

export interface WsFrameMessage {
  type: "ws-frame";
  streamId: string;
  /** "text" or "binary" */
  frameType: "text" | "binary";
}

export interface WsCloseMessage {
  type: "ws-close";
  streamId: string;
  code: number;
  reason: string;
}

export type TunnelMessage =
  | AuthMessage
  | AuthAckMessage
  | HttpRequestMessage
  | HttpResponseMetaMessage
  | HttpBodyChunkMessage
  | HttpRequestEndMessage
  | HttpResponseEndMessage
  | PingMessage
  | PongMessage
  | ErrorMessage
  | WsUpgradeMessage
  | WsUpgradeAckMessage
  | WsFrameMessage
  | WsCloseMessage;

export function isTunnelMessage(data: unknown): data is TunnelMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as TunnelMessage).type === "string"
  );
}

export function parseTextMessage(raw: string): TunnelMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (isTunnelMessage(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}
