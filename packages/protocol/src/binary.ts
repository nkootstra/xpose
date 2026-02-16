import { PROTOCOL } from "./constants.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encode a binary body chunk: [requestId (12 bytes ASCII)][body bytes]
 */
export function encodeBinaryFrame(
  requestId: string,
  body: Uint8Array,
): ArrayBuffer {
  const idBytes = encoder.encode(requestId);
  const frame = new Uint8Array(PROTOCOL.REQUEST_ID_LENGTH + body.byteLength);
  frame.set(idBytes, 0);
  frame.set(body, PROTOCOL.REQUEST_ID_LENGTH);
  return frame.buffer;
}

/**
 * Decode a binary frame into requestId and body
 */
export function decodeBinaryFrame(buffer: ArrayBuffer): {
  requestId: string;
  body: Uint8Array;
} {
  const view = new Uint8Array(buffer);
  const requestId = decoder.decode(
    view.slice(0, PROTOCOL.REQUEST_ID_LENGTH),
  );
  const body = view.slice(PROTOCOL.REQUEST_ID_LENGTH);
  return { requestId, body };
}
