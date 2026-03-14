import { formatAtlDocument } from '../atl-document.js';
import {
  isHttpUrl,
  readTextInput,
  requireAtlassianCredentials,
  writeTextOutput
} from '../command-helpers.js';
import { CommandLineError } from '../command-line-error.js';
import { updateNativeDocument } from '../confluence-api.js';
import { formatImportHelp } from '../help.js';
import { parseImportArguments } from '../options.js';
import { parseMarkdownDocument } from '../markdown-document.js';
import { convertMarkdownToStorage } from '../markdown-to-storage.js';

export async function runImportCommand({
  argv,
  fetchImpl,
  globalOptions,
  stdin,
  stderr,
  stdout
}) {
  let parsed;

  try {
    parsed = parseImportArguments(argv);
  } catch (error) {
    if (error instanceof CommandLineError) {
      stderr.write(`${error.message}\n\n${formatImportHelp()}\n`);
      return error.exitCode;
    }

    throw error;
  }

  if (parsed.help) {
    stdout.write(`${formatImportHelp()}\n`);
    return 0;
  }

  if (parsed.positionals.length > 0) {
    stderr.write(`Unexpected positional arguments.\n\n${formatImportHelp()}\n`);
    return 1;
  }

  try {
    const inputText = await readTextInput({
      input: parsed.input,
      stdin
    });
    const { markdown, metadata } = parseMarkdownDocument(inputText);
    const storage = convertMarkdownToStorage(markdown);
    const atl = metadata
      ? formatAtlDocument({
          document: storage,
          pageId: metadata.pageId,
          versionNumber: metadata.versionNumber
        })
      : storage;

    if (parsed.output) {
      if (isHttpUrl(parsed.output)) {
        if (!metadata && !parsed.force) {
          throw new Error('Input Markdown is missing page metadata. Use --force to publish anyway.');
        }

        const { user, token } = requireAtlassianCredentials(globalOptions);

        await updateNativeDocument({
          document: atl,
          fetchImpl,
          force: parsed.force,
          pageUrl: parsed.output,
          token,
          user
        });

        return 0;
      }
    }

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
