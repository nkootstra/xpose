import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  printBanner,
  printTraffic,
  printStatus,
  printError,
} from "../logger.js";
import type { TrafficEntry } from "../logger.js";

describe("logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("printBanner", () => {
    it("outputs URL, port, and TTL", () => {
      printBanner("https://test.xpose.dev", 3000, 3661);

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("test.xpose.dev");
      expect(output).toContain("3000");
      expect(output).toContain("1h 1m 1s");
    });

    it("formats 4h TTL correctly", () => {
      printBanner("https://abc.xpose.dev", 8080, 14400);

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("4h 0m 0s");
    });
  });

  describe("printTraffic", () => {
    it("outputs method, path, status, and duration", () => {
      const entry: TrafficEntry = {
        id: "abc123",
        method: "GET",
        path: "/api/users",
        status: 200,
        duration: 42,
        timestamp: new Date(),
      };
      printTraffic(entry);

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("GET");
      expect(output).toContain("/api/users");
      expect(output).toContain("200");
      expect(output).toContain("42");
    });
  });

  describe("printStatus", () => {
    it("outputs 'Connected' for connected status", () => {
      printStatus("connected");
      const output = String(consoleSpy.mock.calls[0][0]);
      expect(output).toContain("Connected");
    });

    it("outputs 'Disconnected' for disconnected status", () => {
      printStatus("disconnected");
      const output = String(consoleSpy.mock.calls[0][0]);
      expect(output).toContain("Disconnected");
    });

    it("outputs 'Tunnel expired' for expired status", () => {
      printStatus("expired");
      const output = String(consoleSpy.mock.calls[0][0]);
      expect(output).toContain("Tunnel expired");
    });

    it("outputs 'Connecting...' for connecting status", () => {
      printStatus("connecting");
      const output = String(consoleSpy.mock.calls[0][0]);
      expect(output).toContain("Connecting");
    });

    it("outputs 'Reconnecting...' for reconnecting status", () => {
      printStatus("reconnecting");
      const output = String(consoleSpy.mock.calls[0][0]);
      expect(output).toContain("Reconnecting");
    });
  });

  describe("printError", () => {
    it("outputs 'Error:' and the message", () => {
      printError("something went wrong");
      const output = String(consoleSpy.mock.calls[0][0]);
      expect(output).toContain("Error:");
      expect(output).toContain("something went wrong");
    });
  });
});
