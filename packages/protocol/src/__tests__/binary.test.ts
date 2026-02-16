import { describe, it, expect } from "vitest";
import { encodeBinaryFrame, decodeBinaryFrame } from "../binary.js";
import { PROTOCOL } from "../constants.js";

describe("encodeBinaryFrame / decodeBinaryFrame", () => {
  it("roundtrip preserves requestId and body", () => {
    const requestId = "abcdef123456";
    const body = new TextEncoder().encode("hello world");

    const frame = encodeBinaryFrame(requestId, body);
    const decoded = decodeBinaryFrame(frame);

    expect(decoded.requestId).toBe(requestId);
    expect(decoded.body).toEqual(body);
  });

  it("produces correct binary layout: first 12 bytes are ASCII requestId, rest is body", () => {
    const requestId = "abcdef123456";
    const body = new Uint8Array([0x01, 0x02, 0x03]);

    const frame = encodeBinaryFrame(requestId, body);
    const view = new Uint8Array(frame);

    expect(view.byteLength).toBe(PROTOCOL.REQUEST_ID_LENGTH + 3);

    const idPart = new TextDecoder().decode(
      view.slice(0, PROTOCOL.REQUEST_ID_LENGTH),
    );
    expect(idPart).toBe(requestId);

    const bodyPart = view.slice(PROTOCOL.REQUEST_ID_LENGTH);
    expect(bodyPart).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
  });

  it("empty body produces a frame of exactly 12 bytes", () => {
    const requestId = "abcdef123456";
    const body = new Uint8Array(0);

    const frame = encodeBinaryFrame(requestId, body);
    const view = new Uint8Array(frame);

    expect(view.byteLength).toBe(PROTOCOL.REQUEST_ID_LENGTH);

    const decoded = decodeBinaryFrame(frame);
    expect(decoded.requestId).toBe(requestId);
    expect(decoded.body.byteLength).toBe(0);
  });

  it("large body (1 MB) roundtrips correctly", () => {
    const requestId = "zzzzzzzzzzzz";
    const size = 1024 * 1024;
    const body = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      body[i] = i % 256;
    }

    const frame = encodeBinaryFrame(requestId, body);
    const decoded = decodeBinaryFrame(frame);

    expect(decoded.requestId).toBe(requestId);
    expect(decoded.body.byteLength).toBe(size);
    expect(decoded.body).toEqual(body);
  }, 15000);
});
