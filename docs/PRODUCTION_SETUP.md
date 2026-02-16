# Production Setup

This runbook covers first-time production setup and release for xpose.

## 1. Decide Your Tunnel Domain

Recommended:
- Marketing/docs site on `xpose.dev` (web app)
- Tunnel traffic on `tunnel.xpose.dev` (worker + Durable Object)

Reason:
- The tunnel worker handles wildcard subdomain traffic and bare-domain API responses.
- Keeping tunnel traffic on its own subdomain avoids route conflicts with your website.

## 2. Cloudflare DNS

Create proxied DNS records for your tunnel domain:

For `tunnel.xpose.dev`:
- `A tunnel -> 192.0.2.0` (proxied)
- `A *.tunnel -> 192.0.2.0` (proxied)

`192.0.2.0` is a documentation/test IP used as a dummy origin for originless Workers routing.

## 3. Configure Worker Routes and Vars

Edit `apps/worker/wrangler.jsonc`:

1. Set:
- `vars.PUBLIC_DOMAIN` to your tunnel domain, for example `tunnel.xpose.dev`

2. Set `routes` to:
- `"*.tunnel.xpose.dev/*"` with `zone_name: "xpose.dev"`
- `"tunnel.xpose.dev/*"` with `zone_name: "xpose.dev"`

3. Keep Durable Object binding/migrations as-is unless you are intentionally changing DO classes.

## 4. Authenticate Wrangler

Use one of:
- `wrangler login`
- or API token auth (`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`)

Token needs Workers/Durable Objects permissions for the target account/zone.

## 5. Deploy Worker

```bash
cd apps/worker
bun run deploy
```

Verify:

```bash
curl https://tunnel.xpose.dev
```

Expected: JSON metadata response from the worker.

## 6. (Optional) Deploy Web App

If you want the TanStack web app in `apps/web` on `xpose.dev`, deploy it separately from the tunnel worker:

```bash
cd apps/web
bun run deploy
```

Use a different domain/subdomain for tunnel traffic (for example `tunnel.xpose.dev`) so worker routes do not overlap web routes.

## 7. Use CLI Against Your Domain

TypeScript CLI:

```bash
xpose 3000 --domain tunnel.xpose.dev
```

Go CLI (Homebrew release binary):

```bash
xpose 3000 --domain tunnel.xpose.dev
```

## 8. Pre-Release Quality Gate

From repo root:

```bash
bun run lint
bun run check-types
bun run build
bunx turbo run test
cd apps/cli-go && go test -v -race -count=1 ./...
```

Release only if all commands pass.

## 9. GitHub Actions and Secrets

### Existing workflows
- JS CI: `.github/workflows/js-ci.yml`
- Go CLI CI: `.github/workflows/cli-ci.yml`
- Go CLI release: `.github/workflows/cli-release.yml`

### Required secret for Homebrew release
- `HOMEBREW_TAP_GITHUB_TOKEN` (repo-scoped token for `xpose-dev/homebrew-tap`)

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## 10. Release the Go CLI

Tag format expected by workflow:

```bash
git tag cli/v0.1.0
git push origin cli/v0.1.0
```

This triggers Goreleaser and publishes artifacts + Homebrew formula updates.

## 11. Rollback

Worker rollback:
- Re-deploy the last known-good commit from `apps/worker` with `bun run deploy`.

CLI rollback:
- Publish a new patch release tag (for example `cli/v0.1.1`) that reverts the bad change.
- Avoid force-moving existing tags.
