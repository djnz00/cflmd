import {
  requireAtlassianCredentials,
  writeTextOutput
} from '../command-helpers.js';
import { CommandLineError } from '../command-line-error.js';
import { runBatch } from '../batch-runner.js';
import { readCflmdManifest } from '../cflmd-manifest.js';
import { formatPullHelp } from '../help.js';
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
