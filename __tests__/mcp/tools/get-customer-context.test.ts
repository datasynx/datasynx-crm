import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/core/context-builder.js", () => ({
  buildContext: vi.fn(),
}));

import { handleGetCustomerContext } from "../../../src/mcp/tools/get-customer-context.js";
import { buildContext } from "../../../src/core/context-builder.js";

const mockBuildContext = vi.mocked(buildContext);

describe("get_customer_context tool", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  it("returns formatted context for an existing customer", async () => {
    mockBuildContext.mockResolvedValue("# Customer Context: acme-corp\n\nSome context here.");

    const result = await handleGetCustomerContext(
      { slug: "acme-corp" },
      "/data"
    );

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("acme-corp");
    expect(result.isError).toBeFalsy();
  });

  it("returns error message for non-existent customer (not a throw)", async () => {
    mockBuildContext.mockRejectedValue(new Error("Customer 'unknown' not found"));

    const result = await handleGetCustomerContext(
      { slug: "unknown" },
      "/data"
    );

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("unknown");
    expect(result.isError).toBe(true);
  });

  it("returns error when no slug provided and no active session", async () => {
    const result = await handleGetCustomerContext({}, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("No customer specified");
    expect(result.isError).toBe(true);
  });

  it("calls buildContext with correct dataDir and slug", async () => {
    mockBuildContext.mockResolvedValue("# Customer Context: test-corp");

    await handleGetCustomerContext({ slug: "test-corp" }, "/my/data");

    expect(mockBuildContext).toHaveBeenCalledWith("/my/data", "test-corp");
  });
});
