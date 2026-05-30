import { Command } from "commander";
import fs from "fs";
import path from "path";
import { success, error, info, bold } from "../ui/colors.js";

export async function runAttach(
  slug: string,
  filePath: string,
  dataDir?: string
): Promise<{ attached: string } | { error: string }> {
  const dir = dataDir ?? process.cwd();
  const customerDir = path.join(dir, "customers", slug);

  if (!fs.existsSync(customerDir)) {
    const msg = `Customer '${slug}' not found.`;
    console.error(error(msg));
    return { error: msg };
  }

  if (!fs.existsSync(filePath)) {
    const msg = `File not found: ${filePath}`;
    console.error(error(msg));
    return { error: msg };
  }

  const attachmentsDir = path.join(customerDir, "attachments");
  fs.mkdirSync(attachmentsDir, { recursive: true });

  const filename = path.basename(filePath);
  const dest = path.join(attachmentsDir, filename);

  if (fs.existsSync(dest)) {
    const msg = `Attachment already exists: ${filename}`;
    console.log(info(msg));
    return { attached: dest };
  }

  fs.copyFileSync(filePath, dest);
  console.log(success(`Attached ${bold(filename)} to ${bold(slug)}`));
  return { attached: dest };
}

export async function runListAttachments(slug: string, dataDir?: string): Promise<string[]> {
  const dir = dataDir ?? process.cwd();
  const attachmentsDir = path.join(dir, "customers", slug, "attachments");

  if (!fs.existsSync(attachmentsDir)) return [];

  try {
    return fs.readdirSync(attachmentsDir).filter((f) => {
      try {
        return fs.statSync(path.join(attachmentsDir, f)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

export const attachCommand = new Command("attach")
  .description("Attach a file to a customer (copies to customers/<slug>/attachments/)")
  .argument("<slug>", "Customer slug")
  .argument("<file>", "Path to the file to attach")
  .action(async (slug: string, file: string) => {
    await runAttach(slug, file, process.env["DXCRM_DATA_DIR"]);
  });
