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
  | ErrorMessage;

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
