import { defineCommand, runMain } from "citty";
import {
  PROTOCOL,
  generateSubdomainId,
  buildCustomSubdomain,
} from "@xpose/protocol";
import { createTunnelClient } from "./tunnel-client.js";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  printError,
  discoverTurboPorts,
  normalizeDomain,
  saveSession,
  loadSession,
  type TunnelEntry,
} from "@xpose/tunnel-core";
import React from "react";
import { render } from "ink";
import { App } from "./tui/app.js";

/**
 * Create tunnel clients from entries, save the session, run the TUI,
 * and print the resume hint on exit.
 */
function runTunnels(entries: TunnelEntry[], rawTtl: number): void {
  const tunnelTtl = Math.min(rawTtl, PROTOCOL.MAX_TTL_SECONDS);

  // Save session so it can be resumed after exit
  saveSession({
    tunnels: entries,
    createdAt: new Date().toISOString(),
  });

  const clients = entries.map(({ subdomain, port, domain }) =>
    createTunnelClient({
      subdomain,
      port,
      ttl: tunnelTtl,
      host: "localhost",
      domain,
    }),
  );

  const ports = entries.map((e) => e.port);

  // Start all tunnel connections
  for (const client of clients) {
    client.connect();
  }

  function shutdown() {
    // Update session timestamp so resume window starts from exit time
    saveSession({
      tunnels: entries,
      createdAt: new Date().toISOString(),
    });

    for (const client of clients) {
      client.disconnect();
    }

    const minutes = PROTOCOL.SESSION_RESUME_WINDOW_SECONDS / 60;
    console.error(
      `\n  Session saved. Resume within ${minutes} minutes with: xpose-dev -r\n`,
    );
  }

  // Render the ink TUI
  const inkApp = render(
    React.createElement(App, {
      clients,
      ports,
      onQuit: shutdown,
    }),
  );

  inkApp.waitUntilExit().then(() => {
    process.exit(0);
  });
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

      return runTunnels(prev.tunnels, ttl);
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

    if (ports.size === 0) {
      printError(
        "No ports provided. Pass ports directly (e.g. `xpose-dev 3000 8787`) or use --from-turbo.",
      );
      process.exit(1);
    }

    const resolvedPorts = [...ports];
    const baseSubdomain = args.subdomain?.trim();
    const tunnelDomain = normalizeDomain(
      args.domain ?? PROTOCOL.DEFAULT_PUBLIC_DOMAIN,
    );
    if (!tunnelDomain) {
      printError("Invalid domain. Pass a hostname like xpose.dev.");
      process.exit(1);
    }

    // Build tunnel entries with generated subdomains
    const entries: TunnelEntry[] = resolvedPorts.map((port) => {
      const subdomain = baseSubdomain
        ? resolvedPorts.length === 1
          ? buildCustomSubdomain(baseSubdomain)
          : buildCustomSubdomain(`${baseSubdomain}-${port}`)
        : generateSubdomainId();
      return { subdomain, port, domain: tunnelDomain };
    });

    return runTunnels(entries, ttl);
  },
});

runMain(main);
