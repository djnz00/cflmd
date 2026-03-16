export async function runBatch({
  action,
  entries,
  runEntry,
  stderr,
  stdout
}) {
  let failed = 0;
  let processed = 0;
  let skipped = 0;
  let succeeded = 0;

  for (const entry of entries) {
    processed += 1;

    try {
      const result = await runEntry(entry);

      if (result?.status === 'skipped') {
        skipped += 1;
        stdout.write(formatStatus({
          action,
          entry,
          reason: result.reason,
          status: 'skipped'
        }));
        continue;
      }

      succeeded += 1;
      stdout.write(formatStatus({
        action,
        entry,
        status: 'ok'
      }));
    } catch (error) {
      failed += 1;
      stderr.write(formatStatus({
        action,
        entry,
        error,
        status: 'failed'
      }));
    }
  }

  const summary =
    skipped > 0
      ? `${action} summary: ${processed} processed, ${succeeded} succeeded, ${failed} failed, ${skipped} skipped\n`
      : `${action} summary: ${processed} processed, ${succeeded} succeeded, ${failed} failed\n`;

  if (failed > 0)
    stderr.write(summary);
  else
    stdout.write(summary);

  return {
    exitCode: failed > 0 ? 1 : 0,
    failed,
    processed,
    skipped,
    succeeded
  };
}

function formatStatus({
  action,
  entry,
  error,
  reason,
  status
}) {
  const direction = action === 'pull' ? '<-' : '->';

  if (status === 'ok')
    return `${action} ok ${entry.rawMarkdownPath} ${direction} ${entry.pageUrl}\n`;

  if (status === 'skipped')
    return `${action} skipped ${entry.rawMarkdownPath} ${direction} ${entry.pageUrl}: ${reason}\n`;

  return `${action} failed ${entry.rawMarkdownPath} ${direction} ${entry.pageUrl}: ${formatError(error)}\n`;
}

function formatError(error) {
  if (error instanceof Error)
    return error.message;

  return String(error);
}
