import pc from "picocolors";

export interface TrafficEntry {
  id: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: Date;
}

export type TunnelStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "expired";

function methodColor(method: string): string {
  const colored: Record<string, (s: string) => string> = {
    GET: pc.cyan,
    POST: pc.green,
    PUT: pc.yellow,
    DELETE: pc.red,
    PATCH: pc.magenta,
    HEAD: pc.cyan,
    OPTIONS: pc.gray,
  };
  return (colored[method] ?? pc.white)(method.padEnd(7));
}

function statusColor(status: number): string {
  if (status >= 500) return pc.red(String(status));
  if (status >= 400) return pc.yellow(String(status));
  if (status >= 300) return pc.cyan(String(status));
  if (status >= 200) return pc.green(String(status));
  return pc.white(String(status));
}

function timestamp(): string {
  const now = new Date();
  return pc.gray(
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
  );
}

function formatTtl(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export function printBanner(url: string, port: number, ttl: number): void {
  console.log();
  console.log(`  ${pc.bold(pc.green("xpose"))}`);
  console.log();
  console.log(
    `  ${pc.gray("Forwarding")}    ${pc.bold(pc.cyan(url))} ${pc.gray("->")} ${pc.white(`localhost:${port}`)}`,
  );
  console.log(
    `  ${pc.gray("TTL")}           ${pc.yellow(formatTtl(ttl))} remaining`,
  );
  console.log(`  ${pc.gray("Status")}        ${pc.green("Connected")}`);
  console.log();
  console.log(
    pc.gray("  ─────────────────────────────────────────────────────────"),
  );
  console.log();
}

export function printTraffic(entry: TrafficEntry): void {
  const duration = pc.gray(`${String(entry.duration).padStart(5)}ms`);
  console.log(
    `  ${timestamp()}  ${methodColor(entry.method)}  ${entry.path.padEnd(30).slice(0, 30)}  ${statusColor(entry.status)}  ${duration}`,
  );
}

export function printStatus(status: TunnelStatus): void {
  const labels: Record<TunnelStatus, string> = {
    connecting: pc.yellow("  Connecting..."),
    connected: pc.green("  Connected"),
    reconnecting: pc.yellow("  Reconnecting..."),
    disconnected: pc.red("  Disconnected"),
    expired: pc.red("  Tunnel expired"),
  };
  console.log(labels[status]);
}

export function printError(message: string): void {
  console.log(`  ${pc.red("Error:")} ${message}`);
}
