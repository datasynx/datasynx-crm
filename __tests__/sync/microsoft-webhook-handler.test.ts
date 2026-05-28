import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("verifyMicrosoftGraphSignature", () => {
  it("returns true when clientState in body matches stored secret", async () => {
    const { verifyMicrosoftGraphSignature } = await import("../../src/sync/microsoft-webhook-handler.js");
    const body = {
      value: [{ subscriptionId: "sub1", clientState: "my-secret", resource: "/me/messages" }],
    };
    expect(verifyMicrosoftGraphSignature(body, "my-secret")).toBe(true);
  });

  it("returns false for mismatched clientState", async () => {
    const { verifyMicrosoftGraphSignature } = await import("../../src/sync/microsoft-webhook-handler.js");
    const body = {
      value: [{ subscriptionId: "sub1", clientState: "wrong-secret", resource: "/me/messages" }],
    };
    expect(verifyMicrosoftGraphSignature(body, "my-secret")).toBe(false);
  });

  it("returns false for missing clientState", async () => {
    const { verifyMicrosoftGraphSignature } = await import("../../src/sync/microsoft-webhook-handler.js");
    const body = { value: [{ subscriptionId: "sub1", resource: "/me/messages" }] };
    expect(verifyMicrosoftGraphSignature(body as never, "my-secret")).toBe(false);
  });

  it("returns true when value array is empty and secret is empty", async () => {
    const { verifyMicrosoftGraphSignature } = await import("../../src/sync/microsoft-webhook-handler.js");
    expect(verifyMicrosoftGraphSignature({ value: [] }, "")).toBe(true);
  });
});

describe("handleMicrosoftValidationRequest", () => {
  it("detects validationToken query param (Graph handshake)", async () => {
    const { handleMicrosoftValidationRequest } = await import("../../src/sync/microsoft-webhook-handler.js");
    const result = handleMicrosoftValidationRequest({ validationToken: "abc123" });
    expect(result.isValidation).toBe(true);
  });

  it("returns { isValidation: true, token } when validationToken present", async () => {
    const { handleMicrosoftValidationRequest } = await import("../../src/sync/microsoft-webhook-handler.js");
    const result = handleMicrosoftValidationRequest({ validationToken: "tok-xyz" });
    expect(result.token).toBe("tok-xyz");
  });

  it("returns { isValidation: false } when no validationToken", async () => {
    const { handleMicrosoftValidationRequest } = await import("../../src/sync/microsoft-webhook-handler.js");
    const result = handleMicrosoftValidationRequest({});
    expect(result.isValidation).toBe(false);
    expect(result.token).toBeUndefined();
  });
});

describe("handleMicrosoftPushEvent", () => {
  function makeSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: "psub_ms_1",
      provider: "microsoft-graph" as const,
      slug: "acme-corp",
      webhookUrl: "https://example.com/webhooks/microsoft",
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {
        microsoftSubscriptionId: "ms-sub-1",
        microsoftClientState: "my-secret",
      },
      status: "active" as const,
      lastEventAt: null,
      eventsProcessed: 0,
      ...overrides,
    };
  }

  it("processes value[] array from Graph notification body", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleMicrosoftPushEvent } = await import("../../src/sync/microsoft-webhook-handler.js");

    const notifications = [{
      subscriptionId: "ms-sub-1",
      clientState: "my-secret",
      resource: "/me/messages/msg-1",
      resourceData: { id: "msg-1", "@odata.type": "#Microsoft.Graph.Message" },
    }];

    const fetchMessageFn = vi.fn().mockResolvedValue({
      id: "msg-1", subject: "Deal Update", from: { emailAddress: { address: "contact@acme.com" } },
      receivedDateTime: "2026-05-28T10:00:00Z", bodyPreview: "Hello from Microsoft",
    });
    const appendInteractionFn = vi.fn().mockResolvedValue(undefined);

    const result = await handleMicrosoftPushEvent("/data", notifications, "fake-token", {
      fetchMessageFn, appendInteractionFn,
    });

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(appendInteractionFn).toHaveBeenCalledOnce();
  });

  it("skips notification when no customer subscription matched", async () => {
    vol.fromJSON({
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleMicrosoftPushEvent } = await import("../../src/sync/microsoft-webhook-handler.js");

    const notifications = [{
      subscriptionId: "ms-sub-UNKNOWN",
      clientState: "my-secret",
      resource: "/me/messages/msg-2",
    }];

    const fetchMessageFn = vi.fn();
    const result = await handleMicrosoftPushEvent("/data", notifications, "token", { fetchMessageFn });

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(fetchMessageFn).not.toHaveBeenCalled();
  });

  it("handles empty value array gracefully", async () => {
    vol.fromJSON({ "/data/.agentic/push-subscriptions.json": JSON.stringify({ subscriptions: [], updatedAt: "" }) });
    const { handleMicrosoftPushEvent } = await import("../../src/sync/microsoft-webhook-handler.js");
    const result = await handleMicrosoftPushEvent("/data", [], "token", {});
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("matches subscription by microsoftSubscriptionId", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleMicrosoftPushEvent } = await import("../../src/sync/microsoft-webhook-handler.js");

    const notifications = [{
      subscriptionId: "ms-sub-1",
      clientState: "my-secret",
      resource: "/me/messages/msg-3",
      resourceData: { id: "msg-3", "@odata.type": "#Microsoft.Graph.Message" },
    }];

    const fetchMessageFn = vi.fn().mockResolvedValue({
      id: "msg-3", subject: "Follow Up",
      from: { emailAddress: { address: "partner@acme.com" } },
      receivedDateTime: "2026-05-28T12:00:00Z",
      bodyPreview: "Following up on our call",
    });
    const appendInteractionFn = vi.fn().mockResolvedValue(undefined);

    const result = await handleMicrosoftPushEvent("/data", notifications, "token", {
      fetchMessageFn, appendInteractionFn,
    });

    expect(result.processed).toBe(1);
  });

  it("increments eventsProcessed on subscription after processing", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/.agentic/push-subscriptions.json": JSON.stringify({
        subscriptions: [makeSubscription()],
        updatedAt: new Date().toISOString(),
      }),
    });

    const { handleMicrosoftPushEvent, readSubscriptions } = await import("../../src/sync/microsoft-webhook-handler.js");

    const notifications = [{
      subscriptionId: "ms-sub-1",
      clientState: "my-secret",
      resource: "/me/messages/msg-4",
      resourceData: { id: "msg-4", "@odata.type": "#Microsoft.Graph.Message" },
    }];

    const fetchMessageFn = vi.fn().mockResolvedValue({
      id: "msg-4", subject: "S", from: { emailAddress: { address: "x@y.com" } },
      receivedDateTime: "2026-05-28T12:00:00Z", bodyPreview: "B",
    });

    await handleMicrosoftPushEvent("/data", notifications, "t", { fetchMessageFn, appendInteractionFn: vi.fn().mockResolvedValue(undefined) });
    const subs = await readSubscriptions("/data");
    expect(subs[0]!.eventsProcessed).toBe(1);
  });
});
