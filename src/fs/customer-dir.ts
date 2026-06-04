import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { fromZodError } from "zod-validation-error";
import { MainFactsSchema, type MainFacts } from "../schemas/main-facts.js";

export function getCustomerDir(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug);
}

export function customerExists(dataDir: string, slug: string): boolean {
  return fs.existsSync(getCustomerDir(dataDir, slug));
}

/** List all customer slugs (immediate subdirectories of customers/). */
export function listCustomerSlugs(dataDir: string): string[] {
  const dir = path.join(dataDir, "customers");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((s) => {
    try {
      return fs.statSync(path.join(dir, s)).isDirectory();
    } catch {
      return false;
    }
  });
}

export async function ensureCustomerDir(dataDir: string, slug: string): Promise<void> {
  const customerDir = getCustomerDir(dataDir, slug);
  fs.mkdirSync(customerDir, { recursive: true });
  fs.mkdirSync(path.join(customerDir, "attachments"), { recursive: true });
  fs.mkdirSync(path.join(customerDir, "transcripts"), { recursive: true });
}

export async function writeMainFacts(
  dataDir: string,
  slug: string,
  facts: MainFacts
): Promise<void> {
  const filePath = path.join(getCustomerDir(dataDir, slug), "main_facts.md");
  // Strip undefined values — gray-matter YAML serializer rejects them
  const clean = Object.fromEntries(
    Object.entries(facts as Record<string, unknown>).filter(([, v]) => v !== undefined)
  );
  const content = matter.stringify("", clean);
  fs.writeFileSync(filePath, content, "utf-8");
}

export async function readMainFacts(dataDir: string, slug: string): Promise<MainFacts> {
  const filePath = path.join(getCustomerDir(dataDir, slug), "main_facts.md");
  if (!fs.existsSync(filePath)) {
    throw new Error(`main_facts.md not found for customer '${slug}'`);
  }
  // Use fs.readFileSync so the memfs mock is respected in tests,
  // then parse the string with matter.
  const content = fs.readFileSync(filePath, "utf-8") as string;
  const raw = matter(content);
  // gray-matter parses YYYY-MM-DD as Date objects; coerce back to strings for Zod
  const data = raw.data as Record<string, unknown>;
  for (const key of ["created", "updated"] as const) {
    if (data[key] instanceof Date) {
      data[key] = (data[key] as Date).toISOString().slice(0, 10);
    }
  }
  const result = MainFactsSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      fromZodError(result.error, {
        prefix: `Schema error in ${filePath}`,
        prefixSeparator: ":\n  - ",
        issueSeparator: "\n  - ",
      }).message
    );
  }
  return result.data;
}
