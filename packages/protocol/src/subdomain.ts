import { customAlphabet } from "nanoid";
import { PROTOCOL } from "./constants.js";

export const generateSubdomainId = customAlphabet(
  PROTOCOL.SUBDOMAIN_ALPHABET,
  PROTOCOL.SUBDOMAIN_LENGTH,
);

export const generateRequestId = customAlphabet(
  PROTOCOL.SUBDOMAIN_ALPHABET,
  PROTOCOL.REQUEST_ID_LENGTH,
);

const generateSuffix = customAlphabet(
  PROTOCOL.SUBDOMAIN_ALPHABET,
  PROTOCOL.SUBDOMAIN_SUFFIX_LENGTH,
);

/**
 * Build a subdomain from a user-provided prefix by sanitizing it and
 * appending a random suffix: `my-app` → `my-app-x7k2m4`.
 * Falls back to a fully random ID if the prefix is empty after sanitizing.
 */
export function buildCustomSubdomain(prefix: string): string {
  const sanitized = prefix
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
  if (!sanitized) return generateSubdomainId();
  return `${sanitized}-${generateSuffix()}`;
}

const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_SUBDOMAIN_LENGTH = 63; // DNS label limit

export function validateSubdomain(
  subdomain: string,
): { ok: true } | { ok: false; reason: string } {
  if (subdomain.length < 1 || subdomain.length > MAX_SUBDOMAIN_LENGTH) {
    return { ok: false, reason: "Subdomain must be 1-63 characters" };
  }
  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    return {
      ok: false,
      reason:
        "Subdomain must contain only lowercase letters, digits, and hyphens",
    };
  }
  return { ok: true };
}
