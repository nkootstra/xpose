/**
 * Normalize a raw domain string by stripping protocol, trailing slashes/dots,
 * and converting to lowercase.
 */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}
