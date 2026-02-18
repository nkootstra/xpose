import { defineCommand, runMain } from "citty";
import {
  PROTOCOL,
  generateSubdomainId,
  buildCustomSubdomain,
  type TunnelConfig,
} from "@xpose/protocol";
import { createTunnelClient } from "./tunnel-client.js";
import { InspectServer } from "./inspect-server.js";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  printError,
  discoverTurboPorts,
  normalizeDomain,
  saveSession,
  loadSession,
  loadConfig,
  toTunnelConfig,
  type TunnelEntry,
  type XposeConfig,
} from "@xpose/tunnel-core";
import React from "react";
import { render } from "ink";
import { App } from "./tui/app.js";

/**
 * Create tunnel clients from entries, save the session, run the TUI,
 * and print the resume hint on exit.
 */
async function runTunnels(
  entries: TunnelEntry[],
  rawTtl: number,
  inspectServer: InspectServer | null,
): Promise<void> {
  const tunnelTtl = Math.min(rawTtl, PROTOCOL.MAX_TTL_SECONDS);

  // Save session so it can be resumed after exit
  saveSession({
    tunnels: entries,
    createdAt: new Date().toISOString(),
  });

  const clients = entries.map(({ subdomain, port, domain, config }) =>
    createTunnelClient({
      subdomain,
      port,
      ttl: tunnelTtl,
      host: "localhost",
      domain,
      config,
    }),
  );

  const ports = entries.map((e) => e.port);

  // Wire up inspect events if the inspect server is active
  if (inspectServer) {
    for (const client of clients) {
      client.on("inspect", (entry) => {
        inspectServer.push(entry);
      });
    }
  }

  // Start all tunnel connections
  for (const client of clients) {
    client.connect();
  }

  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    // Update session timestamp so resume window starts from exit time
    saveSession({
      tunnels: entries,
      createdAt: new Date().toISOString(),
    });

    for (const client of clients) {
      client.disconnect();
    }

    if (inspectServer) {
      await inspectServer.stop();
    }

    const minutes = PROTOCOL.SESSION_RESUME_WINDOW_SECONDS / 60;
    console.error(
      `\n  Session saved. Resume within ${minutes} minutes with: xpose-dev -r\n`,
    );
  }

  // Ensure clean shutdown on SIGINT (Ctrl+C) and SIGTERM
  const signalHandler = async () => {
    await shutdown();
    process.exit(0);
  };
  process.on("SIGINT", signalHandler);
  process.on("SIGTERM", signalHandler);

  // Build inspect URL for the TUI
  const inspectUrl = inspectServer
    ? `https://local.xpose.dev/inspect?port=${inspectServer.boundPort}`
    : undefined;

  // Render the ink TUI
  const inkApp = render(
    React.createElement(App, {
      clients,
      ports,
      inspectUrl,
      onQuit: shutdown,
    }),
  );

  inkApp.waitUntilExit().then(async () => {
    await shutdown();
    process.exit(0);
  });
}

/**
 * Parse --header flag values like "X-Custom: value" into a record.
 * Supports comma-separated or repeated flags.
 */
function parseHeaderFlag(
  raw: string | string[] | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  const items = Array.isArray(raw) ? raw : [raw];
  const headers: Record<string, string> = {};
  for (const item of items) {
    const colonIdx = item.indexOf(":");
    if (colonIdx === -1) continue;
    const key = item.slice(0, colonIdx).trim();
    const value = item.slice(colonIdx + 1).trim();
    if (key) headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Start the local inspection server.
 * Returns null only if --no-inspect is set or all port attempts fail.
 * Tries up to MAX_PORT_RETRIES consecutive ports on EADDRINUSE.
 */
const MAX_PORT_RETRIES = 10;

async function maybeStartInspect(
  noInspect: boolean | undefined,
  inspectPortRaw: string | undefined,
): Promise<InspectServer | null> {
  if (noInspect) return null;

  const basePort = inspectPortRaw
    ? Number.parseInt(inspectPortRaw, 10)
    : PROTOCOL.INSPECT_PORT;

  if (Number.isNaN(basePort) || basePort < 1 || basePort > 65535) {
    printError("Invalid --inspect-port. Must be between 1 and 65535.");
    process.exit(1);
  }

  for (let attempt = 0; attempt < MAX_PORT_RETRIES; attempt++) {
    const port = basePort + attempt;
    if (port > 65535) break;

    const server = new InspectServer(port);
    try {
      await server.start();
      return server;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE" && !inspectPortRaw) {
        // Port in use and no explicit port requested — try next port
        continue;
      }
      // Explicit port requested or non-EADDRINUSE error — warn and continue without inspect
      printError(
        `Could not start inspect server on port ${port}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // All ports exhausted — not fatal, just skip inspect
  return null;
}

const main = defineCommand({
  meta: {
    name: "xpose-dev",
    version: "0.0.1",
    description: "Expose local servers to the internet via Cloudflare",
  },
  args: {
    port: {
      type: "positional",
      description: "Local port to expose (optional when using --from-turbo)",
      required: false,
    },
    fromTurbo: {
      type: "boolean",
      description: "Auto-detect ports from `turbo run <task> --dry=json`",
    },
    turboTask: {
      type: "string",
      description: "Turborepo task to inspect when using --from-turbo",
      default: "dev",
    },
    turboFilter: {
      type: "string",
      description: "Optional Turborepo filter when using --from-turbo",
    },
    turboPath: {
      type: "string",
      alias: "path",
      description: "Path to the Turborepo project root when using --from-turbo",
    },
    ttl: {
      type: "string",
      description: `Tunnel TTL in seconds (default: ${PROTOCOL.DEFAULT_TTL_SECONDS})`,
      default: String(PROTOCOL.DEFAULT_TTL_SECONDS),
    },
    subdomain: {
      type: "string",
      description: "Custom subdomain (default: random)",
    },
    domain: {
      type: "string",
      description: "Public tunnel domain (default: xpose.dev)",
      default: PROTOCOL.DEFAULT_PUBLIC_DOMAIN,
    },
    resume: {
      type: "boolean",
      alias: "r",
      description: "Resume the previous tunnel session",
    },
    allowIps: {
      type: "string",
      description: "Comma-separated IP addresses or CIDR ranges to allow",
    },
    rateLimit: {
      type: "string",
      description: "Max requests per minute per IP (0 = unlimited)",
    },
    cors: {
      type: "boolean",
      description: "Enable permissive CORS headers on all responses",
    },
    header: {
      type: "string",
      description:
        "Custom response header (key:value), can be specified multiple times",
    },
    config: {
      type: "string",
      description: "Path to config file (default: auto-detect xpose.config.ts)",
    },
    noConfig: {
      type: "boolean",
      description: "Skip loading the config file",
    },
    noInspect: {
      type: "boolean",
      description: "Disable the local request inspection server",
    },
    inspectPort: {
      type: "string",
      description: `Port for the inspection server (default: ${PROTOCOL.INSPECT_PORT})`,
    },
  },
  async run({ args }) {
    const ttl = parseInt(args.ttl, 10);
    if (isNaN(ttl) || ttl < 1) {
      printError("Invalid TTL. Must be a positive number of seconds.");
      process.exit(1);
    }

    // --- Resume mode ---
    if (args.resume) {
      const manualRawPorts = (
        args._.length > 0 ? args._ : args.port ? [args.port] : []
      ).map(String);
      if (manualRawPorts.length > 0 || args.fromTurbo) {
        printError("Cannot use --resume with port arguments or --from-turbo.");
        process.exit(1);
      }

      const prev = loadSession();
      if (!prev) {
        const minutes = PROTOCOL.SESSION_RESUME_WINDOW_SECONDS / 60;
        printError(
          `No session to resume (sessions expire after ${minutes} minutes).`,
        );
        process.exit(1);
      }

      const inspectServer = await maybeStartInspect(
        args.noInspect as boolean | undefined,
        args.inspectPort as string | undefined,
      );
      return runTunnels(prev.tunnels, ttl, inspectServer);
    }

    // --- Load config file ---
    let fileConfig: XposeConfig | null = null;
    if (!args.noConfig) {
      try {
        // When --config is given, resolve its parent directory;
        // otherwise search from the current working directory.
        const configDir = args.config
          ? resolve(process.cwd(), args.config, "..")
          : process.cwd();
        fileConfig = await loadConfig(configDir);
      } catch (err) {
        printError((err as Error).message);
        process.exit(1);
      }
    }

    // --- Parse CLI tunnel config flags ---
    const cliAllowIps = args.allowIps
      ? args.allowIps
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : undefined;
    const cliRateLimit = args.rateLimit
      ? Number.parseInt(args.rateLimit, 10)
      : undefined;
    const cliCors = args.cors ?? undefined;
    const cliHeaders = parseHeaderFlag(args.header);

    function buildTunnelConfig(
      cliOverrides: {
        allowIps?: string[];
        rateLimit?: number;
        cors?: boolean;
        headers?: Record<string, string>;
      },
      configFileEntry?: {
        allowIps?: string[];
        rateLimit?: number;
        cors?: boolean;
        headers?: Record<string, string>;
      },
    ): TunnelConfig | undefined {
      const merged: TunnelConfig = {
        allowedIps: cliOverrides.allowIps ?? configFileEntry?.allowIps,
        rateLimit: cliOverrides.rateLimit ?? configFileEntry?.rateLimit,
        cors: cliOverrides.cors ?? configFileEntry?.cors,
        customHeaders: { ...configFileEntry?.headers, ...cliOverrides.headers },
      };
      // Clean up empty custom headers
      if (
        merged.customHeaders &&
        Object.keys(merged.customHeaders).length === 0
      ) {
        merged.customHeaders = undefined;
      }
      const hasAny =
        merged.allowedIps?.length ||
        merged.rateLimit !== undefined ||
        merged.cors !== undefined ||
        merged.customHeaders;
      return hasAny ? merged : undefined;
    }

    // --- Normal mode: resolve ports ---
    const manualRawPorts = (
      args._.length > 0 ? args._ : args.port ? [args.port] : []
    ).map(String);
    const parsedManualPorts = manualRawPorts.map((raw) =>
      Number.parseInt(raw, 10),
    );
    const invalidManualPort = parsedManualPorts.find(
      (port) => Number.isNaN(port) || port < 1 || port > 65535,
    );
    if (invalidManualPort !== undefined) {
      printError("Invalid port number. Ports must be between 1 and 65535.");
      process.exit(1);
    }

    const ports = new Set(parsedManualPorts);
    if (args.fromTurbo) {
      const turboTask = args.turboTask?.trim() || "dev";
      const turboCwd = args.turboPath
        ? resolve(process.cwd(), args.turboPath)
        : process.cwd();

      if (!existsSync(turboCwd) || !statSync(turboCwd).isDirectory()) {
        printError(`Invalid --path. Directory does not exist: ${turboCwd}`);
        process.exit(1);
      }

      try {
        const discovered = await discoverTurboPorts({
          cwd: turboCwd,
          task: turboTask,
          filter: args.turboFilter,
        });

        if (discovered.length === 0) {
          printError(`No ports detected from Turborepo task "${turboTask}".`);
        } else {
          console.log(
            `  Discovered from Turborepo (${turboTask}): ${discovered.map((entry) => `${entry.port} [${entry.packageName}]`).join(", ")}`,
          );
        }

        for (const entry of discovered) {
          ports.add(entry.port);
        }
      } catch (err) {
        printError(`Failed to inspect Turborepo: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    // If no ports from CLI/turbo, try config file
    if (ports.size === 0 && fileConfig) {
      for (const t of fileConfig.tunnels) {
        ports.add(t.port);
      }
    }

    if (ports.size === 0) {
      printError(
        "No ports provided. Pass ports directly (e.g. `xpose-dev 3000 8787`), use --from-turbo, or add a xpose.config.ts.",
      );
      process.exit(1);
    }

    const resolvedPorts = [...ports];
    const baseSubdomain = args.subdomain?.trim();
    const tunnelDomain = normalizeDomain(
      args.domain ?? fileConfig?.domain ?? PROTOCOL.DEFAULT_PUBLIC_DOMAIN,
    );
    if (!tunnelDomain) {
      printError("Invalid domain. Pass a hostname like xpose.dev.");
      process.exit(1);
    }

    // Build tunnel entries with generated subdomains and merged config
    const entries: TunnelEntry[] = resolvedPorts.map((port) => {
      // Find matching config-file entry for this port
      const cfgEntry = fileConfig?.tunnels.find((t) => t.port === port);

      const subdomain = baseSubdomain
        ? resolvedPorts.length === 1
          ? buildCustomSubdomain(baseSubdomain)
          : buildCustomSubdomain(`${baseSubdomain}-${port}`)
        : cfgEntry?.subdomain
          ? buildCustomSubdomain(cfgEntry.subdomain)
          : generateSubdomainId();

      const config = buildTunnelConfig(
        {
          allowIps: cliAllowIps,
          rateLimit: cliRateLimit,
          cors: cliCors,
          headers: cliHeaders,
        },
        cfgEntry
          ? {
              allowIps: cfgEntry.allowIps,
              rateLimit: cfgEntry.rateLimit,
              cors: cfgEntry.cors,
              headers: cfgEntry.headers,
            }
          : undefined,
      );

      return { subdomain, port, domain: tunnelDomain, config };
    });

    // --- Start inspect server (always on unless --no-inspect) ---
    const inspectServer = await maybeStartInspect(
      args.noInspect as boolean | undefined,
      args.inspectPort as string | undefined,
    );

    return runTunnels(entries, ttl, inspectServer);
  },
});

runMain(main);
