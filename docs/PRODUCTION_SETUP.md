# Production Setup

This runbook covers first-time production setup and release for xpose.

## Architecture Overview

Everything runs on `xpose.dev` — no separate tunnel subdomain:

- **`xpose-worker`** claims all routes (`xpose.dev/*` and `*.xpose.dev/*`). It handles tunnel WebSocket connections and proxied HTTP traffic on subdomains.
- **`xpose-web`** is the TanStack Start marketing site deployed as a separate Worker.
- The worker forwards bare-domain requests to `xpose-web` via a **Cloudflare Service Binding** (zero-latency internal call, no extra DNS hop).
- `www.xpose.dev` returns a 301 redirect to `xpose.dev`.

## 1. Cloudflare DNS

Create proxied DNS records in the `xpose.dev` zone:

| Type | Name | Content   | Proxy |
| ---- | ---- | --------- | ----- |
| A    | @    | 192.0.2.0 | Yes   |
| A    | \*   | 192.0.2.0 | Yes   |

`192.0.2.0` is a dummy origin — Cloudflare Workers intercept all traffic before it reaches any origin.

The wildcard record enables `<subdomain>.xpose.dev` routing for tunnels.

## 2. Configure Worker

Edit `apps/worker/wrangler.jsonc`:

- `vars.PUBLIC_DOMAIN` — set to `xpose.dev`
- `routes` — must include both:
  - `"xpose.dev/*"` with `zone_name: "xpose.dev"`
  - `"*.xpose.dev/*"` with `zone_name: "xpose.dev"`
- `services` — the `WEB_APP` binding must reference `"xpose-web"` (the web app worker name)
- Durable Object bindings/migrations — keep as-is unless intentionally changing DO classes

## 3. Authenticate Wrangler

Use one of:

- `wrangler login`
- API token auth (`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`)

Token needs Workers/Durable Objects permissions for the target account/zone.

## 4. Deploy

**Deployment order matters** — the worker references `xpose-web` by name in its service binding, so the web app must exist first.

### Deploy web app first

```bash
cd apps/web
bun run deploy
```

### Deploy worker second

```bash
cd apps/worker
bun run deploy
```

### Verify

```bash
# Bare domain serves marketing site (SSR HTML)
curl -s -o /dev/null -w "%{http_code}" https://xpose.dev/
# Expected: 200

# www redirects to bare domain
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://www.xpose.dev/
# Expected: 301 https://xpose.dev/

# Random subdomain returns tunnel-not-connected
curl -s https://test.xpose.dev/
# Expected: "Tunnel not connected" (HTTP 502)
```

## 5. Use CLI Against Production

```bash
npx xpose-dev 3000
```

The default domain is `xpose.dev` — no `--domain` flag needed.

To use a custom domain:

```bash
npx xpose-dev 3000 --domain your-domain.com
```

## 6. Pre-Release Quality Gate

From repo root:

```bash
bun run lint
bun run check-types
bun run build
bunx turbo run test
```

Release only if all commands pass.

## 7. GitHub Actions and Secrets

### Existing workflows

- JS CI: `.github/workflows/js-ci.yml`
- CLI npm release: `.github/workflows/cli-npm-release.yml`

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

### Required secret for npm release

- `NPM_TOKEN` (npm publish token for `xpose-dev` package)

## 8. Release the CLI

Tag format expected by workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the npm release workflow that publishes the `xpose-dev` package to npm.

## 9. Rollback

Worker rollback:

- Re-deploy the last known-good commit from `apps/worker` with `bun run deploy`.

Web app rollback:

- Re-deploy from `apps/web` with `bun run deploy`.

CLI rollback:

- Publish a new patch release tag (e.g. `v0.1.1`) that reverts the bad change.
- Avoid force-moving existing tags.
