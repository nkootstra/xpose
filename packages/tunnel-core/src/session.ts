import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { PROTOCOL, type TunnelConfig } from "@xpose/protocol";

const SESSION_FILE_NAME = "session.json";

export interface TunnelEntry {
  subdomain: string;
  port: number;
  domain: string;
  /** Optional tunnel access-control and response configuration. */
  config?: TunnelConfig;
}

export interface Session {
  tunnels: TunnelEntry[];
  createdAt: string; // ISO 8601
}

/** Allow tests to override the config directory. */
let configDirOverride: string | undefined;

export function setConfigDirOverride(dir: string | undefined): void {
  configDirOverride = dir;
}

function getConfigDir(create: boolean): string {
  const dir = configDirOverride ?? join(homedir(), ".config", "xpose");
  if (create) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getSessionPath(create: boolean): string {
  return join(getConfigDir(create), SESSION_FILE_NAME);
}

/** Save a session to disk. */
export function saveSession(session: Session): void {
  const path = getSessionPath(true);
  writeFileSync(path, JSON.stringify(session, null, 2), "utf-8");
}

/**
 * Load a session from disk.
 * Returns `null` if the file does not exist, is corrupt, or has expired.
 */
export function loadSession(): Session | null {
  const path = getSessionPath(false);

  let data: string;
  try {
    data = readFileSync(path, "utf-8");
  } catch {
    return null; // file doesn't exist
  }

  let session: Session;
  try {
    session = JSON.parse(data);
  } catch {
    return null; // corrupt file
  }

  if (!session.createdAt || !Array.isArray(session.tunnels)) {
    return null;
  }

  const elapsed = Date.now() - new Date(session.createdAt).getTime();
  const windowMs = PROTOCOL.SESSION_RESUME_WINDOW_SECONDS * 1000;
  if (elapsed > windowMs) {
    return null; // expired
  }

  return session;
}

/** Remove the session file. */
export function clearSession(): void {
  try {
    unlinkSync(getSessionPath(false));
  } catch {
    // ignore — file may not exist
  }
}
