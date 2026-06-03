import { describe, it, expect, afterEach } from "vitest";
import { maskPii, piiMaskingEnabled } from "../../src/core/pii.js";

afterEach(() => {
  delete process.env["DXCRM_PII_MASKING"];
});

describe("maskPii", () => {
  it("masks emails and restores them round-trip", () => {
    const { masked, unmask } = maskPii("Contact alice@acme.com and bob@beta.de about the deal.");
    expect(masked).not.toContain("alice@acme.com");
    expect(masked).not.toContain("bob@beta.de");
    expect(masked).toMatch(/\[EMAIL_\d+\]/);
    expect(unmask(masked)).toContain("alice@acme.com");
    expect(unmask(masked)).toContain("bob@beta.de");
  });

  it("masks phone numbers", () => {
    const { masked } = maskPii("Call +49 151 23456789 or (555) 123-4567.");
    expect(masked).not.toContain("23456789");
    expect(masked).toMatch(/\[PHONE_\d+\]/);
  });

  it("deduplicates repeated values to the same placeholder", () => {
    const { masked } = maskPii("alice@acme.com wrote; reply to alice@acme.com");
    const matches = masked.match(/\[EMAIL_\d+\]/g) ?? [];
    expect(matches).toHaveLength(2);
    expect(matches[0]).toBe(matches[1]);
  });

  it("leaves text without PII unchanged and unmask is identity", () => {
    const { masked, unmask } = maskPii("Quarterly review went well.");
    expect(masked).toBe("Quarterly review went well.");
    expect(unmask("nothing to restore")).toBe("nothing to restore");
  });
});

describe("piiMaskingEnabled", () => {
  it("is opt-in via DXCRM_PII_MASKING=on", () => {
    expect(piiMaskingEnabled()).toBe(false);
    process.env["DXCRM_PII_MASKING"] = "on";
    expect(piiMaskingEnabled()).toBe(true);
  });
});
