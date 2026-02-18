/**
 * IP allowlist checking with CIDR range support.
 */

/**
 * Parse an IPv4 address into a 32-bit unsigned integer.
 * Returns null if the address is not a valid IPv4 address.
 */
function parseIPv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = Number.parseInt(part, 10);
    if (!Number.isFinite(num) || num < 0 || num > 255) return null;
    if (part !== String(num)) return null; // reject leading zeros like "01"
    result = (result << 8) | num;
  }
  return result >>> 0; // ensure unsigned
}

/**
 * Check if a client IP matches an allowlist entry.
 *
 * Supports:
 * - Exact IPv4 match: "192.168.1.5"
 * - CIDR range: "192.168.1.0/24"
 * - Exact IPv6 match (case-insensitive): "::1", "2001:db8::1"
 */
function matchesEntry(clientIp: string, entry: string): boolean {
  const cidrSlash = entry.indexOf("/");

  if (cidrSlash !== -1) {
    // CIDR range — only supported for IPv4 currently
    const networkStr = entry.slice(0, cidrSlash);
    const prefixStr = entry.slice(cidrSlash + 1);

    const network = parseIPv4(networkStr);
    const client = parseIPv4(clientIp);
    const prefix = Number.parseInt(prefixStr, 10);

    if (network === null || client === null) return false;
    if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;

    if (prefix === 0) return true; // 0.0.0.0/0 matches everything
    const mask = (~0 << (32 - prefix)) >>> 0;
    return (client & mask) === (network & mask);
  }

  // Exact match
  // For IPv4, compare parsed integers to handle formatting differences
  const clientIPv4 = parseIPv4(clientIp);
  const entryIPv4 = parseIPv4(entry);
  if (clientIPv4 !== null && entryIPv4 !== null) {
    return clientIPv4 === entryIPv4;
  }

  // IPv6 exact match (case-insensitive)
  return clientIp.toLowerCase() === entry.toLowerCase();
}

/**
 * Check if a client IP address is allowed by an allowlist.
 *
 * @param clientIp - The client's IP address (from cf-connecting-ip or x-forwarded-for)
 * @param allowList - Array of IPs or CIDR ranges to allow
 * @returns true if the IP is allowed
 */
export function isIpAllowed(clientIp: string, allowList: string[]): boolean {
  if (allowList.length === 0) return true;

  const trimmedIp = clientIp.trim();
  for (const entry of allowList) {
    if (matchesEntry(trimmedIp, entry.trim())) {
      return true;
    }
  }

  return false;
}
