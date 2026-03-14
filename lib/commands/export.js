import { parseAtlDocument } from '../atl-document.js';
import {
  isHttpUrl,
  readTextInput,
  requireAtlassianCredentials,
  writeTextOutput
} from '../command-helpers.js';
import { CommandLineError } from '../command-line-error.js';
import { fetchAtlDocument } from '../confluence-api.js';
import { formatExportHelp } from '../help.js';
import { formatMarkdownDocument } from '../markdown-document.js';
import { parseExportArguments } from '../options.js';
import { readStream } from '../read-stream.js';
import { convertStorageToMarkdown } from '../storage-to-markdown.js';

export async function runExportCommand({
  argv,
  fetchImpl,
  globalOptions,
  stdin,
  stderr,
  stdout
}) {
  let parsed;

  try {
    parsed = parseExportArguments(argv);
  } catch (error) {
    if (error instanceof CommandLineError) {
      stderr.write(`${error.message}\n\n${formatExportHelp()}\n`);
      return error.exitCode;
    }

    throw error;
  }

  if (parsed.help) {
    stdout.write(`${formatExportHelp()}\n`);
    return 0;
  }

  if (parsed.positionals.length > 0) {
    stderr.write(`Unexpected positional arguments.\n\n${formatExportHelp()}\n`);
    return 1;
  }

  try {
    const inputText = await readExportInput({
      fetchImpl,
      globalOptions,
      input: parsed.input,
      stdin
    });
    const { document: storage, metadata } = parseAtlDocument(inputText);
    const convertedMarkdown = convertStorageToMarkdown(storage);
    const markdown = metadata
      ? formatMarkdownDocument({
          markdown: convertedMarkdown,
          pageId: metadata.pageId,
          versionNumber: metadata.versionNumber
        })
      : convertedMarkdown;

    await writeTextOutput({
      output: parsed.output,
      stdout,
      text: markdown
    });
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

async function readExportInput({ fetchImpl, globalOptions, input, stdin }) {
  if (!input || !isHttpUrl(input)) {
    return readTextInput({
      input,
      stdin
    });
  }

  const { user, token } = requireAtlassianCredentials(globalOptions);

  const { atl } = await fetchAtlDocument({
    fetchImpl,
    pageUrl: input,
    token,
    user
  });

  return atl;
}
