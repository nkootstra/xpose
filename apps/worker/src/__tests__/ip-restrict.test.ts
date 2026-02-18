import { describe, it, expect } from "vitest";
import { isIpAllowed } from "../ip-restrict.js";

describe("isIpAllowed", () => {
  it("returns true for empty allowlist", () => {
    expect(isIpAllowed("1.2.3.4", [])).toBe(true);
  });

  // --- Exact IPv4 match ---

  it("allows exact IPv4 match", () => {
    expect(isIpAllowed("192.168.1.5", ["192.168.1.5"])).toBe(true);
  });

  it("rejects non-matching exact IPv4", () => {
    expect(isIpAllowed("192.168.1.6", ["192.168.1.5"])).toBe(false);
  });

  it("allows when IP matches one of multiple entries", () => {
    expect(
      isIpAllowed("10.0.0.1", ["192.168.1.5", "10.0.0.1", "172.16.0.1"]),
    ).toBe(true);
  });

  // --- CIDR ranges ---

  it("allows IP within /24 range", () => {
    expect(isIpAllowed("192.168.1.42", ["192.168.1.0/24"])).toBe(true);
  });

  it("rejects IP outside /24 range", () => {
    expect(isIpAllowed("192.168.2.42", ["192.168.1.0/24"])).toBe(false);
  });

  it("allows IP within /16 range", () => {
    expect(isIpAllowed("10.0.55.123", ["10.0.0.0/16"])).toBe(true);
  });

  it("rejects IP outside /16 range", () => {
    expect(isIpAllowed("10.1.0.1", ["10.0.0.0/16"])).toBe(false);
  });

  it("handles /32 (single host)", () => {
    expect(isIpAllowed("10.0.0.1", ["10.0.0.1/32"])).toBe(true);
    expect(isIpAllowed("10.0.0.2", ["10.0.0.1/32"])).toBe(false);
  });

  it("handles /0 (matches everything)", () => {
    expect(isIpAllowed("1.2.3.4", ["0.0.0.0/0"])).toBe(true);
    expect(isIpAllowed("255.255.255.255", ["0.0.0.0/0"])).toBe(true);
  });

  it("handles /8 range", () => {
    expect(isIpAllowed("10.255.255.255", ["10.0.0.0/8"])).toBe(true);
    expect(isIpAllowed("11.0.0.0", ["10.0.0.0/8"])).toBe(false);
  });

  // --- Mixed entries ---

  it("allows when matching either CIDR or exact", () => {
    expect(
      isIpAllowed("203.0.113.50", ["192.168.1.0/24", "203.0.113.50"]),
    ).toBe(true);
    expect(
      isIpAllowed("192.168.1.100", ["192.168.1.0/24", "203.0.113.50"]),
    ).toBe(true);
  });

  it("rejects when matching neither CIDR nor exact", () => {
    expect(isIpAllowed("172.16.0.1", ["192.168.1.0/24", "203.0.113.50"])).toBe(
      false,
    );
  });

  // --- IPv6 ---

  it("allows exact IPv6 match", () => {
    expect(isIpAllowed("::1", ["::1"])).toBe(true);
  });

  it("allows case-insensitive IPv6 match", () => {
    expect(isIpAllowed("2001:DB8::1", ["2001:db8::1"])).toBe(true);
  });

  it("rejects non-matching IPv6", () => {
    expect(isIpAllowed("::2", ["::1"])).toBe(false);
  });

  // --- Edge cases ---

  it("handles whitespace in IP", () => {
    expect(isIpAllowed(" 10.0.0.1 ", ["10.0.0.1"])).toBe(true);
  });

  it("handles whitespace in allowlist entry", () => {
    expect(isIpAllowed("10.0.0.1", [" 10.0.0.1 "])).toBe(true);
  });

  it("rejects invalid CIDR prefix", () => {
    expect(isIpAllowed("10.0.0.1", ["10.0.0.0/33"])).toBe(false);
    expect(isIpAllowed("10.0.0.1", ["10.0.0.0/-1"])).toBe(false);
  });

  it("rejects invalid IP formats", () => {
    expect(isIpAllowed("not-an-ip", ["10.0.0.0/24"])).toBe(false);
    expect(isIpAllowed("10.0.0.1", ["not-a-range/24"])).toBe(false);
  });
});
