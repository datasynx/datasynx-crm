import { describe, it, expect } from "vitest";
import {
  emptyGraph,
  upsertEdge,
  invalidateEdge,
  activeEdges,
  makeEdgeId,
  type EdgeType,
} from "../../src/core/graph.js";

function baseEdge(from: string, to: string, type: EdgeType = "WORKS_AT") {
  return {
    from,
    to,
    type,
    weight: 0.1,
    sentiment: 0,
    lastContact: "2026-05-01",
    contactCount: 1,
    properties: {},
  };
}

describe("bi-temporal graph edges", () => {
  it("stamps recordedAt and validFrom on a newly created edge", () => {
    let g = emptyGraph("acme");
    g = upsertEdge(g, baseEdge("p1", "c1"));
    const edge = g.edges[0]!;
    expect(edge.recordedAt).toBeDefined();
    expect(edge.validFrom).toBeDefined();
    expect(edge.invalidatedAt).toBeUndefined();
  });

  it("invalidateEdge sets validTo + invalidatedAt without removing the edge", () => {
    let g = emptyGraph("acme");
    g = upsertEdge(g, baseEdge("p1", "c1"));
    const id = makeEdgeId("WORKS_AT", "p1", "c1");
    g = invalidateEdge(g, id, "2026-06-01T00:00:00Z");

    // edge is retained (audit trail), not deleted
    expect(g.edges).toHaveLength(1);
    const edge = g.edges[0]!;
    expect(edge.invalidatedAt).toBeDefined();
    expect(edge.validTo).toBe("2026-06-01T00:00:00Z");
  });

  it("activeEdges excludes invalidated edges", () => {
    let g = emptyGraph("acme");
    g = upsertEdge(g, baseEdge("p1", "c1", "WORKS_AT"));
    g = upsertEdge(g, baseEdge("p2", "c1", "WORKS_AT"));
    g = invalidateEdge(g, makeEdgeId("WORKS_AT", "p1", "c1"));

    const active = activeEdges(g);
    expect(active).toHaveLength(1);
    expect(active[0]!.from).toBe("p2");
  });

  it("is backward compatible: edges without timestamps count as active", () => {
    const g = emptyGraph("acme");
    // simulate a legacy edge with no temporal fields
    g.edges.push({
      id: "legacy",
      from: "p1",
      to: "c1",
      type: "WORKS_AT",
      weight: 0.2,
      sentiment: 0,
      lastContact: "2026-01-01",
      contactCount: 3,
      properties: {},
    });
    expect(activeEdges(g)).toHaveLength(1);
  });
});
