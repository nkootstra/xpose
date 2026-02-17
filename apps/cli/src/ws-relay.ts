import WebSocket from "ws";
import {
  encodeBinaryFrame,
  type TunnelMessage,
  type WsUpgradeMessage,
  type WsFrameMessage,
  type WsCloseMessage,
} from "@xpose/protocol";

/**
 * A single active WebSocket relay: browser <-> tunnel <-> local WS server.
 */
interface WsRelay {
  streamId: string;
  localConn: WebSocket;
}

/**
 * Manages active WebSocket relay connections, forwarding frames between
 * the tunnel WebSocket and local WebSocket servers.
 *
 * WebSocket relay manager for proxying WebSocket connections through the tunnel.
 */
export class WsRelayManager {
  private relays = new Map<string, WsRelay>();
  private host: string;
  private port: number;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  /**
   * Handle a ws-upgrade request from the server: dial the local WebSocket
   * endpoint and start relaying frames.
   */
  handleUpgrade(
    tunnelWs: WebSocket,
    msg: WsUpgradeMessage,
    sendMessage: (message: TunnelMessage) => void,
  ): void {
    const localUrl = `ws://${this.host}:${this.port}${msg.path}`;

    // Build headers, skipping WebSocket handshake headers the local dial creates
    const skipHeaders = new Set([
      "host",
      "upgrade",
      "connection",
      "sec-websocket-key",
      "sec-websocket-version",
      "sec-websocket-extensions",
    ]);

    const headers: Record<string, string> = {};
    const subprotocols: string[] = [];

    for (const [key, value] of Object.entries(msg.headers)) {
      const lower = key.toLowerCase();
      if (skipHeaders.has(lower)) continue;
      if (lower === "sec-websocket-protocol") {
        for (const p of value.split(",")) {
          const trimmed = p.trim();
          if (trimmed) subprotocols.push(trimmed);
        }
        continue;
      }
      headers[lower] = value;
    }

    const localConn = new WebSocket(localUrl, subprotocols, { headers });
    localConn.binaryType = "arraybuffer";

    localConn.on("error", () => {
      sendMessage({
        type: "ws-upgrade-ack",
        streamId: msg.streamId,
        ok: false,
        error: `Failed to connect to ${localUrl}`,
      } satisfies TunnelMessage);
      this.relays.delete(msg.streamId);
    });

    localConn.on("open", () => {
      const relay: WsRelay = {
        streamId: msg.streamId,
        localConn,
      };
      this.relays.set(msg.streamId, relay);

      // Confirm success
      sendMessage({
        type: "ws-upgrade-ack",
        streamId: msg.streamId,
        ok: true,
      } satisfies TunnelMessage);

      // Start reading from local WS and forwarding to tunnel
      this.readLocalAndForward(tunnelWs, relay, sendMessage);
    });

    localConn.on("close", () => {
      if (!this.relays.has(msg.streamId)) return;

      sendMessage({
        type: "ws-close",
        streamId: msg.streamId,
        code: 1000,
        reason: "Local WebSocket closed",
      } satisfies TunnelMessage);
      this.relays.delete(msg.streamId);
    });
  }

  /**
   * Read frames from the local WebSocket and forward them through the tunnel.
   */
  private readLocalAndForward(
    tunnelWs: WebSocket,
    relay: WsRelay,
    sendMessage: (message: TunnelMessage) => void,
  ): void {
    relay.localConn.on("message", (data: WebSocket.Data, isBinary: boolean) => {
      if (!this.relays.has(relay.streamId)) return;

      const frameType = isBinary ? "binary" : "text";

      // Send ws-frame header
      sendMessage({
        type: "ws-frame",
        streamId: relay.streamId,
        frameType,
      } satisfies TunnelMessage);

      // Send binary frame with streamId prefix + data
      let body: Uint8Array;
      if (Buffer.isBuffer(data)) {
        body = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else if (data instanceof ArrayBuffer) {
        body = new Uint8Array(data);
      } else if (typeof data === "string") {
        body = new TextEncoder().encode(data);
      } else {
        // Array of Buffers
        body = Buffer.concat(data as Buffer[]);
      }

      const frame = encodeBinaryFrame(relay.streamId, body);
      tunnelWs.send(frame);
    });
  }

  /**
   * Forward a WS frame from the browser (via tunnel) to the local WS.
   */
  handleFrame(msg: WsFrameMessage, body: Uint8Array): void {
    const relay = this.relays.get(msg.streamId);
    if (!relay) return;

    if (msg.frameType === "text") {
      // Send as text string
      const text = new TextDecoder().decode(body);
      relay.localConn.send(text);
    } else {
      // Send as binary
      relay.localConn.send(body);
    }
  }

  /**
   * Close a relay stream.
   */
  handleClose(msg: WsCloseMessage): void {
    this.closeRelay(msg.streamId);
  }

  /**
   * Tear down a single relay connection.
   */
  private closeRelay(streamId: string): void {
    const relay = this.relays.get(streamId);
    if (!relay) return;

    this.relays.delete(streamId);
    try {
      relay.localConn.close(1000, "Stream closed");
    } catch {
      // Ignore errors on close
    }
  }

  /**
   * Tear down all active relay connections.
   */
  closeAll(): void {
    for (const relay of this.relays.values()) {
      try {
        relay.localConn.close(1000, "All streams closed");
      } catch {
        // Ignore errors on close
      }
    }
    this.relays.clear();
  }
}
