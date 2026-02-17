# Xpose

An open-source alternative to [ngrok](https://ngrok.com), built on [Cloudflare Workers](https://workers.cloudflare.com/) and Durable Objects.

Expose your local development servers to the internet with a single command.

For production deployment and release setup, see `docs/PRODUCTION_SETUP.md`.

## Quick Start

```bash
# Run directly with npx — no install needed
npx xpose-dev 3000
```

```
  ╭ Tunnels ───────────────────╮╭ Traffic ──────────────────────────╮
  │                            ││                                   │
  │  ✓ Connected               ││  14:32:07  GET  /          200 12ms│
  │  → https://k3x9m.xpose.dev││  14:32:08  GET  /main.css  200  4ms│
  │    Forwarding localhost:3000│  14:32:09  POST /api/hook  201 87ms│
  │    TTL: 3h 59m 48s         ││                                   │
  │                            ││                                   │
  ╰────────────────────────────╯╰───────────────────────────────────╯
  q quit | b open browser | tab switch panel | ↑↓ scroll
```

## Features

- Built entirely on Cloudflare's global edge network
- No dedicated servers to manage - fully serverless
- Single command via npx (`npx xpose-dev 3000`)
- Full-screen TUI with scrollable traffic log, live TTL countdown, and mouse support
- Session resume - pick up where you left off with `npx xpose-dev -r` (10-minute window)
- Auto-reconnection with exponential backoff
- Configurable TTL (default 4 hours)
- Turborepo port auto-discovery (`--from-turbo`)

## Usage

```bash
# Expose port 3000 with a random subdomain
npx xpose-dev 3000

# Expose multiple ports at once (each gets its own subdomain)
npx xpose-dev 3000 8787

# Auto-detect ports from Turborepo dev tasks
npx xpose-dev --from-turbo

# Auto-detect ports from a specific Turborepo task/filter
npx xpose-dev --from-turbo --turbo-task dev --turbo-filter=@acme/web

# Auto-detect ports from a Turborepo in another local path
npx xpose-dev --from-turbo --path ../my-monorepo

# Custom subdomain
npx xpose-dev 3000 --subdomain myapp

# Custom TTL (in seconds, default: 14400 = 4 hours)
npx xpose-dev 3000 --ttl 7200

# Custom public domain (for self-hosting)
npx xpose-dev 3000 --domain tunnel.example.com

# Resume the previous session (within 10 minutes of exit)
npx xpose-dev -r
```

When you exit the TUI, your session is saved automatically. Resume within 10 minutes using `npx xpose-dev -r` to reconnect to the same URLs.

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

| Type | Name | Content     | Proxy   |
| ---- | ---- | ----------- | ------- |
| A    | `@`  | `192.0.2.0` | Proxied |
| A    | `*`  | `192.0.2.0` | Proxied |

If your tunnel domain is a subdomain (example: `tunnel.example.com`):

| Type | Name       | Content     | Proxy   |
| ---- | ---------- | ----------- | ------- |
| A    | `tunnel`   | `192.0.2.0` | Proxied |
| A    | `*.tunnel` | `192.0.2.0` | Proxied |

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
npx xpose-dev 3000 --domain tunnel.example.com
```

## Development

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run worker locally
bun run dev --filter=@xpose/worker

# Run all tests
bunx turbo run test
```

### Developing the CLI

The CLI lives in `apps/cli/` and depends on two workspace packages (`@xpose/protocol`, `@xpose/tunnel-core`).

**One-off build and run:**

```bash
# Build the CLI (and its workspace dependencies)
bun run build --filter=@xpose/cli

# Run it
cd apps/cli
bun start -- 3000
# or: node dist/index.js 3000
```

**Watch mode (two terminals):**

```bash
# Terminal 1: rebuild on every change
cd apps/cli
bun dev

# Terminal 2: run the built output
cd apps/cli
bun start -- 3000
```

`bun dev` only watches and rebuilds — it does not start the CLI. You need a second terminal to run `bun start -- 3000` (which executes `node dist/index.js 3000`). After each code change, tsup rebuilds automatically; stop and re-run `bun start` to pick up the new build.

**Running against a local worker:**

```bash
# Terminal 1: local worker
bun run dev --filter=@xpose/worker

# Terminal 2: CLI pointing at local worker
cd apps/cli
bun start -- 3000 --domain localhost:8787
```

**Run CLI tests:**

```bash
bunx turbo run test --filter=@xpose/cli
```

### CLI Architecture

```
apps/cli/
├── src/
│   ├── index.ts           # Entry point — CLI arg parsing (citty), session resume, runTunnels()
│   ├── tunnel-client.ts   # WebSocket tunnel client — HTTP proxy, reconnection, ping/pong
│   ├── ws-relay.ts        # WebSocket relay manager — proxies WS connections (HMR support)
│   └── tui/
│       └── app.tsx         # ink (React for CLIs) TUI — split-pane panels, traffic log, TTL countdown
├── tsup.config.ts         # Bundles workspace packages into a self-contained output with shebang
└── package.json           # Published as "xpose-dev" on npm
```

Key design decisions:

- **ink + React** for the TUI (replaces Bubble Tea from the old Go CLI). Renders a split-pane layout with a "Tunnels" panel and a scrollable "Traffic" panel.
- **tsup** bundles `@xpose/protocol` and `@xpose/tunnel-core` into the output via `noExternal`, so the published npm package is self-contained (~47KB).
- **citty** for CLI argument parsing (lightweight, zero-dep).
- **Session resume**: on exit, a session file is saved to `~/.config/xpose/session.json`. The `-r` flag reloads it within a 10-minute window and reconnects to the same subdomains.
- **Non-TTY safe**: `useInput` is guarded with `process.stdin.isTTY` so the CLI does not crash in non-interactive environments (CI, piped output).

### Monorepo Structure

```
packages/protocol/       @xpose/protocol      - Shared message types & binary encoding
packages/tunnel-core/    @xpose/tunnel-core   - Shared CLI utilities (logger, turborepo, domain)
apps/worker/             @xpose/worker        - Cloudflare Worker + Durable Object
apps/cli/                xpose-dev            - CLI tool (TypeScript/npm)
```

## License

MIT
