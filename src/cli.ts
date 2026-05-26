#!/usr/bin/env node
import { Command } from "commander";
import { createCommand } from "./commands/create.js";
import { listCommand } from "./commands/list.js";
import { validateCommand } from "./commands/validate.js";
import { sessionCommand } from "./commands/session.js";
import { guideCommand, mcpCommand } from "./commands/guide.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { backupCommand, restoreCommand } from "./commands/backup.js";
import { daemonCommand } from "./commands/daemon.js";

const program = new Command();
program
  .name("dxcrm")
  .description("DatasynxOpenCRM — local-first, MCP-native CRM")
  .version("0.1.0")
  .exitOverride(); // for testability

program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(validateCommand);
program.addCommand(sessionCommand);
program.addCommand(guideCommand);
program.addCommand(mcpCommand);
program.addCommand(syncCommand);
program.addCommand(backupCommand);
program.addCommand(restoreCommand);
program.addCommand(daemonCommand);

await program.parseAsync(process.argv);
