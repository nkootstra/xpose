import { describe, it, expect } from "vitest";
import { generateSubdomainId, generateRequestId } from "../subdomain.js";
import { PROTOCOL } from "../constants.js";

describe("generateSubdomainId", () => {
  it(`returns a string of length ${PROTOCOL.SUBDOMAIN_LENGTH}`, () => {
    const id = generateSubdomainId();
    expect(typeof id).toBe("string");
    expect(id).toHaveLength(PROTOCOL.SUBDOMAIN_LENGTH);
  });

  it("only contains lowercase letters and digits", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateSubdomainId();
      expect(id).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("produces unique values across 100 calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSubdomainId());
    }
    expect(ids.size).toBe(100);
  });
});

describe("generateRequestId", () => {
  it(`returns a string of length ${PROTOCOL.REQUEST_ID_LENGTH}`, () => {
    const id = generateRequestId();
    expect(typeof id).toBe("string");
    expect(id).toHaveLength(PROTOCOL.REQUEST_ID_LENGTH);
  });

  it("only contains lowercase letters and digits", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateRequestId();
      expect(id).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("produces unique values across 100 calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });
});
