import {
  requireAtlassianCredentials,
  writeTextOutput
} from '../command-helpers.js';
import { fetchAtlDocument } from '../confluence-api.js';
import { formatGetHelp } from '../help.js';
import { parseGetArguments } from '../options.js';
import { CommandLineError } from '../command-line-error.js';

export async function runGetCommand({
  argv,
  fetchImpl,
  globalOptions,
  stderr,
  stdout
}) {
  let parsed;

  try {
    parsed = parseGetArguments(argv);
  } catch (error) {
    if (error instanceof CommandLineError) {
      stderr.write(`${error.message}\n\n${formatGetHelp()}\n`);
      return error.exitCode;
    }

    throw error;
  }

  if (parsed.help) {
    stdout.write(`${formatGetHelp()}\n`);
    return 0;
  }

  if (parsed.positionals.length !== 1) {
    stderr.write(`Expected exactly one page URL.\n\n${formatGetHelp()}\n`);
    return 1;
  }

  try {
    const { user, token } = requireAtlassianCredentials(globalOptions);
    const { atl } = await fetchAtlDocument({
      fetchImpl,
      pageUrl: parsed.positionals[0],
      user,
      token
    });

    await writeTextOutput({
      output: parsed.output,
      stdout,
      text: atl
    });
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}
