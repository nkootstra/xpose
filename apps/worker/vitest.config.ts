import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          serviceBindings: {
            WEB_APP: () =>
              new Response("<html><body>xpose landing</body></html>", {
                headers: { "content-type": "text/html" },
              }),
          },
        },
        isolatedStorage: false,
      },
    },
  },
});
