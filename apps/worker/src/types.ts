import type { TunnelSession } from "./tunnel-session.js";

export interface Env {
  TUNNEL_SESSION: DurableObjectNamespace<TunnelSession>;
  MAX_BODY_SIZE_BYTES?: string;
  PUBLIC_DOMAIN?: string;
}
