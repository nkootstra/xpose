import { defineCommand, runMain } from "citty";
import {
  PROTOCOL,
  generateSubdomainId,
  buildCustomSubdomain,
} from "@xpose/protocol";
import { createTunnelClient } from "./tunnel-client.js";
import { discoverTurboPorts } from "./turborepo.js";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  printBanner,
  printTraffic,
  printStatus,
  printError,
} from "./logger.js";

function normalizeDomain(raw: string): string {
  const stripped = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  return stripped;
}

const main = defineCommand({
  meta: {
    name: "xpose",
    version: "0.0.1",
    description: "Expose local servers to the internet via Cloudflare",
  },
  args: {
    port: {
      type: "positional",
      description:
        "Local port to expose (optional when using --from-turbo)",
      required: false,
    },
    fromTurbo: {
      type: "boolean",
      description:
        "Auto-detect ports from `turbo run <task> --dry=json`",
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
      description:
        "Path to the Turborepo project root when using --from-turbo",
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
  },
  async run({ args }) {
    const ttl = parseInt(args.ttl, 10);
    if (isNaN(ttl) || ttl < 1) {
      printError("Invalid TTL. Must be a positive number of seconds.");
      process.exit(1);
    }

    const manualRawPorts = (
      args._.length > 0
        ? args._
        : args.port
          ? [args.port]
          : []
    ).map(String);
    const parsedManualPorts = manualRawPorts.map((raw) => Number.parseInt(raw, 10));
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
        printError(
          `Invalid --path. Directory does not exist: ${turboCwd}`,
        );
        process.exit(1);
      }

      try {
        const discovered = await discoverTurboPorts({
          cwd: turboCwd,
          task: turboTask,
          filter: args.turboFilter,
        });

        if (discovered.length === 0) {
          printError(
            `No ports detected from Turborepo task "${turboTask}".`,
          );
        } else {
          console.log(
            `  Discovered from Turborepo (${turboTask}): ${discovered.map((entry) => `${entry.port} [${entry.packageName}]`).join(", ")}`,
          );
        }

        for (const entry of discovered) {
          ports.add(entry.port);
        }
      } catch (err) {
        printError(
          `Failed to inspect Turborepo: ${(err as Error).message}`,
        );
        process.exit(1);
      }
    }

    if (ports.size === 0) {
      printError(
        "No ports provided. Pass ports directly (e.g. `xpose 3000 8787`) or use --from-turbo.",
      );
      process.exit(1);
    }

    const resolvedPorts = [...ports];
    const baseSubdomain = args.subdomain?.trim();
    const tunnelTtl = Math.min(ttl, PROTOCOL.MAX_TTL_SECONDS);
    const tunnelDomain = normalizeDomain(args.domain ?? PROTOCOL.DEFAULT_PUBLIC_DOMAIN);
    if (!tunnelDomain) {
      printError("Invalid domain. Pass a hostname like xpose.dev.");
      process.exit(1);
    }
    const clients = resolvedPorts.map((port) => {
      const subdomain = baseSubdomain
        ? resolvedPorts.length === 1
          ? buildCustomSubdomain(baseSubdomain)
          : buildCustomSubdomain(`${baseSubdomain}-${port}`)
        : generateSubdomainId();

      const client = createTunnelClient({
        subdomain,
        port,
        ttl: tunnelTtl,
        host: "localhost",
        domain: tunnelDomain,
      });

      client.on("authenticated", ({ url, ttl: grantedTtl, maxBodySizeBytes }) => {
        printBanner(url, port, grantedTtl);
        printStatus("connected");
        console.log(`  max body size: ${maxBodySizeBytes} bytes`);
      });

      client.on("traffic", (entry) => {
        printTraffic({
          ...entry,
          path: `[${port}] ${entry.path}`,
        });
      });

      client.on("status", (status) => {
        if (status !== "connected") {
          printStatus(status);
        }
      });

      client.on("error", (err) => {
        printError(`[port ${port}] ${err.message}`);
      });

      return client;
    });

    let remainingTunnels = clients.length;

    for (const client of clients) {
      client.on("expired", () => {
        printStatus("expired");
        remainingTunnels -= 1;
        if (remainingTunnels <= 0) {
          process.exit(0);
        }
      });
      client.connect();
    }

    function shutdown(exitCode: number) {
      for (const client of clients) {
        client.disconnect();
      }
      process.exit(exitCode);
    }

    // Graceful shutdown
    process.on("SIGINT", () => {
      console.log();
      printStatus("disconnected");
      shutdown(0);
    });

    process.on("SIGTERM", () => {
      shutdown(0);
    });
  },
});

runMain(main);
