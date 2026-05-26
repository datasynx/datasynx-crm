import * as lancedb from "@lancedb/lancedb";
import path from "path";

let _db: lancedb.Connection | null = null;

async function getDb(dataDir: string): Promise<lancedb.Connection> {
  if (!_db) {
    const dbPath = path.join(dataDir, ".agentic", "lancedb");
    _db = await lancedb.connect(dbPath);
  }
  return _db;
}

// Reset connection (useful for testing)
export function resetConnection(): void {
  _db = null;
}

export async function searchKnowledge(
  dataDir: string,
  slug: string,
  query: string,
  limit: number
): Promise<Array<{ content: string; score: number; source: string }>> {
  try {
    const db = await getDb(dataDir);
    const tableName = `docs_${slug.replace(/[^a-z0-9]/gi, "_")}`;

    // Check if table exists
    const tableNames: string[] = await db.tableNames();
    if (!tableNames.includes(tableName)) {
      return [];
    }

    const table = await db.openTable(tableName);

    // Simple text search — in a real impl this would use embeddings
    const results = await table
      .search(query)
      .limit(limit)
      .toArray();

    return results.map((r: Record<string, unknown>) => ({
      content: String(r["text"] ?? ""),
      score: typeof r["_distance"] === "number" ? 1 - r["_distance"] : 1,
      source: String(r["source_ref"] ?? ""),
    }));
  } catch {
    // If LanceDB table doesn't exist or search fails, return empty array
    return [];
  }
}
