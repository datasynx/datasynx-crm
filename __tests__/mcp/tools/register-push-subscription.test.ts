import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("handleRegisterPushSubscription", () => {
  it("creates a gmail subscription and returns subscriptionId", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "gmail",
        slug: "acme-corp",
        webhookUrl: "https://example.com/webhooks/gmail",
        gmailTopicName: "projects/x/topics/y",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["subscriptionId"]).toMatch(/^psub_/);
    expect(parsed["provider"]).toBe("gmail");
    expect(parsed["slug"]).toBe("acme-corp");
    expect(parsed["status"]).toBe("active");
    expect(parsed["expiresAt"]).toBeDefined();
  });

  it("creates a microsoft-graph subscription", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "microsoft-graph",
        slug: "widget-co",
        webhookUrl: "https://example.com/webhooks/ms",
        microsoftClientState: "secret-123",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["provider"]).toBe("microsoft-graph");
    expect(parsed["expiresAt"]).toBeDefined();
  });

  it("creates a slack subscription with null expiresAt", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "slack",
        slug: "acme-corp",
        webhookUrl: "https://example.com/webhooks/slack",
        slackTeamId: "T12345",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["expiresAt"]).toBeNull();
  });

  it("persists subscription to push-subscriptions.json", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    await handleRegisterPushSubscription(
      { provider: "gmail", slug: "acme-corp", webhookUrl: "https://example.com/webhooks/gmail" },
      "/data"
    );
    const raw = vol.readFileSync("/data/.agentic/push-subscriptions.json", "utf-8") as string;
    const parsed = JSON.parse(raw) as { subscriptions: unknown[] };
    expect(parsed.subscriptions).toHaveLength(1);
  });

  it("warns when webhookUrl contains localhost", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      { provider: "gmail", slug: "acme-corp", webhookUrl: "http://localhost:3847/webhooks/gmail" },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as { warning?: string };
    expect(parsed.warning).toContain("localhost");
  });

  it("returns error on invalid provider gracefully", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { handleRegisterPushSubscription } =
      await import("../../../src/mcp/tools/register-push-subscription.js");
    const result = await handleRegisterPushSubscription(
      {
        provider: "invalid-provider" as "gmail",
        slug: "acme-corp",
        webhookUrl: "https://example.com",
      },
      "/data"
    );
    const parsed = JSON.parse(result.content[0]!.text) as { success?: boolean };
    expect(parsed.success).toBe(false);
  });
});
