/**
 * Branded HTML error pages for xpose tunnel errors.
 *
 * These are shown to end users when they visit a tunnel URL
 * and something goes wrong (tunnel offline, timeout, etc.).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorPage(opts: {
  status: number;
  title: string;
  message: string;
  hint?: string;
}): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)} — xpose</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #030712;
    color: #f9fafb;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .container {
    text-align: center;
    max-width: 480px;
    padding: 2rem;
  }
  .status {
    font-size: 6rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
    background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-top: 1rem;
    color: #f9fafb;
  }
  .message {
    margin-top: 0.75rem;
    font-size: 1rem;
    line-height: 1.6;
    color: #9ca3af;
  }
  .hint {
    margin-top: 1.5rem;
    padding: 0.875rem 1rem;
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #a5b4fc;
    font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
  }
  .brand {
    margin-top: 2.5rem;
    font-size: 0.8125rem;
    color: #4b5563;
  }
  .brand a {
    color: #6366f1;
    text-decoration: none;
  }
  .brand a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <div class="status">${opts.status}</div>
  <h1>${escapeHtml(opts.title)}</h1>
  <p class="message">${escapeHtml(opts.message)}</p>
  ${opts.hint ? `<div class="hint">${escapeHtml(opts.hint)}</div>` : ""}
  <p class="brand">Powered by <a href="https://xpose.dev">xpose</a></p>
</div>
</body>
</html>`;

  return new Response(html, {
    status: opts.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** 502 — Tunnel is not connected (CLI is offline). */
export function tunnelNotConnected(): Response {
  return errorPage({
    status: 502,
    title: "Tunnel not connected",
    message:
      "This tunnel exists but the local server isn't connected right now. It may have gone offline or the session expired.",
    hint: "xpose 3000",
  });
}

/** 504 — Proxied request timed out. */
export function gatewayTimeout(): Response {
  return errorPage({
    status: 504,
    title: "Gateway Timeout",
    message:
      "The local server took too long to respond. Make sure it's running and able to handle requests.",
  });
}

/** 502 — Tunnel disconnected while request was in flight. */
export function tunnelDisconnected(): Response {
  return errorPage({
    status: 502,
    title: "Tunnel disconnected",
    message:
      "The tunnel went offline while your request was being processed. The developer may be restarting their server.",
  });
}

/** 502 — Tunnel expired (TTL reached). */
export function tunnelExpired(): Response {
  return errorPage({
    status: 502,
    title: "Tunnel expired",
    message:
      "This tunnel session has expired. The developer needs to start a new tunnel.",
    hint: "xpose 3000",
  });
}

/** 502 — CLI returned an error (e.g. localhost unreachable). */
export function upstreamError(message: string, status = 502): Response {
  return errorPage({
    status,
    title: status === 413 ? "Payload Too Large" : "Bad Gateway",
    message,
  });
}
