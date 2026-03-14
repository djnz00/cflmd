import { runExportCommand } from './commands/export.js';
import { runGetCommand } from './commands/get.js';
import { runImportCommand } from './commands/import.js';
import { runPutCommand } from './commands/put.js';
import { CommandLineError } from './command-line-error.js';
import { formatMainHelp } from './help.js';
import { parseRootArguments } from './options.js';
import { cliVersion } from './version.js';

const COMMANDS = new Map([
  ['export', runExportCommand],
  ['get', runGetCommand],
  ['import', runImportCommand],
  ['put', runPutCommand]
]);

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  stdin = process.stdin,
  stderr = process.stderr,
  stdout = process.stdout
} = {}) {
  let parsed;

  try {
    parsed = parseRootArguments(argv);
  } catch (error) {
    if (error instanceof CommandLineError) {
      stderr.write(`${error.message}\n\n${formatMainHelp()}\n`);
      return error.exitCode;
    }

    throw error;
  }

  if (parsed.help) {
    stdout.write(`${formatMainHelp()}\n`);
    return 0;
  }

  if (parsed.version) {
    stdout.write(`${cliVersion}\n`);
    return 0;
  }

  if (!parsed.command) {
    stderr.write(`Missing command.\n\n${formatMainHelp()}\n`);
    return 1;
  }

  const handler = COMMANDS.get(parsed.command);
  if (!handler) {
    stderr.write(`Unknown command: ${parsed.command}\n\n${formatMainHelp()}\n`);
    return 1;
  }

  return handler({
    argv: parsed.commandArgs,
    fetchImpl,
    globalOptions: {
      token: parsed.globalOptions.token ?? env.ATLASSIAN_TOKEN,
      user: parsed.globalOptions.user ?? env.ATLASSIAN_USER
    },
    stdin,
    stderr,
    stdout
  });
}
