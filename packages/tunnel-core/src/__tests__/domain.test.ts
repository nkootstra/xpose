import { describe, it, expect } from "vitest";
import { normalizeDomain } from "../domain.js";

describe("normalizeDomain", () => {
  it("strips https:// prefix", () => {
    expect(normalizeDomain("https://xpose.dev")).toBe("xpose.dev");
  });

  it("strips http:// prefix", () => {
    expect(normalizeDomain("http://xpose.dev")).toBe("xpose.dev");
  });

  it("strips trailing slash and path", () => {
    expect(normalizeDomain("xpose.dev/some/path")).toBe("xpose.dev");
  });

  it("strips trailing dot", () => {
    expect(normalizeDomain("xpose.dev.")).toBe("xpose.dev");
  });

  it("lowercases domain", () => {
    expect(normalizeDomain("Xpose.Dev")).toBe("xpose.dev");
  });

  it("trims whitespace", () => {
    expect(normalizeDomain("  xpose.dev  ")).toBe("xpose.dev");
  });

  it("handles full URL with all parts", () => {
    expect(normalizeDomain("  HTTPS://Xpose.Dev./foo  ")).toBe("xpose.dev");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeDomain("")).toBe("");
  });
});
