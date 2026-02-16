import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DiscoverTurboPortsOptions {
  cwd: string;
  task: string;
  filter?: string;
}

export interface DiscoveredTurboPort {
  port: number;
  packageName: string;
  directory: string;
  command: string;
  reason: "explicit" | "default";
}

interface TurboDryRunTask {
  command?: string;
  package?: string;
  directory?: string;
}

interface TurboDryRunResponse {
  tasks?: TurboDryRunTask[];
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function parseTurboDryRunOutput(output: string): TurboDryRunTask[] {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Could not find JSON payload in Turborepo dry-run output");
  }

  const rawJson = output.slice(start, end + 1);
  const parsed = JSON.parse(rawJson) as TurboDryRunResponse;
  if (!Array.isArray(parsed.tasks)) {
    throw new Error("Unexpected Turborepo dry-run format (missing tasks array)");
  }
  return parsed.tasks;
}

function collectRegexPorts(command: string, pattern: RegExp): number[] {
  const ports: number[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(command)) !== null) {
    const port = Number.parseInt(match[1], 10);
    if (isValidPort(port)) {
      ports.push(port);
    }
  }
  return ports;
}

function extractExplicitPorts(command: string): number[] {
  const patterns = [
    /(?:^|\s)PORT=(\d{2,5})(?=\s|$)/g,
    /--port(?:=|\s+)(\d{2,5})(?=\s|$)/g,
    /(?:^|\s)-p\s+(\d{2,5})(?=\s|$)/g,
    /(?:^|\s)-p(\d{2,5})(?=\s|$)/g,
    /--listen(?:=|\s+)(?:[^\s:]+:)?(\d{2,5})(?=\s|$)/g,
    /https?:\/\/[^\s/:]+:(\d{2,5})(?=[/\s]|$)/g,
  ];

  const discovered = new Set<number>();
  for (const pattern of patterns) {
    for (const port of collectRegexPorts(command, pattern)) {
      discovered.add(port);
    }
  }
  return [...discovered];
}

function inferDefaultPort(command: string): number | null {
  const normalized = command.toLowerCase();

  if (/\bwrangler\s+dev\b/.test(normalized)) return 8787;
  if (/\bnext\s+dev\b/.test(normalized)) return 3000;
  if (/\bnuxt\s+dev\b/.test(normalized)) return 3000;
  if (/\bremix\s+dev\b/.test(normalized)) return 3000;
  if (/\bastro\s+dev\b/.test(normalized)) return 4321;
  if (/\bstart-storybook\b/.test(normalized)) return 6006;
  if (/\bstorybook\b.*\bdev\b/.test(normalized)) return 6006;
  if (/\bvite(?:\s|$)/.test(normalized) && !/\bvitest\b/.test(normalized)) {
    return 5173;
  }

  return null;
}

export async function discoverTurboPorts(
  options: DiscoverTurboPortsOptions,
): Promise<DiscoveredTurboPort[]> {
  const args = ["turbo", "run", options.task, "--dry=json"];
  const filter = options.filter?.trim();
  if (filter) {
    args.push(`--filter=${filter}`);
  }

  let combinedOutput = "";
  try {
    const { stdout, stderr } = await execFileAsync("bunx", args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    combinedOutput = `${stdout}\n${stderr}`;
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string };
    const extra = [error.stdout, error.stderr].filter(Boolean).join("\n");
    throw new Error(
      `Failed to run \`bunx ${args.join(" ")}\`${extra ? `\n${extra}` : ""}`,
    );
  }

  const tasks = parseTurboDryRunOutput(combinedOutput);
  const discovered: DiscoveredTurboPort[] = [];

  for (const task of tasks) {
    const command = task.command?.trim();
    if (!command) continue;

    const explicitPorts = extractExplicitPorts(command);
    if (explicitPorts.length > 0) {
      for (const port of explicitPorts) {
        discovered.push({
          port,
          packageName: task.package ?? "unknown",
          directory: task.directory ?? "unknown",
          command,
          reason: "explicit",
        });
      }
      continue;
    }

    const defaultPort = inferDefaultPort(command);
    if (defaultPort !== null) {
      discovered.push({
        port: defaultPort,
        packageName: task.package ?? "unknown",
        directory: task.directory ?? "unknown",
        command,
        reason: "default",
      });
    }
  }

  const deduped = new Map<number, DiscoveredTurboPort>();
  for (const entry of discovered) {
    if (!deduped.has(entry.port)) {
      deduped.set(entry.port, entry);
    }
  }

  return [...deduped.values()].sort((a, b) => a.port - b.port);
}
