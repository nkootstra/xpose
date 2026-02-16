import { Hono } from "hono";
import { PROTOCOL } from "@xpose/protocol";
import type { Env } from "./types.js";

export { TunnelSession } from "./tunnel-session.js";

const app = new Hono<{
  Bindings: Env;
  Variables: { subdomain: string };
}>();

function getPublicDomain(env: Env): string {
  const normalized = env.PUBLIC_DOMAIN?.trim().toLowerCase();
  return normalized && normalized.length > 0
    ? normalized
    : PROTOCOL.DEFAULT_PUBLIC_DOMAIN;
}

function extractSubdomain(hostname: string, domain: string): string | null {
  const stripped = hostname.replace(/:.*$/, "");
  if (stripped === domain || stripped === `www.${domain}`) {
    return null;
  }
  const suffix = `.${domain}`;
  if (stripped.endsWith(suffix)) {
    return stripped.slice(0, -suffix.length);
  }
  return null;
}

// Redirect www to bare domain
app.all("*", async (c, next) => {
  const domain = getPublicDomain(c.env);
  const hostname = new URL(c.req.url).hostname;
  if (hostname === `www.${domain}`) {
    const url = new URL(c.req.url);
    url.hostname = domain;
    return c.redirect(url.toString(), 301);
  }
  await next();
});

// Extract subdomain and store in context
app.all("*", async (c, next) => {
  const domain = getPublicDomain(c.env);
  const hostname = new URL(c.req.url).hostname;
  const subdomain = extractSubdomain(hostname, domain);

  if (!subdomain) {
    // Bare domain - forward to marketing site
    return c.env.WEB_APP.fetch(c.req.raw);
  }

  c.set("subdomain", subdomain);
  await next();
});

// WebSocket upgrade for CLI tunnel connection
app.get(PROTOCOL.TUNNEL_CONNECT_PATH, async (c) => {
  const subdomain = c.get("subdomain");
  const upgradeHeader = c.req.header("upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  const id = c.env.TUNNEL_SESSION.idFromName(subdomain);
  const stub = c.env.TUNNEL_SESSION.get(id);
  return stub.fetch(c.req.raw);
});

// All other subdomain requests: proxy through tunnel
app.all("*", async (c) => {
  const subdomain = c.get("subdomain");
  const id = c.env.TUNNEL_SESSION.idFromName(subdomain);
  const stub = c.env.TUNNEL_SESSION.get(id);

  // Clone request with forwarding headers
  const headers = new Headers(c.req.raw.headers);
  const clientIp = c.req.header("cf-connecting-ip") ?? "unknown";
  headers.set("x-forwarded-for", clientIp);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-real-ip", clientIp);

  const proxyRequest = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers,
    body: c.req.raw.body,
  });

  return stub.fetch(proxyRequest);
});

export default app;
