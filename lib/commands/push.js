import { readFile, stat, writeFile } from 'node:fs/promises';

import { requireAtlassianCredentials } from '../command-helpers.js';
import { CommandLineError } from '../command-line-error.js';
import { runBatch } from '../batch-runner.js';
import { readCflmdManifest } from '../cflmd-manifest.js';
import { formatPushHelp } from '../help.js';
import { createVersionTime } from '../confluence-metadata.js';
import { formatMarkdownDocument, parseMarkdownDocument } from '../markdown-document.js';
import { parsePushArguments } from '../options.js';
import { publishMarkdownToPage } from './import.js';

export async function runPushCommand({
  argv,
  cwd = process.cwd(),
  fetchImpl,
  globalOptions,
  stdin,
  stderr,
  stdout
}) {
  let parsed;

  try {
    parsed = parsePushArguments(argv);
  } catch (error) {
    if (error instanceof CommandLineError) {
      stderr.write(`${error.message}\n\n${formatPushHelp()}\n`);
      return error.exitCode;
    }

    throw error;
  }

  if (parsed.help) {
    stdout.write(`${formatPushHelp()}\n`);
    return 0;
  }

  if (parsed.positionals.length > 0) {
    stderr.write(`Unexpected positional arguments.\n\n${formatPushHelp()}\n`);
    return 1;
  }

  try {
    const { entries } = await readCflmdManifest({
      cwd,
      manifest: parsed.manifest
    });
    const { user, token } = requireAtlassianCredentials(globalOptions);
    const result = await runBatch({
      action: 'push',
      entries,
      runEntry: async (entry) => {
        const markdownText = await readFile(entry.markdownPath, 'utf8');
        const skipReason = await readPushSkipReason({
          force: parsed.force,
          markdownPath: entry.markdownPath,
          markdownText
        });

        if (skipReason) {
          return {
            reason: skipReason,
            status: 'skipped'
          };
        }

        const published = await publishMarkdownToPage({
          fetchImpl,
          force: parsed.force,
          markdownText,
          pageUrl: entry.pageUrl,
          token,
          user
        });

        await writeUpdatedMarkdownMetadata({
          markdownPath: entry.markdownPath,
          markdownText,
          pageId: published.result.metadata.pageId,
          versionNumber: published.result.metadata.versionNumber
        });
      },
      stderr,
      stdout
    });

    return result.exitCode;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

async function readPushSkipReason({
  force,
  markdownPath,
  markdownText
}) {
  if (force) {
    return null;
  }

  const { metadata } = parseMarkdownDocument(markdownText);
  if (!metadata?.versionTime) {
    return null;
  }

  const fileStats = await stat(markdownPath);

  if (fileStats.mtimeMs > Date.parse(metadata.versionTime)) {
    return null;
  }

  return 'local file has not changed since the metadata timestamp';
}

async function writeUpdatedMarkdownMetadata({
  markdownPath,
  markdownText,
  pageId,
  versionNumber
}) {
  const { markdown } = parseMarkdownDocument(markdownText);
  const updatedMarkdownText = formatMarkdownDocument({
    markdown,
    pageId,
    versionNumber,
    versionTime: createVersionTime()
  });

  try {
    await writeFile(markdownPath, updatedMarkdownText, 'utf8');
  } catch (error) {
    throw new Error(`Published to Confluence but failed to update local metadata: ${error.message}`);
  }
}
