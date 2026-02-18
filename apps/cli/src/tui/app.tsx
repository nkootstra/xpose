import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import type { TunnelClient } from "../tunnel-client.js";
import type { TrafficEntry, TunnelStatus } from "@xpose/tunnel-core";

// --- Constants ---

const MAX_TRAFFIC_ENTRIES = 100;
const MIN_SPLIT_WIDTH = 80;

// --- Types ---

interface TunnelState {
  port: number;
  status: TunnelStatus;
  url: string;
  ttlRemaining: number;
  maxBodySizeBytes: number;
  lastError: string;
}

interface AppProps {
  clients: TunnelClient[];
  ports: number[];
  inspectUrl?: string;
  onQuit: () => void;
}

// --- Helpers ---

function formatTtl(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function formatTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function openBrowser(url: string): void {
  const { exec } = require("node:child_process");
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

// --- Tunnel Card Component ---

function TunnelCard({
  tunnel,
  showPortPrefix,
  inspectUrl,
}: {
  tunnel: TunnelState;
  showPortPrefix: boolean;
  inspectUrl?: string;
}) {
  const portLabel = showPortPrefix ? ` :${tunnel.port}` : "";

  switch (tunnel.status) {
    case "connected":
      return (
        <Box flexDirection="column" paddingLeft={1}>
          <Text>
            <Text color="green" bold>
              {"✓ "}
            </Text>
            <Text color="green">Connected</Text>
            <Text dimColor>{portLabel}</Text>
          </Text>
          <Text>
            <Text color="cyan" bold>
              {"→ "}
            </Text>
            <Text color="cyan" bold>
              {tunnel.url}
            </Text>
          </Text>
          <Text dimColor>
            {"  "}Forwarding to localhost:{tunnel.port}
          </Text>
          {inspectUrl && (
            <Text>
              <Text color="magenta" bold>
                {"  "}
              </Text>
              <Text dimColor>Inspect: </Text>
              <Text color="magenta">{inspectUrl}</Text>
            </Text>
          )}
          <Text>
            {"  "}TTL:{" "}
            <Text color="yellow">{formatTtl(tunnel.ttlRemaining)}</Text>
          </Text>
        </Box>
      );

    case "connecting":
      return (
        <Box flexDirection="column" paddingLeft={1}>
          <Text>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text color="yellow"> Connecting...</Text>
            <Text dimColor>{portLabel}</Text>
          </Text>
          <Text dimColor>
            {"  "}Port {tunnel.port}
          </Text>
        </Box>
      );

    case "reconnecting":
      return (
        <Box flexDirection="column" paddingLeft={1}>
          <Text>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text color="yellow"> Reconnecting...</Text>
            <Text dimColor>{portLabel}</Text>
          </Text>
          <Text dimColor>
            {"  "}Port {tunnel.port}
          </Text>
          {tunnel.lastError && (
            <Text>
              {"  "}
              <Text color="red">Error: </Text>
              <Text>{tunnel.lastError}</Text>
            </Text>
          )}
        </Box>
      );

    case "disconnected":
      return (
        <Box flexDirection="column" paddingLeft={1}>
          <Text>
            <Text color="red" bold>
              {"✗ "}
            </Text>
            <Text color="red">Disconnected</Text>
            <Text dimColor>{portLabel}</Text>
          </Text>
          <Text dimColor>
            {"  "}Port {tunnel.port}
          </Text>
          {tunnel.lastError && (
            <Text>
              {"  "}
              <Text color="red">Error: </Text>
              <Text>{tunnel.lastError}</Text>
            </Text>
          )}
        </Box>
      );

    case "expired":
      return (
        <Box flexDirection="column" paddingLeft={1}>
          <Text>
            <Text color="red" bold>
              {"✗ "}
            </Text>
            <Text color="red">Tunnel expired</Text>
            <Text dimColor>{portLabel}</Text>
          </Text>
          <Text dimColor>
            {"  "}Port {tunnel.port}
          </Text>
        </Box>
      );
  }
}

// --- Traffic Line Component ---

const METHOD_COLORS: Record<string, string> = {
  GET: "cyan",
  HEAD: "cyan",
  POST: "green",
  PUT: "yellow",
  DELETE: "red",
  PATCH: "magenta",
  OPTIONS: "gray",
};

function statusColor(status: number): string {
  if (status >= 500) return "red";
  if (status >= 400) return "yellow";
  if (status >= 300) return "cyan";
  if (status >= 200) return "green";
  return "white";
}

function TrafficLine({ entry }: { entry: TrafficEntry }) {
  const method = entry.method.padEnd(7);
  const path =
    entry.path.length > 30 ? entry.path.slice(0, 30) : entry.path.padEnd(30);
  const duration = `${String(entry.duration).padStart(5)}ms`;
  const time = formatTime(entry.timestamp);

  return (
    <Text>
      {"  "}
      <Text dimColor>{time}</Text>
      {"  "}
      <Text color={METHOD_COLORS[entry.method] ?? "white"}>{method}</Text>
      {"  "}
      <Text>{path}</Text>
      {"  "}
      <Text color={statusColor(entry.status)}>{entry.status}</Text>
      {"  "}
      <Text dimColor>{duration}</Text>
    </Text>
  );
}

// --- Panel Component ---

function Panel({
  title,
  focused,
  width,
  height,
  children,
}: {
  title: string;
  focused: boolean;
  width: number | string;
  height: number | string;
  children: React.ReactNode;
}) {
  const borderColor = focused ? "#3b82f6" : "gray";
  const titleColor = focused ? "#3b82f6" : "gray";

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={borderColor}
    >
      <Box position="absolute" marginLeft={1} marginTop={-1}>
        <Text color={titleColor} bold={focused}>
          {" "}
          {title}{" "}
        </Text>
      </Box>
      {children}
    </Box>
  );
}

// --- Main App Component ---

export function App({ clients, ports, inspectUrl, onQuit }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal dimensions
  const [columns, setColumns] = useState(stdout.columns || 80);
  const [rows, setRows] = useState(stdout.rows || 24);

  // Tunnel states
  const [tunnels, setTunnels] = useState<TunnelState[]>(() =>
    ports.map((port) => ({
      port,
      status: "connecting" as TunnelStatus,
      url: "",
      ttlRemaining: 0,
      maxBodySizeBytes: 0,
      lastError: "",
    })),
  );

  // Traffic log — each entry gets a monotonic sequence number for stable React keys
  const [traffic, setTraffic] = useState<(TrafficEntry & { seq: number })[]>(
    [],
  );
  const seqRef = React.useRef(0);

  // Scroll state for traffic panel
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = React.useRef(true);

  // Focus state
  const [focusedPanel, setFocusedPanel] = useState<"left" | "right">("right");

  const showSplit = columns >= MIN_SPLIT_WIDTH;

  // Track terminal resize
  useEffect(() => {
    function onResize() {
      setColumns(stdout.columns);
      setRows(stdout.rows);
    }
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  // TTL countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTunnels((prev) =>
        prev.map((t) =>
          t.status === "connected" && t.ttlRemaining > 0
            ? { ...t, ttlRemaining: t.ttlRemaining - 1 }
            : t,
        ),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Wire up tunnel client events
  useEffect(() => {
    clients.forEach((client, idx) => {
      client.on("authenticated", ({ url, ttl, maxBodySizeBytes }) => {
        setTunnels((prev) =>
          prev.map((t, i) =>
            i === idx
              ? {
                  ...t,
                  status: "connected" as TunnelStatus,
                  url,
                  ttlRemaining: ttl,
                  maxBodySizeBytes,
                  lastError: "",
                }
              : t,
          ),
        );
      });

      client.on("traffic", (entry) => {
        // Add port prefix if multiple tunnels
        const portPrefix = clients.length > 1 ? `[${ports[idx]}] ` : "";
        const seq = ++seqRef.current;
        setTraffic((prev) => {
          const next = [
            ...prev,
            { ...entry, path: `${portPrefix}${entry.path}`, seq },
          ];
          if (next.length > MAX_TRAFFIC_ENTRIES) {
            return next.slice(next.length - MAX_TRAFFIC_ENTRIES);
          }
          return next;
        });
        // Auto-scroll to bottom only when the user hasn't manually scrolled up
        if (autoScrollRef.current) {
          setScrollOffset(Number.MAX_SAFE_INTEGER);
        }
      });

      client.on("status", (status) => {
        setTunnels((prev) =>
          prev.map((t, i) => (i === idx ? { ...t, status } : t)),
        );
      });

      client.on("error", (err) => {
        setTunnels((prev) =>
          prev.map((t, i) =>
            i === idx ? { ...t, lastError: err.message } : t,
          ),
        );
      });

      client.on("expired", () => {
        setTunnels((prev) =>
          prev.map((t, i) =>
            i === idx ? { ...t, status: "expired" as TunnelStatus } : t,
          ),
        );
      });
    });
  }, [clients, ports]);

  // Check if all tunnels expired
  useEffect(() => {
    if (tunnels.length > 0 && tunnels.every((t) => t.status === "expired")) {
      onQuit();
      exit();
    }
  }, [tunnels, exit, onQuit]);

  // Calculate traffic viewport dimensions (must be before useInput so the closure has access)
  const footerHeight = 1;
  const availableRows = rows - footerHeight;

  // In split mode: panel outer height = availableRows.
  //   Border top (1) + border bottom (1) = 2 rows for border.
  //   Inner paddingTop (1) = 1 row.
  //   Usable content rows = availableRows - 3.
  // In narrow mode: tunnel cards (~6 rows) + 1 marginTop, rest is traffic.
  const trafficViewportHeight = showSplit
    ? Math.max(1, availableRows - 3)
    : Math.max(1, availableRows - 7);

  // Keyboard input — only active when stdin supports raw mode (TTY)
  const isRawModeSupported = process.stdin.isTTY ?? false;

  useInput(
    (input, key) => {
      if (input === "q" || (input === "c" && key.ctrl)) {
        onQuit();
        exit();
        return;
      }

      if (input === "b") {
        const connected = tunnels.find(
          (t) => t.status === "connected" && t.url,
        );
        if (connected) {
          openBrowser(connected.url);
        }
        return;
      }

      if (input === "i" && inspectUrl) {
        openBrowser(inspectUrl);
        return;
      }

      if (key.tab && showSplit) {
        setFocusedPanel((prev) => (prev === "left" ? "right" : "left"));
        return;
      }

      // Scroll traffic (in split mode: only when right panel focused; in narrow mode: always)
      if (!showSplit || focusedPanel === "right") {
        const maxOff = Math.max(0, traffic.length - trafficViewportHeight);
        if (key.upArrow && maxOff > 0) {
          setScrollOffset((prev) => {
            // Clamp prev first so we scroll from the real position, not MAX_SAFE_INTEGER
            const current = Math.min(prev, maxOff);
            return Math.max(0, current - 1);
          });
          setAutoScroll(false);
          autoScrollRef.current = false;
        }
        if (key.downArrow) {
          setScrollOffset((prev) => {
            const current = Math.min(prev, maxOff);
            const next = current + 1;
            // Re-enable auto-scroll when reaching the bottom
            if (next >= maxOff) {
              setAutoScroll(true);
              autoScrollRef.current = true;
            }
            return Math.min(next, maxOff);
          });
        }
      }
    },
    { isActive: isRawModeSupported },
  );

  // Clamp scroll offset
  const maxScroll = Math.max(0, traffic.length - trafficViewportHeight);
  const clampedOffset = Math.min(scrollOffset, maxScroll);
  const visibleTraffic = traffic.slice(
    clampedOffset,
    clampedOffset + trafficViewportHeight,
  );

  const scrollPercent =
    traffic.length <= trafficViewportHeight
      ? 100
      : Math.round((clampedOffset / maxScroll) * 100);

  // Build footer
  const footerParts = ["q quit", "b open browser"];
  if (inspectUrl) {
    footerParts.push("i inspect");
  }
  if (showSplit) {
    footerParts.push("tab switch panel");
  }
  const canScroll = !showSplit || focusedPanel === "right";
  if (canScroll && traffic.length > 0) {
    const scrollLabel = autoScroll
      ? `↑↓ scroll ${scrollPercent}%`
      : `↑↓ scroll ${scrollPercent}% (paused)`;
    footerParts.push(scrollLabel);
  }
  const footer = `  ${footerParts.join(" | ")}`;

  if (!showSplit) {
    // Narrow mode: tunnel cards stacked, then traffic below
    return (
      <Box flexDirection="column" width={columns} height={rows}>
        <Box flexDirection="column" flexShrink={0}>
          {tunnels.map((tunnel, i) => (
            <Box key={i} flexDirection="column">
              {i > 0 && <Text>{""}</Text>}
              <TunnelCard
                tunnel={tunnel}
                showPortPrefix={tunnels.length > 1}
                inspectUrl={inspectUrl}
              />
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          {traffic.length === 0 ? (
            <Text dimColor>{"  "}Waiting for requests...</Text>
          ) : (
            visibleTraffic.map((entry) => (
              <TrafficLine key={entry.seq} entry={entry} />
            ))
          )}
        </Box>
        <Box flexShrink={0}>
          <Text dimColor>{footer}</Text>
        </Box>
      </Box>
    );
  }

  // Split mode: left (tunnels) + right (traffic)
  const leftWidth = Math.floor(columns * 0.35);
  const rightWidth = columns - leftWidth;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box flexGrow={1}>
        <Panel
          title="Tunnels"
          focused={focusedPanel === "left"}
          width={leftWidth}
          height={availableRows}
        >
          <Box flexDirection="column" paddingTop={1}>
            {tunnels.map((tunnel, i) => (
              <Box key={i} flexDirection="column">
                {i > 0 && <Text>{""}</Text>}
                <TunnelCard
                  tunnel={tunnel}
                  showPortPrefix={tunnels.length > 1}
                  inspectUrl={inspectUrl}
                />
              </Box>
            ))}
          </Box>
        </Panel>
        <Panel
          title="Traffic"
          focused={focusedPanel === "right"}
          width={rightWidth}
          height={availableRows}
        >
          <Box
            flexDirection="column"
            paddingTop={1}
            paddingLeft={1}
            overflowY="hidden"
          >
            {traffic.length === 0 ? (
              <Text dimColor>Waiting for requests...</Text>
            ) : (
              visibleTraffic.map((entry) => (
                <TrafficLine key={entry.seq} entry={entry} />
              ))
            )}
          </Box>
        </Panel>
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>{footer}</Text>
      </Box>
    </Box>
  );
}
