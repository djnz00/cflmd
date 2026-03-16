import { readFile, stat } from 'node:fs/promises';

import { requireAtlassianCredentials, writeTextOutput } from '../command-helpers.js';
import { CommandLineError } from '../command-line-error.js';
import { runBatch } from '../batch-runner.js';
import { readCflmdManifest } from '../cflmd-manifest.js';
import { formatPullHelp } from '../help.js';
import { parseMarkdownDocument } from '../markdown-document.js';
import { parsePullArguments } from '../options.js';
import { exportPageToMarkdown } from './export.js';

export async function runPullCommand({
  argv,
  cwd = process.cwd(),
  fetchImpl,
  globalOptions,
  stderr,
  stdout
}) {
  let parsed;

  try {
    parsed = parsePullArguments(argv);
  } catch (error) {
    if (error instanceof CommandLineError) {
      stderr.write(`${error.message}\n\n${formatPullHelp()}\n`);
      return error.exitCode;
    }

    throw error;
  }

  if (parsed.help) {
    stdout.write(`${formatPullHelp()}\n`);
    return 0;
  }

  if (parsed.positionals.length > 0) {
    stderr.write(`Unexpected positional arguments.\n\n${formatPullHelp()}\n`);
    return 1;
  }

  try {
    const { entries } = await readCflmdManifest({
      cwd,
      manifest: parsed.manifest
    });
    const { user, token } = requireAtlassianCredentials(globalOptions);
    const result = await runBatch({
      action: 'pull',
      entries,
      runEntry: async (entry) => {
        const skipReason = await readPullSkipReason({
          markdownPath: entry.markdownPath
        });

        if (skipReason) {
          return {
            reason: skipReason,
            status: 'skipped'
          };
        }

        const markdown = await exportPageToMarkdown({
          fetchImpl,
          pageUrl: entry.pageUrl,
          token,
          user
        });

        await writeTextOutput({
          output: entry.markdownPath,
          stdout,
          text: markdown
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

async function readPullSkipReason({ markdownPath }) {
  let markdownText;

  try {
    markdownText = await readFile(markdownPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  let metadata;

  try {
    ({ metadata } = parseMarkdownDocument(markdownText));
  } catch {
    return null;
  }

  if (!metadata?.versionTime) {
    return null;
  }

  const fileStats = await stat(markdownPath);

  if (fileStats.mtimeMs > Date.parse(metadata.versionTime)) {
    return 'local file has changed';
  }

  return null;
}
