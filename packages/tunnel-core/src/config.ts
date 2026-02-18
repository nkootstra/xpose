import type { TunnelConfig } from "@xpose/protocol";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Configuration for a single tunnel in xpose.config.ts.
 */
export interface XposeTunnelConfig {
  /** Local port to expose. */
  port: number;
  /** Custom subdomain prefix (a random suffix is appended). */
  subdomain?: string;
  /** Tunnel TTL in seconds. */
  ttl?: number;
  /** IP addresses or CIDR ranges allowed to access the tunnel. */
  allowIps?: string[];
  /** Max requests per minute per source IP (0 = unlimited). */
  rateLimit?: number;
  /** Enable permissive CORS headers on all responses. */
  cors?: boolean;
  /** Custom response headers to inject. */
  headers?: Record<string, string>;
}

/**
 * Root configuration for xpose.config.ts.
 */
export interface XposeConfig {
  /** Public tunnel domain (default: xpose.dev). */
  domain?: string;
  /** Enable the local request inspection dashboard (true = default port, number = custom port). */
  inspect?: boolean | number;
  /** One or more tunnels to create. */
  tunnels: XposeTunnelConfig[];
}

/**
 * Helper for type-safe config files.
 *
 * @example
 * ```ts
 * // xpose.config.ts
 * import { defineConfig } from "@xpose/tunnel-core";
 *
 * export default defineConfig({
 *   tunnels: [{ port: 3000 }],
 * });
 * ```
 */
export function defineConfig(config: XposeConfig): XposeConfig {
  return config;
}

/** Convert an XposeTunnelConfig to the protocol TunnelConfig. */
export function toTunnelConfig(
  cfg: XposeTunnelConfig,
): TunnelConfig | undefined {
  const hasConfig =
    cfg.allowIps?.length ||
    cfg.rateLimit !== undefined ||
    cfg.cors !== undefined ||
    (cfg.headers && Object.keys(cfg.headers).length > 0);

  if (!hasConfig) return undefined;

  return {
    allowedIps: cfg.allowIps,
    rateLimit: cfg.rateLimit,
    cors: cfg.cors,
    customHeaders: cfg.headers,
  };
}

const CONFIG_FILE_NAMES = ["xpose.config.ts", "xpose.config.js"];

/**
 * Load an xpose config file from the given directory.
 *
 * Looks for `xpose.config.ts` then `xpose.config.js`.
 * Returns `null` if no config file is found.
 */
export async function loadConfig(cwd: string): Promise<XposeConfig | null> {
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = resolve(cwd, name);
    if (!existsSync(configPath)) continue;

    try {
      const fileUrl = pathToFileURL(configPath).href;
      const mod = await import(fileUrl);
      const config: XposeConfig = mod.default ?? mod;

      if (!config || !Array.isArray(config.tunnels)) {
        throw new Error(
          `Invalid config in ${name}: expected an object with a "tunnels" array`,
        );
      }

      return config;
    } catch (err) {
      if ((err as Error).message?.includes("Invalid config")) {
        throw err;
      }
      throw new Error(`Failed to load ${name}: ${(err as Error).message}`);
    }
  }

  return null;
}
