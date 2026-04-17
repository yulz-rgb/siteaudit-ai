import { describe, expect, it } from "vitest";
import { normalizeUrl } from "@/lib/utils";

describe("normalizeUrl", () => {
  it("adds https when protocol is missing", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
  });

  it("throws for invalid host values", () => {
    expect(() => normalizeUrl("localhost")).toThrow("Please enter a valid website URL.");
  });
});
