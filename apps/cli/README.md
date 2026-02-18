# xpose-dev

Expose local servers to the internet via Cloudflare. Zero config, instant public URLs.

An open-source alternative to ngrok built on Cloudflare Workers.

## Quick start

```sh
npx xpose-dev 3000
```

This gives you a public URL like `https://abc123xyz456.xpose.dev` that forwards traffic to `localhost:3000`.

## Install globally

```sh
npm install -g xpose-dev
```

Then run:

```sh
xpose-dev 3000
```

## Usage

### Expose a single port

```sh
npx xpose-dev 3000
```

### Expose multiple ports

```sh
npx xpose-dev 3000 8787
```

### Custom subdomain

```sh
npx xpose-dev --subdomain my-app 3000
# -> https://my-app-x7k2m4.xpose.dev
```

### Turborepo auto-discovery

Automatically detect ports from your Turborepo dev tasks:

```sh
npx xpose-dev --from-turbo
```

Filter to specific packages:

```sh
npx xpose-dev --from-turbo --turbo-filter=@myorg/web
```

### Set a custom TTL

```sh
npx xpose-dev --ttl 7200 3000
# Tunnel expires after 2 hours instead of the default 4
```

### Resume a previous session

After quitting, you can resume the same tunnel URLs within 10 minutes:

```sh
npx xpose-dev -r
```

### IP allowlisting

```sh
npx xpose-dev 3000 --allow-ips 203.0.113.10,198.51.100.0/24
```

### Rate limiting

```sh
npx xpose-dev 3000 --rate-limit 60
```

### CORS & custom headers

```sh
npx xpose-dev 3000 --cors
npx xpose-dev 3000 --header "X-Custom: value"
```

### Request inspection

The inspection dashboard starts automatically on every tunnel. Open `https://local.xpose.dev` or press `i` in the TUI.

To disable it:

```sh
npx xpose-dev 3000 --no-inspect
```

### Config file

Create `xpose.config.ts` in your project root:

```typescript
import { defineConfig } from "@xpose/tunnel-core";

export default defineConfig({
  tunnels: [{ port: 3000, subdomain: "my-app", cors: true }],
});
```

Then run without arguments:

```sh
npx xpose-dev
```

Use `--no-config` to skip loading the config file.

## Options

| Flag             | Description                                      | Default      |
| ---------------- | ------------------------------------------------ | ------------ |
| `-r`, `--resume` | Resume the previous session                      | `false`      |
| `--from-turbo`   | Auto-detect ports from Turborepo                 | `false`      |
| `--turbo-task`   | Turborepo task to inspect                        | `dev`        |
| `--turbo-filter` | Turborepo filter                                 | -            |
| `--turbo-path`   | Path to Turborepo root                           | `.`          |
| `--ttl`          | Tunnel TTL in seconds                            | `14400` (4h) |
| `--subdomain`    | Custom subdomain prefix                          | random       |
| `--domain`       | Public tunnel domain                             | `xpose.dev`  |
| `--allow-ips`    | Comma-separated IPs/CIDRs to allow               | -            |
| `--rate-limit`   | Max requests per minute per IP                   | -            |
| `--cors`         | Enable permissive CORS headers                   | `false`      |
| `--header`       | Custom response header (`key:value`), repeatable | -            |
| `--no-inspect`   | Disable the request inspection server            | `false`      |
| `--inspect-port` | Port for the inspection server                   | `4194`       |
| `--config`       | Path to config file                              | auto-detect  |
| `--no-config`    | Skip loading the config file                     | `false`      |

## Features

- Instant public URLs for any local port
- WebSocket support (HMR works through the tunnel)
- Turborepo integration for monorepo dev workflows
- Auto-reconnection with exponential backoff
- Session resume (`-r`) to keep the same URLs after restart
- Custom subdomains
- IP allowlisting with CIDR support
- Per-IP rate limiting
- CORS headers and custom response headers
- Real-time request inspection dashboard
- Config file support (`xpose.config.ts`)
- No sign-up required

## How it works

The CLI opens a WebSocket connection to a Cloudflare Worker. When someone visits your public URL, the Worker forwards the request through the tunnel to your local server and sends the response back.

WebSocket connections (used by HMR / hot reload) are also relayed through the tunnel so live reload works out of the box.

## Publishing setup (for maintainers)

### npm token

1. Go to [npmjs.com](https://www.npmjs.com) and sign in
2. Click your avatar > **Access Tokens** > **Generate New Token**
3. Select **Automation** token type (bypasses 2FA for CI)
4. Copy the token

### GitHub Actions secret

1. Go to your GitHub repo > **Settings** > **Secrets and variables** > **Actions**
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Value: paste the npm token from step above
5. Click **Add secret**

### Release process

1. Tag a release: `git tag v0.2.0 && git push origin v0.2.0`
2. The `cli-npm-release.yml` workflow will automatically:
   - Run tests
   - Build the package
   - Set the version from the git tag
   - Publish to npm

## License

MIT
