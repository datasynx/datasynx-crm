import { Command } from "commander";
import { info, success } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const toneCommand = new Command("tone").description(
  "Customer tonality profiles (per customer + global)"
);

toneCommand
  .command("set")
  .description("Set tone profile (global unless --slug given)")
  .option("--formality <v>", "formal | casual | friendly")
  .option("--language <v>", "Language code, e.g. de | en")
  .option("--do <csv>", "Comma-separated phrases to prefer")
  .option("--dont <csv>", "Comma-separated phrases to avoid")
  .option("--slug <slug>", "Customer slug (omit for global)")
  .action(
    async (opts: {
      formality?: string;
      language?: string;
      do?: string;
      dont?: string;
      slug?: string;
    }) => {
      const { setTone } = await import("../core/tone.js");
      setTone(
        dataDir(),
        {
          ...(opts.formality ? { formality: opts.formality } : {}),
          ...(opts.language ? { language: opts.language } : {}),
          ...(opts.do ? { dos: opts.do.split(",").map((s) => s.trim()) } : {}),
          ...(opts.dont ? { donts: opts.dont.split(",").map((s) => s.trim()) } : {}),
        },
        opts.slug
      );
      console.log(
        success(`Tone profile saved (${opts.slug ? `customer:${opts.slug}` : "global"}).`)
      );
    }
  );

toneCommand
  .command("show")
  .description("Show the effective tone profile")
  .option("--slug <slug>", "Customer slug")
  .action(async (opts: { slug?: string }) => {
    const { resolveTone, toneInstruction } = await import("../core/tone.js");
    const profile = resolveTone(dataDir(), opts.slug);
    console.log(info(JSON.stringify(profile)));
    console.log(`instruction: ${toneInstruction(profile) || "(none)"}`);
  });
