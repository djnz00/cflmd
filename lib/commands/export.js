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
import { convertStorageToMarkdown } from '../storage-to-markdown.js';

export function convertAtlToMarkdown({ atlText }) {
  const { document: storage, metadata } = parseAtlDocument(atlText);
  const convertedMarkdown = convertStorageToMarkdown(storage);

  if (!metadata)
    return convertedMarkdown;

  return formatMarkdownDocument({
    markdown: convertedMarkdown,
    pageId: metadata.pageId,
    versionNumber: metadata.versionNumber
  });
}

export async function exportPageToMarkdown({
  fetchImpl = globalThis.fetch,
  pageUrl,
  token,
  user
}) {
  const { atl } = await fetchAtlDocument({
    fetchImpl,
    pageUrl,
    token,
    user
  });

  return convertAtlToMarkdown({
    atlText: atl
  });
}

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
    let markdown;

    if (parsed.input && isHttpUrl(parsed.input)) {
      const { user, token } = requireAtlassianCredentials(globalOptions);
      markdown = await exportPageToMarkdown({
        fetchImpl,
        pageUrl: parsed.input,
        token,
        user
      });
    } else {
      const atlText = await readTextInput({
        input: parsed.input,
        stdin
      });

      markdown = convertAtlToMarkdown({
        atlText
      });
    }

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
