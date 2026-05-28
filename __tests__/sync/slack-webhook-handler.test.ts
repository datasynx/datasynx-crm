import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import crypto from "crypto";

vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

function makeSlackSignature(secret: string, timestamp: string, body: string): string {
  const sigBase = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", secret).update(sigBase).digest("hex");
  return `v0=${hmac}`;
}

describe("verifySlackSignature", () => {
  it("returns true for valid HMAC-SHA256 with correct secret", async () => {
    const { verifySlackSignature } = await import("../../src/sync/slack-webhook-handler.js");
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = makeSlackSignature("my-signing-secret", timestamp, body);
    expect(verifySlackSignature(body, {
      "x-slack-signature": sig,
      "x-slack-request-timestamp": timestamp,
    }, "my-signing-secret")).toBe(true);
  });

  it("returns false for invalid signature", async () => {
    const { verifySlackSignature } = await import("../../src/sync/slack-webhook-handler.js");
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(verifySlackSignature(body, {
      "x-slack-signature": "v0=badhash",
      "x-slack-request-timestamp": timestamp,
    }, "my-signing-secret")).toBe(false);
  });

  it("returns false for missing X-Slack-Signature header", async () => {
    const { verifySlackSignature } = await import("../../src/sync/slack-webhook-handler.js");
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(verifySlackSignature(body, {
      "x-slack-request-timestamp": timestamp,
    }, "my-signing-secret")).toBe(false);
  });

  it("returns false for timestamp > 5 minutes old (replay protection)", async () => {
    const { verifySlackSignature } = await import("../../src/sync/slack-webhook-handler.js");
    const body = JSON.stringify({ type: "event_callback" });
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 6 * 60); // 6 minutes ago
    const sig = makeSlackSignature("my-signing-secret", oldTimestamp, body);
    expect(verifySlackSignature(body, {
      "x-slack-signature": sig,
      "x-slack-request-timestamp": oldTimestamp,
    }, "my-signing-secret")).toBe(false);
  });
});

describe("handleSlackUrlVerification", () => {
  it("detects url_verification event type", async () => {
    const { handleSlackUrlVerification } = await import("../../src/sync/slack-webhook-handler.js");
    const result = handleSlackUrlVerification({ type: "url_verification", challenge: "abc" });
    expect(result.isVerification).toBe(true);
  });

  it("returns challenge string for url_verification", async () => {
    const { handleSlackUrlVerification } = await import("../../src/sync/slack-webhook-handler.js");
    const result = handleSlackUrlVerification({ type: "url_verification", challenge: "my-challenge-xyz" });
    expect(result.challenge).toBe("my-challenge-xyz");
  });

  it("returns null for non-verification events", async () => {
    const { handleSlackUrlVerification } = await import("../../src/sync/slack-webhook-handler.js");
    const result = handleSlackUrlVerification({ type: "event_callback" });
    expect(result.isVerification).toBe(false);
    expect(result.challenge).toBeUndefined();
  });
});

describe("handleSlackPushEvent", () => {
  function makeSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: "psub_slack_1",
      provider: "slack" as const,
      slug: "acme-corp",
      webhookUrl: "https://example.com/webhooks/slack",
      expiresAt: null,
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: { slackTeamId: "T123", slackBotToken: "xoxb-fake" },
      status: "active" as const,
      lastEventAt: null,
      eventsProcessed: 0,
      ...overrides,
    };
  }

  it("processes message events with matched customer", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleSlackPushEvent } = await import("../../src/sync/slack-webhook-handler.js");

    const event = { type: "message", user: "U123", text: "Hey, let's sync this week", channel: "C456", ts: "1716892800.000000" };
    const appendInteractionFn = vi.fn().mockResolvedValue(undefined);
    const fetchUserInfoFn = vi.fn().mockResolvedValue({ email: "alice@acme.com", name: "Alice" });

    const result = await handleSlackPushEvent("/data", event, "xoxb-fake", {
      appendInteractionFn, fetchUserInfoFn, teamId: "T123",
    });

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(appendInteractionFn).toHaveBeenCalledOnce();
  });

  it("skips bot messages (bot_id present)", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleSlackPushEvent } = await import("../../src/sync/slack-webhook-handler.js");

    const event = { type: "message", bot_id: "B999", text: "Automated message", channel: "C456" };
    const appendInteractionFn = vi.fn();

    const result = await handleSlackPushEvent("/data", event, "xoxb-fake", { appendInteractionFn });
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(appendInteractionFn).not.toHaveBeenCalled();
  });

  it("skips messages with no text", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleSlackPushEvent } = await import("../../src/sync/slack-webhook-handler.js");

    const event = { type: "message", user: "U123", channel: "C456" };
    const appendInteractionFn = vi.fn();

    const result = await handleSlackPushEvent("/data", event, "xoxb-fake", { appendInteractionFn });
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("skips when no matching slack subscription found", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleSlackPushEvent } = await import("../../src/sync/slack-webhook-handler.js");

    const event = { type: "message", user: "U999", text: "Hello", channel: "C999" };
    const appendInteractionFn = vi.fn();

    const result = await handleSlackPushEvent("/data", event, "xoxb-fake", {
      appendInteractionFn, teamId: "T-UNKNOWN",
    });

    expect(result.processed).toBe(0);
    expect(appendInteractionFn).not.toHaveBeenCalled();
  });

  it("returns { processed: 0, skipped: 1 } for non-message event types", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleSlackPushEvent } = await import("../../src/sync/slack-webhook-handler.js");
    const event = { type: "reaction_added", user: "U123", channel: "C456" };
    const result = await handleSlackPushEvent("/data", event, "xoxb-fake", {});
    expect(result.processed).toBe(0);
  });
});
