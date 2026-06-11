import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Record usage through a mock so the local-provider path exercises recordCall
// without touching the on-disk ledger.
const { recordUsageMock } = vi.hoisted(() => ({ recordUsageMock: vi.fn() }));
vi.mock("../../src/core/usage.js", () => ({ recordUsage: recordUsageMock }));

import { callLlm, resetLlmCircuit, resetLlmClient } from "../../src/core/llm.js";

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as unknown as Response;
}

describe("callLlm — local (OpenAI-compatible) provider path", () => {
  beforeEach(() => {
    resetLlmClient();
    resetLlmCircuit();
    vi.clearAllMocks();
    process.env["DXCRM_LLM_PROVIDER"] = "ollama";
  });

  afterEach(() => {
    delete process.env["DXCRM_LLM_PROVIDER"];
    delete process.env["DXCRM_LLM_BASE_URL"];
    vi.unstubAllGlobals();
    resetLlmCircuit();
  });

  it("POSTs to the OpenAI-compatible endpoint and returns the message content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "local answer" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callLlm("hello");

    expect(result).toBe("local answer");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { model: string; messages: unknown[] };
    expect(body.model).toBe("llama3.1");
    expect(body.messages).toHaveLength(1);
  });

  it("respects a custom base URL (trailing slash trimmed)", async () => {
    process.env["DXCRM_LLM_BASE_URL"] = "http://host:9000/v1/";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await callLlm("hi");

    expect(fetchMock.mock.calls[0]![0]).toBe("http://host:9000/v1/chat/completions");
  });

  it("records usage when the response includes a usage block", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "answer" } }],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await callLlm("hi", { slug: "acme-corp", tool: "summarize" });

    await vi.waitFor(() => expect(recordUsageMock).toHaveBeenCalledTimes(1));
    const recorded = recordUsageMock.mock.calls[0]![1] as {
      slug: string;
      tool: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
    };
    expect(recorded).toMatchObject({
      slug: "acme-corp",
      tool: "summarize",
      model: "llama3.1",
      inputTokens: 12,
      outputTokens: 7,
    });
  });

  it("does not record usage when the response omits a usage block", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: "answer" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await callLlm("hi");
    // Flush any pending microtasks the fire-and-forget recorder might have queued.
    await new Promise((r) => setTimeout(r, 5));
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("throws on a non-OK HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callLlm("hi")).rejects.toThrow("Local LLM error 503");
  });

  it("throws when the response has no text content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callLlm("hi")).rejects.toThrow("No text response from local LLM");
  });
});
