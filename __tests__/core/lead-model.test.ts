import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";

function pipeline(rows: Array<[string, string, number, number]>): string {
  const header =
    "# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n" +
    "|---|---|---|---|---|---|---|---|\n";
  const body = rows
    .map(
      ([name, stage, value, prob]) =>
        `| ${name} | ${stage} | ${value} | EUR | ${prob} | | | 2026-06-01 |`
    )
    .join("\n");
  return header + body + "\n";
}

describe("lead model (logistic regression)", () => {
  it("trains on won/lost history and predicts higher win-prob for stronger deals", async () => {
    vol.fromJSON({
      "/crm/customers/a/pipeline.md": pipeline([
        ["W1", "won", 60000, 90],
        ["W2", "won", 50000, 85],
        ["W3", "won", 70000, 95],
        ["L1", "lost", 2000, 10],
        ["L2", "lost", 1500, 15],
        ["L3", "lost", 3000, 5],
      ]),
    });
    const { buildLeadModel, predictWin } = await import("../../src/core/lead-model.js");
    const model = buildLeadModel(DATA_DIR);
    expect(model.trainedOn).toBe(6);

    const strong = predictWin(model, {
      name: "S",
      stage: "negotiation",
      value: 65000,
      currency: "EUR",
      probability: 88,
      updated: "2026-06-01",
    });
    const weak = predictWin(model, {
      name: "Wk",
      stage: "lead",
      value: 1000,
      currency: "EUR",
      probability: 8,
      updated: "2026-06-01",
    });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.5);
    expect(weak).toBeLessThan(0.5);
  });

  it("persists and reloads a trained model", async () => {
    vol.fromJSON({
      "/crm/customers/a/pipeline.md": pipeline([
        ["W1", "won", 60000, 90],
        ["L1", "lost", 1000, 10],
      ]),
    });
    const { buildLeadModel, saveLeadModel, loadLeadModel } =
      await import("../../src/core/lead-model.js");
    const model = buildLeadModel(DATA_DIR);
    saveLeadModel(DATA_DIR, model);
    const reloaded = loadLeadModel(DATA_DIR);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.weights).toEqual(model.weights);
  });

  it("reports insufficient data when there is no closed history", async () => {
    vol.fromJSON({
      "/crm/customers/a/pipeline.md": pipeline([["Open", "proposal", 5000, 50]]),
    });
    const { buildLeadModel } = await import("../../src/core/lead-model.js");
    const model = buildLeadModel(DATA_DIR);
    expect(model.trainedOn).toBe(0);
    expect(model.sufficient).toBe(false);
  });
});
