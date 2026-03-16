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

export function convertMarkdownToAtl({ markdownText }) {
  const { markdown, metadata } = parseMarkdownDocument(markdownText);
  const storage = convertMarkdownToStorage(markdown);
  const atlText = metadata
    ? formatAtlDocument({
        document: storage,
        pageId: metadata.pageId,
        versionNumber: metadata.versionNumber
      })
    : storage;

  return {
    atlText,
    metadata
  };
}

export async function publishMarkdownToPage({
  fetchImpl = globalThis.fetch,
  force = false,
  markdownText,
  pageUrl,
  token,
  user
}) {
  const { atlText, metadata } = convertMarkdownToAtl({
    markdownText
  });

  if (!metadata && !force)
    throw new Error('Input Markdown is missing page metadata. Use --force to publish anyway.');

  const result = await updateNativeDocument({
    document: atlText,
    fetchImpl,
    force,
    pageUrl,
    token,
    user
  });

  return {
    metadata,
    result
  };
}

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
    const markdownText = await readTextInput({
      input: parsed.input,
      stdin
    });

    if (parsed.output) {
      if (isHttpUrl(parsed.output)) {
        const { user, token } = requireAtlassianCredentials(globalOptions);

        await publishMarkdownToPage({
          fetchImpl,
          force: parsed.force,
          markdownText,
          pageUrl: parsed.output,
          token,
          user
        });

        return 0;
      }
    }

    const { atlText } = convertMarkdownToAtl({
      markdownText
    });

    await writeTextOutput({
      output: parsed.output,
      stdout,
      text: atlText
    });
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}
