import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveSession,
  loadSession,
  clearSession,
  setConfigDirOverride,
  type Session,
} from "../session.js";

describe("session", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "xpose-session-test-"));
    setConfigDirOverride(tempDir);
  });

  afterEach(() => {
    setConfigDirOverride(undefined);
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeSession(overrides?: Partial<Session>): Session {
    return {
      tunnels: [{ subdomain: "abc123", port: 3000, domain: "xpose.dev" }],
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("saves and loads a session", () => {
    const session = makeSession();
    saveSession(session);

    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.tunnels).toEqual(session.tunnels);
    expect(loaded!.createdAt).toBe(session.createdAt);
  });

  it("returns null when no session file exists", () => {
    expect(loadSession()).toBeNull();
  });

  it("returns null for expired session", () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
    const session = makeSession({ createdAt: elevenMinutesAgo.toISOString() });
    saveSession(session);

    expect(loadSession()).toBeNull();
  });

  it("returns session within the resume window", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const session = makeSession({ createdAt: fiveMinutesAgo.toISOString() });
    saveSession(session);

    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.tunnels[0].port).toBe(3000);
  });

  it("returns null for corrupt JSON", () => {
    const path = join(tempDir, "session.json");
    const { writeFileSync } = require("node:fs");
    writeFileSync(path, "not json at all", "utf-8");

    expect(loadSession()).toBeNull();
  });

  it("returns null for invalid structure", () => {
    const path = join(tempDir, "session.json");
    const { writeFileSync } = require("node:fs");
    writeFileSync(path, JSON.stringify({ foo: "bar" }), "utf-8");

    expect(loadSession()).toBeNull();
  });

  it("clears the session file", () => {
    const session = makeSession();
    saveSession(session);

    const path = join(tempDir, "session.json");
    expect(existsSync(path)).toBe(true);

    clearSession();
    expect(existsSync(path)).toBe(false);
  });

  it("clearSession does not throw when file does not exist", () => {
    expect(() => clearSession()).not.toThrow();
  });

  it("saves multiple tunnels", () => {
    const session = makeSession({
      tunnels: [
        { subdomain: "abc123", port: 3000, domain: "xpose.dev" },
        { subdomain: "def456", port: 8787, domain: "xpose.dev" },
      ],
    });
    saveSession(session);

    const loaded = loadSession();
    expect(loaded!.tunnels).toHaveLength(2);
    expect(loaded!.tunnels[1].port).toBe(8787);
  });

  it("writes valid JSON to disk", () => {
    const session = makeSession();
    saveSession(session);

    const raw = readFileSync(join(tempDir, "session.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.tunnels).toEqual(session.tunnels);
    expect(parsed.createdAt).toBe(session.createdAt);
  });
});
