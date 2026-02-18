import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, defineConfig, toTunnelConfig } from "../config.js";

describe("defineConfig", () => {
  it("returns the config object unchanged", () => {
    const config = defineConfig({
      tunnels: [{ port: 3000 }],
    });
    expect(config.tunnels).toHaveLength(1);
    expect(config.tunnels[0].port).toBe(3000);
  });
});

describe("toTunnelConfig", () => {
  it("returns undefined when no config fields are set", () => {
    expect(toTunnelConfig({ port: 3000 })).toBeUndefined();
  });

  it("returns TunnelConfig when allowIps is set", () => {
    const result = toTunnelConfig({ port: 3000, allowIps: ["10.0.0.1"] });
    expect(result).toEqual({
      allowedIps: ["10.0.0.1"],
      rateLimit: undefined,
      cors: undefined,
      customHeaders: undefined,
    });
  });

  it("returns TunnelConfig when cors is set", () => {
    const result = toTunnelConfig({ port: 3000, cors: true });
    expect(result).toEqual({
      allowedIps: undefined,
      rateLimit: undefined,
      cors: true,
      customHeaders: undefined,
    });
  });

  it("maps headers to customHeaders", () => {
    const result = toTunnelConfig({
      port: 3000,
      headers: { "x-custom": "value" },
    });
    expect(result?.customHeaders).toEqual({ "x-custom": "value" });
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `xpose-config-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no config file exists", async () => {
    const result = await loadConfig(tmpDir);
    expect(result).toBeNull();
  });

  it("loads a .js config file", async () => {
    const configPath = join(tmpDir, "xpose.config.js");
    writeFileSync(
      configPath,
      `export default { tunnels: [{ port: 3000 }] };`,
      "utf-8",
    );

    const result = await loadConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.tunnels).toHaveLength(1);
    expect(result!.tunnels[0].port).toBe(3000);
  });

  it("loads config with all tunnel options", async () => {
    const configPath = join(tmpDir, "xpose.config.js");
    writeFileSync(
      configPath,
      `export default {
        domain: "tunnel.example.com",
        tunnels: [{
          port: 8080,
          subdomain: "api",
          ttl: 7200,
          allowIps: ["192.168.1.0/24"],
          rateLimit: 100,
          cors: true,
          headers: { "x-powered-by": "xpose" },
        }],
      };`,
      "utf-8",
    );

    const result = await loadConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.domain).toBe("tunnel.example.com");
    expect(result!.tunnels[0].port).toBe(8080);
    expect(result!.tunnels[0].allowIps).toEqual(["192.168.1.0/24"]);
    expect(result!.tunnels[0].cors).toBe(true);
  });

  it("throws on invalid config (missing tunnels)", async () => {
    const configPath = join(tmpDir, "xpose.config.js");
    writeFileSync(configPath, `export default { port: 3000 };`, "utf-8");

    await expect(loadConfig(tmpDir)).rejects.toThrow("Invalid config");
  });
});
