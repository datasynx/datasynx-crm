import { Command } from "commander";
import { CAPABILITIES_TEXT } from "../mcp/capabilities.js";

export const guideCommand = new Command("guide")
  .description("Full CRM documentation in terminal")
  .action(() => {
    console.log(CAPABILITIES_TEXT);
  });

// Also register `dxcrm mcp docs` alias via a subcommand
export const mcpCommand = new Command("mcp");
mcpCommand.command("docs").action(() => {
  console.log(CAPABILITIES_TEXT);
});
