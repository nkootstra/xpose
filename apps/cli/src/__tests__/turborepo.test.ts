import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => {
  const mockExecFile = vi.fn();
  return { execFile: mockExecFile };
});

import { execFile } from "node:child_process";
import { discoverTurboPorts } from "../turborepo.js";

const mockExecFile = vi.mocked(execFile);

function mockTurboOutput(
  tasks: Array<{ command?: string; package?: string; directory?: string }>,
) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = typeof _opts === "function" ? _opts : callback;
    cb!(
      null as unknown as Error,
      { stdout: JSON.stringify({ tasks }), stderr: "" } as any,
      "" as any,
    );
    return undefined as any;
  });
}

function mockTurboRawOutput(stdout: string) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = typeof _opts === "function" ? _opts : callback;
    cb!(
      null as unknown as Error,
      { stdout, stderr: "" } as any,
      "" as any,
    );
    return undefined as any;
  });
}

const defaultOpts = { cwd: "/tmp/test", task: "dev" };

describe("discoverTurboPorts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("explicit port extraction", () => {
    it("discovers --port 3000", async () => {
      mockTurboOutput([
        {
          command: "next dev --port 3000",
          package: "web",
          directory: "apps/web",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(3000);
      expect(result[0].reason).toBe("explicit");
    });

    it("discovers -p 4000", async () => {
      mockTurboOutput([
        {
          command: "vite -p 4000",
          package: "docs",
          directory: "apps/docs",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(4000);
      expect(result[0].reason).toBe("explicit");
    });

    it("discovers PORT=8080", async () => {
      mockTurboOutput([
        {
          command: "PORT=8080 node server.js",
          package: "api",
          directory: "apps/api",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(8080);
      expect(result[0].reason).toBe("explicit");
    });

    it("discovers --port=3000", async () => {
      mockTurboOutput([
        {
          command: "next dev --port=3000",
          package: "web",
          directory: "apps/web",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(3000);
      expect(result[0].reason).toBe("explicit");
    });

    it("discovers http://localhost:5000", async () => {
      mockTurboOutput([
        {
          command: "serve http://localhost:5000",
          package: "app",
          directory: "apps/app",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(5000);
      expect(result[0].reason).toBe("explicit");
    });
  });

  describe("default port inference", () => {
    it("infers port 3000 for next dev", async () => {
      mockTurboOutput([
        {
          command: "next dev",
          package: "web",
          directory: "apps/web",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(3000);
      expect(result[0].reason).toBe("default");
    });

    it("infers port 5173 for vite", async () => {
      mockTurboOutput([
        {
          command: "vite",
          package: "app",
          directory: "apps/app",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(5173);
      expect(result[0].reason).toBe("default");
    });

    it("infers port 8787 for wrangler dev", async () => {
      mockTurboOutput([
        {
          command: "wrangler dev",
          package: "worker",
          directory: "apps/worker",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(8787);
      expect(result[0].reason).toBe("default");
    });

    it("infers port 4321 for astro dev", async () => {
      mockTurboOutput([
        {
          command: "astro dev",
          package: "site",
          directory: "apps/site",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(4321);
      expect(result[0].reason).toBe("default");
    });

    it("infers port 6006 for storybook dev", async () => {
      mockTurboOutput([
        {
          command: "storybook dev",
          package: "ui",
          directory: "packages/ui",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(6006);
      expect(result[0].reason).toBe("default");
    });

    it("does NOT infer port 5173 for vitest run", async () => {
      mockTurboOutput([
        {
          command: "vitest run",
          package: "web",
          directory: "apps/web",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(0);
    });
  });

  describe("deduplication and sorting", () => {
    it("deduplicates same port from multiple tasks", async () => {
      mockTurboOutput([
        {
          command: "next dev --port 3000",
          package: "web",
          directory: "apps/web",
        },
        {
          command: "remix dev --port 3000",
          package: "admin",
          directory: "apps/admin",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(1);
      expect(result[0].port).toBe(3000);
    });

    it("sorts results by port number", async () => {
      mockTurboOutput([
        {
          command: "storybook dev",
          package: "ui",
          directory: "packages/ui",
        },
        {
          command: "next dev",
          package: "web",
          directory: "apps/web",
        },
        {
          command: "astro dev",
          package: "docs",
          directory: "apps/docs",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(3);
      expect(result[0].port).toBe(3000);
      expect(result[1].port).toBe(4321);
      expect(result[2].port).toBe(6006);
    });
  });

  describe("filter flag", () => {
    it("appends --filter=web to turbo command args", async () => {
      mockTurboOutput([
        {
          command: "next dev",
          package: "web",
          directory: "apps/web",
        },
      ]);
      await discoverTurboPorts({ ...defaultOpts, filter: "web" });

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const callArgs = mockExecFile.mock.calls[0];
      const args = callArgs[1] as string[];
      expect(args).toContain("--filter=web");
    });
  });

  describe("error handling", () => {
    it("throws error for non-JSON output", async () => {
      mockTurboRawOutput("this is not json at all");
      await expect(discoverTurboPorts(defaultOpts)).rejects.toThrow(
        "Could not find JSON payload",
      );
    });

    it("throws error for missing tasks array", async () => {
      mockTurboRawOutput(JSON.stringify({ notTasks: [] }));
      await expect(discoverTurboPorts(defaultOpts)).rejects.toThrow(
        "missing tasks array",
      );
    });

    it("returns empty array when no ports found", async () => {
      mockTurboOutput([
        {
          command: "echo hello",
          package: "scripts",
          directory: "packages/scripts",
        },
      ]);
      const result = await discoverTurboPorts(defaultOpts);
      expect(result).toHaveLength(0);
    });
  });
});
