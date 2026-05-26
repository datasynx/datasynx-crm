import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/core/lancedb.js", () => ({
  searchKnowledge: vi.fn(),
}));

import { handleSearchCustomerKnowledge } from "../../../src/mcp/tools/search-customer-knowledge.js";
import { searchKnowledge } from "../../../src/core/lancedb.js";

const mockSearch = vi.mocked(searchKnowledge);

describe("search_customer_knowledge tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns results from lancedb search", async () => {
    mockSearch.mockResolvedValue([
      { content: "Pricing was discussed", score: 0.95, source: "gmail://thread/123" },
      { content: "Budget is 10k", score: 0.85, source: "file://transcript.txt" },
    ]);

    const result = await handleSearchCustomerKnowledge(
      { slug: "acme-corp", query: "pricing", limit: 5 },
      "/data"
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { results: unknown[] };
    expect(parsed.results).toHaveLength(2);
  });

  it("returns empty array with helpful message when no results", async () => {
    mockSearch.mockResolvedValue([]);

    const result = await handleSearchCustomerKnowledge(
      { slug: "acme-corp", query: "nonexistent topic" },
      "/data"
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { results: unknown[]; message?: string };
    expect(parsed.results).toHaveLength(0);
    expect(parsed.message).toBeDefined();
  });

  it("uses default limit of 5 when not specified", async () => {
    mockSearch.mockResolvedValue([]);

    await handleSearchCustomerKnowledge(
      { slug: "acme-corp", query: "something" },
      "/data"
    );

    expect(mockSearch).toHaveBeenCalledWith("/data", "acme-corp", "something", 5);
  });

  it("uses provided limit", async () => {
    mockSearch.mockResolvedValue([]);

    await handleSearchCustomerKnowledge(
      { slug: "acme-corp", query: "something", limit: 10 },
      "/data"
    );

    expect(mockSearch).toHaveBeenCalledWith("/data", "acme-corp", "something", 10);
  });

  it("handles lancedb errors gracefully (returns empty results)", async () => {
    mockSearch.mockRejectedValue(new Error("DB connection failed"));

    const result = await handleSearchCustomerKnowledge(
      { slug: "acme-corp", query: "pricing" },
      "/data"
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { results: unknown[] };
    expect(parsed.results).toHaveLength(0);
  });
});
