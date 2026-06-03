import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/crm";

beforeEach(() => {
  vol.reset();
  delete process.env["DXCRM_MCP_AUTH"];
});
afterEach(() => {
  delete process.env["DXCRM_MCP_AUTH"];
});

describe("mcp auth", () => {
  it("hashToken is deterministic sha-256 hex", async () => {
    const { hashToken } = await import("../../src/mcp/auth.js");
    expect(hashToken("secret")).toBe(hashToken("secret"));
    expect(hashToken("secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("isAuthRequired: off by default, on when tokens exist or env forces it", async () => {
    const { isAuthRequired } = await import("../../src/mcp/auth.js");
    expect(isAuthRequired(DATA_DIR)).toBe(false);

    process.env["DXCRM_MCP_AUTH"] = "required";
    expect(isAuthRequired(DATA_DIR)).toBe(true);
    delete process.env["DXCRM_MCP_AUTH"];

    vol.fromJSON({
      "/crm/.agentic/mcp-tokens.json": JSON.stringify({
        tokens: [{ hash: "x".repeat(64), actor: "alice", role: "admin" }],
      }),
    });
    expect(isAuthRequired(DATA_DIR)).toBe(true);

    process.env["DXCRM_MCP_AUTH"] = "off";
    expect(isAuthRequired(DATA_DIR)).toBe(false);
  });

  it("verifyBearer accepts a valid token and rejects bad/missing ones", async () => {
    const { hashToken, verifyBearer } = await import("../../src/mcp/auth.js");
    vol.fromJSON({
      "/crm/.agentic/mcp-tokens.json": JSON.stringify({
        tokens: [{ hash: hashToken("good-token"), actor: "alice", role: "manager" }],
      }),
    });
    const ok = verifyBearer("Bearer good-token", DATA_DIR);
    expect(ok.ok).toBe(true);
    expect(ok.actor).toBe("alice");
    expect(ok.role).toBe("manager");

    expect(verifyBearer("Bearer wrong", DATA_DIR).ok).toBe(false);
    expect(verifyBearer("good-token", DATA_DIR).ok).toBe(false); // missing Bearer prefix
    expect(verifyBearer(undefined, DATA_DIR).ok).toBe(false);
  });

  it("createMcpToken mints a token whose plaintext then verifies", async () => {
    const { createMcpToken, verifyBearer } = await import("../../src/mcp/auth.js");
    const token = createMcpToken(DATA_DIR, "bob", "rep", "laptop");
    expect(token).toMatch(/.{20,}/);
    const res = verifyBearer(`Bearer ${token}`, DATA_DIR);
    expect(res.ok).toBe(true);
    expect(res.actor).toBe("bob");
    expect(res.role).toBe("rep");
    // plaintext token must NOT be stored on disk
    const stored = vol.readFileSync("/crm/.agentic/mcp-tokens.json", "utf-8") as string;
    expect(stored).not.toContain(token);
  });

  it("protectedResourceMetadata and WWW-Authenticate header follow RFC 9728 shape", async () => {
    const { protectedResourceMetadata, wwwAuthenticateHeader } =
      await import("../../src/mcp/auth.js");
    const meta = protectedResourceMetadata("https://crm.example.com/mcp");
    expect(meta["resource"]).toBe("https://crm.example.com/mcp");
    expect(Array.isArray(meta["bearer_methods_supported"])).toBe(true);
    expect(
      wwwAuthenticateHeader("https://crm.example.com/.well-known/oauth-protected-resource")
    ).toContain('resource_metadata="https://crm.example.com/.well-known/oauth-protected-resource"');
  });
});
