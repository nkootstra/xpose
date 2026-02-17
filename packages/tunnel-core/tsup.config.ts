import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  // DTS is skipped — this is a private workspace package. Consumers
  // resolve types through the tsconfig paths mapping to src/.
  dts: false,
});
