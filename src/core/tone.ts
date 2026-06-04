import fs from "fs";
import path from "path";

/**
 * Customer tonality (domino D8 / F2): per-customer (and global) tone profiles
 * applied automatically to generated communication. Customer profile fields
 * override the global default; the merged profile is rendered into a tone
 * instruction for the LLM (used by draft_email / sequences / journeys).
 */
export interface ToneProfile {
  formality?: string; // e.g. formal | casual | friendly
  language?: string; // e.g. de | en
  dos?: string[];
  donts?: string[];
  examples?: string[];
}

function globalPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "tone.json");
}
function customerPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "tone.json");
}

function readProfile(p: string): ToneProfile {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8") as string) as ToneProfile;
  } catch {
    return {};
  }
}

export function setTone(dataDir: string, profile: ToneProfile, slug?: string): void {
  const p = slug ? customerPath(dataDir, slug) : globalPath(dataDir);
  const merged = { ...readProfile(p), ...profile };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(merged, null, 2), "utf-8");
}

/** Effective profile: global as base, customer fields override. */
export function resolveTone(dataDir: string, slug?: string): ToneProfile {
  const global = readProfile(globalPath(dataDir));
  if (!slug) return global;
  return { ...global, ...readProfile(customerPath(dataDir, slug)) };
}

/** Render a tone profile into an instruction string ("" when blank). */
export function toneInstruction(profile: ToneProfile): string {
  const parts: string[] = [];
  if (profile.formality) parts.push(`tone: ${profile.formality}`);
  if (profile.language) parts.push(`language: ${profile.language}`);
  if (profile.dos && profile.dos.length) parts.push(`prefer: ${profile.dos.join(", ")}`);
  if (profile.donts && profile.donts.length) parts.push(`avoid: ${profile.donts.join(", ")}`);
  return parts.join("; ");
}
