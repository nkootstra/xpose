export const PROTOCOL = {
  /** Length of generated subdomain IDs */
  SUBDOMAIN_LENGTH: 12,
  /** Length of random suffix appended to custom subdomains */
  SUBDOMAIN_SUFFIX_LENGTH: 6,
  /** Characters used in subdomain IDs (lowercase + digits only for DNS compatibility) */
  SUBDOMAIN_ALPHABET: "abcdefghijklmnopqrstuvwxyz0123456789",

  /** Length of request IDs for multiplexing */
  REQUEST_ID_LENGTH: 12,

  /** How long to wait for a response from the CLI before timing out */
  REQUEST_TIMEOUT_MS: 30_000,
  /** How long to wait for CLI reconnection before rejecting queued requests */
  RECONNECT_GRACE_PERIOD_MS: 5_000,

  /** Default request/response body limit: 5MB */
  DEFAULT_MAX_BODY_SIZE_BYTES: 5 * 1024 * 1024,

  /** Reconnection backoff parameters */
  BACKOFF_BASE_MS: 1_000,
  BACKOFF_MULTIPLIER: 2,
  BACKOFF_MAX_MS: 30_000,
  BACKOFF_MAX_ATTEMPTS: 15,
  BACKOFF_JITTER_MIN: 0.1,
  BACKOFF_JITTER_MAX: 0.2,

  /** Default tunnel lifetime: 4 hours */
  DEFAULT_TTL_SECONDS: 14_400,
  /** Maximum tunnel lifetime: 24 hours */
  MAX_TTL_SECONDS: 86_400,

  /** Path where CLI connects via WebSocket */
  TUNNEL_CONNECT_PATH: "/_tunnel/connect",

  /** Default public tunnel domain */
  DEFAULT_PUBLIC_DOMAIN: "xpose.dev",

  /** Auto ping/pong strings for DO WebSocket hibernation */
  PING_MESSAGE: "ping",
  PONG_MESSAGE: "pong",

  /** How long a CLI session can be resumed after exit (seconds) */
  SESSION_RESUME_WINDOW_SECONDS: 600,
} as const;
