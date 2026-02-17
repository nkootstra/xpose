import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "esnext",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Bundle workspace packages into the output so the published package
  // is self-contained with no workspace dependencies.
  noExternal: ["@xpose/protocol", "@xpose/tunnel-core"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
