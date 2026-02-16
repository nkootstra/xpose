import type { TunnelSession } from "./tunnel-session.js";

export interface Env {
  TUNNEL_SESSION: DurableObjectNamespace<TunnelSession>;
  WEB_APP: Fetcher;
  MAX_BODY_SIZE_BYTES?: string;
  PUBLIC_DOMAIN?: string;
}
