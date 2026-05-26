import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import { createCustomer } from "../../src/commands/create.js";

beforeEach(() => vol.reset());

describe("createCustomer", () => {
  it("creates customer directory with correct slug", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    const r = await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    expect(r.id).toBe("acme-corp");
  });

  it("creates main_facts.md", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    expect(memFs.existsSync("/crm/customers/acme-corp/main_facts.md")).toBe(true);
  });

  it("creates interactions.md and pipeline.md", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Test Co", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    expect(memFs.existsSync("/crm/customers/test-co/interactions.md")).toBe(true);
    expect(memFs.existsSync("/crm/customers/test-co/pipeline.md")).toBe(true);
  });

  it("is idempotent", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    const r1 = await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    const r2 = await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    expect(r1.id).toBe(r2.id);
  });

  it("sets gmail query from domain", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Test Co", domain: "test.com", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    const sources = JSON.parse(
      memFs.readFileSync("/crm/customers/test-co/sources.json", "utf-8") as string
    );
    expect(sources.gmail.query).toContain("test.com");
  });

  it("sets gmail query from email when no domain", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Test Co", email: "contact@example.com", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    const sources = JSON.parse(
      memFs.readFileSync("/crm/customers/test-co/sources.json", "utf-8") as string
    );
    expect(sources.gmail.query).toContain("contact@example.com");
  });

  it("creates sources.json", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    expect(memFs.existsSync("/crm/customers/acme-corp/sources.json")).toBe(true);
  });

  it("returns dir path", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    const r = await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    expect(r.dir).toContain("acme-corp");
  });

  it("main_facts.md has relationship_stage prospect", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync(
      "/crm/customers/acme-corp/main_facts.md",
      "utf-8"
    ) as string;
    expect(content).toContain("prospect");
  });
});
