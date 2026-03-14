import {
  readTextInput,
  requireAtlassianCredentials
} from '../command-helpers.js';
import { CommandLineError } from '../command-line-error.js';
import { updateNativeDocument } from '../confluence-api.js';
import { formatPutHelp } from '../help.js';
import { parsePutArguments } from '../options.js';

export async function runPutCommand({
  argv,
  fetchImpl,
  globalOptions,
  stdin,
  stderr,
  stdout
}) {
  let parsed;

  try {
    parsed = parsePutArguments(argv);
  } catch (error) {
    if (error instanceof CommandLineError) {
      stderr.write(`${error.message}\n\n${formatPutHelp()}\n`);
      return error.exitCode;
    }

    throw error;
  }

  if (parsed.help) {
    stdout.write(`${formatPutHelp()}\n`);
    return 0;
  }

  if (parsed.positionals.length !== 1) {
    stderr.write(`Expected exactly one page URL.\n\n${formatPutHelp()}\n`);
    return 1;
  }

  try {
    const { user, token } = requireAtlassianCredentials(globalOptions);
    const document = await readTextInput({
      input: parsed.input,
      stdin
    });

    await updateNativeDocument({
      document,
      fetchImpl,
      force: parsed.force,
      pageUrl: parsed.positionals[0],
      token,
      user
    });

    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}
