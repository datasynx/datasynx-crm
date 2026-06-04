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

async function tools() {
  return import("../../../src/mcp/tools/custom-objects.js");
}

function parse(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe("custom object MCP tools", () => {
  it("defines an object, creates a record, and lists records + objects", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const {
      handleDefineCustomObject,
      handleCreateRecord,
      handleListRecords,
      handleListCustomObjects,
    } = await tools();

    handleDefineCustomObject(
      {
        name: "contract",
        fields: [
          { name: "value", type: "number" },
          { name: "stage", type: "select", options: ["draft", "signed"] },
        ],
      },
      DATA_DIR
    );

    const created = parse(
      handleCreateRecord(
        { object: "contract", values: { value: "5000", stage: "signed" } },
        DATA_DIR
      )
    );
    expect((created["record"] as { values: unknown }).values).toEqual({
      value: 5000,
      stage: "signed",
    });

    const listed = parse(handleListRecords({ object: "contract" }, DATA_DIR));
    expect((listed["records"] as unknown[]).length).toBe(1);

    const objs = parse(handleListCustomObjects(DATA_DIR));
    expect((objs["objects"] as Array<{ name: string }>)[0]!.name).toBe("contract");
  });

  it("create_record returns an error for invalid values", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const { handleDefineCustomObject, handleCreateRecord } = await tools();
    handleDefineCustomObject(
      { name: "contract", fields: [{ name: "stage", type: "select", options: ["draft"] }] },
      DATA_DIR
    );
    const res = parse(
      handleCreateRecord({ object: "contract", values: { stage: "bronze" } }, DATA_DIR)
    );
    expect(res["error"]).toBeTruthy();
  });
});
