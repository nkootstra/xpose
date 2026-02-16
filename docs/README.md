# Xpose

An open-source alternative to [ngrok](https://ngrok.com), built on [Cloudflare Workers](https://workers.cloudflare.com/) and Durable Objects.

Expose your local development servers to the internet with a single command.

For production deployment and release setup, see `docs/PRODUCTION_SETUP.md`.

## Quick Start

```bash
# Install via Homebrew
brew install xpose-dev/tap/xpose

# Expose a local server
xpose 3000
```

```
  xpose

  Forwarding    https://k3x9m2pw4a6b.xpose.dev -> localhost:3000
  TTL           4h 0m 0s remaining
  Status        Connected
```

## Features

- Built entirely on Cloudflare's global edge network
- No dedicated servers to manage - fully serverless
- Install via Homebrew (`brew install xpose-dev/tap/xpose`)
- Beautiful terminal UI with live traffic logging
- Auto-reconnection with exponential backoff
- Configurable TTL (default 4 hours)
- Turborepo port auto-discovery (`--from-turbo`)

## Usage

```bash
# Expose port 3000 with a random subdomain
xpose 3000

# Expose multiple ports at once (each gets its own subdomain)
xpose 3000 8787

# Auto-detect ports from Turborepo dev tasks
xpose --from-turbo

# Auto-detect ports from a specific Turborepo task/filter
xpose --from-turbo --turbo-task dev --turbo-filter=@acme/web

# Auto-detect ports from a Turborepo in another local path
xpose --from-turbo --path ../my-monorepo

# Custom subdomain
xpose 3000 --subdomain myapp

# Custom TTL (in seconds, default: 14400 = 4 hours)
xpose 3000 --ttl 7200

# Custom public domain (for self-hosting)
xpose 3000 --domain tunnel.example.com
```

Current default request/response body limit is `5MB` (configurable in the worker via `MAX_BODY_SIZE_BYTES`).

## Architecture

```
[Browser] --HTTPS--> [CF Worker] --> [Durable Object] --WSS--> [CLI] --> [localhost]
```

1. The CLI opens a WebSocket to a Durable Object on Cloudflare's edge
2. HTTP requests to your wildcard tunnel host (for example `*.tunnel.xpose.dev`) hit a Worker that routes to the correct Durable Object
3. The DO relays requests through the WebSocket to the CLI
4. The CLI proxies to localhost and sends the response back

## Self-Hosting Setup

To run your own instance of xpose on your domain:

### Prerequisites

- A domain added to Cloudflare (e.g. `tunnel.example.com`)
- Cloudflare account with Workers Paid plan ($5/mo)

### 1. DNS Configuration

Add **two** DNS records in the Cloudflare dashboard. Both must be **proxied** (orange cloud ON).

If your tunnel domain is the zone apex (example: `example.com`):

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A    | `@`  | `192.0.2.0` | Proxied |
| A    | `*`  | `192.0.2.0` | Proxied |

If your tunnel domain is a subdomain (example: `tunnel.example.com`):

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A    | `tunnel`  | `192.0.2.0` | Proxied |
| A    | `*.tunnel`  | `192.0.2.0` | Proxied |

**Why a dummy IP?** Cloudflare Workers are serverless - there is no origin server. The DNS records exist solely to route traffic into Cloudflare's proxy network, where the Worker intercepts it. The IP `192.0.2.0` is from RFC 5737's TEST-NET-1 range, reserved for documentation. It is never contacted. Any IP would work, but this is the convention for "originless" Workers setups.

**Why two records?** The wildcard record handles generated tunnel subdomains (for example `abc123.tunnel.example.com`). The non-wildcard record handles the tunnel domain itself (`tunnel.example.com`). Without the wildcard, subdomain requests would return `NXDOMAIN` and never reach the Worker.

**SSL:** Cloudflare's Universal SSL (free) automatically covers `tunnel.example.com` and `*.tunnel.example.com`. No certificate configuration needed.

### 2. Deploy the Worker

```bash
cd apps/worker
bun run deploy
```

This deploys the Worker with two routes:
- `*.tunnel.example.com/*` - catches all subdomain traffic
- `tunnel.example.com/*` - catches bare domain traffic

Before deploying, update `apps/worker/wrangler.jsonc`:
- Set `vars.PUBLIC_DOMAIN` to your tunnel domain.
- Set both route patterns to your tunnel domain.
- Set `zone_name` to your Cloudflare zone (for example `example.com`).

You can tune max proxied body size by setting `MAX_BODY_SIZE_BYTES` in `apps/worker/wrangler.jsonc` (default: `5242880`, i.e. 5MB).

### 3. Verify

```bash
curl https://tunnel.example.com
# Should return: {"name":"xpose","description":"Expose local servers to the internet",...}
```

Then run the CLI against your domain:

```bash
xpose 3000 --domain tunnel.example.com
```

## Development

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run worker locally
bun run dev --filter=@xpose/worker

# Build TypeScript CLI
bun run build --filter=@xpose/cli

# Build Go CLI
cd apps/cli-go && make build
# Run tests
cd apps/cli-go && make test
```

### Monorepo Structure

```
packages/protocol/     @xpose/protocol  - Shared message types & binary encoding
apps/worker/           @xpose/worker    - Cloudflare Worker + Durable Object
apps/cli/              @xpose/cli       - CLI tool (TypeScript/npm)
apps/cli-go/                            - CLI tool (Go/Homebrew)
```

## License

MIT
