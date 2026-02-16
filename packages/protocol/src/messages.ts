// ---- Text frame messages (sent as JSON strings over WebSocket) ----

export interface AuthMessage {
  type: "auth";
  subdomain: string;
  ttl?: number;
  sessionId?: string;
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
