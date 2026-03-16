export function formatMainHelp() {
  return [
    'Usage:',
    '  cflmd [global-options] <command> [command-options]',
    '',
    'Commands:',
    '  export           Convert a Confluence document (.atl) to Markdown',
    '  get <url>        Download a page in native Confluence format',
    '  import           Convert Markdown to a Confluence document (.atl)',
    '  pull             Refresh Markdown files from a manifest',
    '  put <url>        Update and publish a Confluence document',
    '  push             Refresh Confluence pages from a manifest',
    '',
    'Global options:',
    '  --help           Show help for the CLI',
    '  --version, -v    Show the current cflmd version',
    '  --user=USER      Use this user instead of ATLASSIAN_USER',
    '  --token=TOKEN    Use this token instead of ATLASSIAN_TOKEN',
    '',
    'Run `cflmd <command> --help` for command-specific usage.'
  ].join('\n');
}

export function formatGetHelp() {
  return [
    'Usage:',
    '  cflmd [global-options] get [--help] <url>',
    '',
    'Download the raw `storage` body for a Confluence page URL.',
    'The output `.atl` includes a metadata header with the page ID and version.',
    '',
    'Command options:',
    '  --help           Show help for this command',
    '  --output=FILE    Write the downloaded document to FILE',
    '  -o FILE          Short form of --output',
    '',
    'Global options:',
    '  --user=USER      Use this user instead of ATLASSIAN_USER',
    '  --token=TOKEN    Use this token instead of ATLASSIAN_TOKEN',
    '',
    'Global options must appear before the subcommand.',
    '',
    'Arguments:',
    '  <url>            Confluence page URL'
  ].join('\n');
}

export function formatExportHelp() {
  return [
    'Usage:',
    '  cflmd export [--help] [--input=FILE|URL | -i FILE|URL] [--output=FILE | -o FILE]',
    '',
    'Export a Confluence storage document (`.atl`) to Markdown.',
    'If the `.atl` includes page metadata, export writes it as top-of-file comments.',
    'If --input is a Confluence page URL, export fetches the current `.atl` first.',
    '',
    'Command options:',
    '  --help           Show help for this command',
    '  --input=FILE|URL Read the storage document from FILE',
    '                    or fetch the current `.atl` from a Confluence page URL',
    '  -i FILE|URL      Short form of --input',
    '  --output=FILE    Write the converted markdown to FILE',
    '  -o FILE          Short form of --output',
    '',
    'Input defaults to stdin when --input is not provided.',
    '',
    'Global options are required when --input is a Confluence page URL.'
  ].join('\n');
}

export function formatImportHelp() {
  return [
    'Usage:',
    '  cflmd import [--help] [--force] [--input=FILE | -i FILE] [--output=FILE|URL | -o FILE|URL]',
    '',
    'Import Markdown and emit a Confluence storage document (`.atl`).',
    'If the Markdown includes page metadata comments, import preserves them.',
    'If --output is a Confluence page URL, import publishes directly to that existing page.',
    'Use --force to publish even when the Markdown metadata is missing or mismatched.',
    '',
    'Command options:',
    '  --help            Show help for this command',
    '  --force           Publish anyway when metadata checks would fail',
    '  --input=FILE      Read the markdown document from FILE',
    '  -i FILE           Short form of --input',
    '  --output=FILE|URL Write the generated `.atl` document to FILE',
    '                    or publish it directly to a Confluence page URL',
    '  -o FILE|URL       Short form of --output',
    '',
    'Input defaults to stdin when --input is not provided.',
    '',
    'Global options are required when --output is a Confluence page URL.'
  ].join('\n');
}

export function formatPutHelp() {
  return [
    'Usage:',
    '  cflmd [global-options] put [--help] [--force] [--input=FILE | -i FILE] <url>',
    '',
    'Update and publish an existing Confluence page from a storage document.',
    '',
    'Command options:',
    '  --help           Show help for this command',
    '  --force          Upload even if the embedded page ID or version mismatches',
    '  --input=FILE     Read the storage document from FILE',
    '  -i FILE          Short form of --input',
    '',
    'Global options:',
    '  --user=USER      Use this user instead of ATLASSIAN_USER',
    '  --token=TOKEN    Use this token instead of ATLASSIAN_TOKEN',
    '',
    'Global options must appear before the subcommand.',
    '',
    'Input defaults to stdin when --input is not provided.',
    'By default the `.atl` metadata must match the target page ID and version.',
    '',
    'Arguments:',
    '  <url>            Confluence page URL to update and publish'
  ].join('\n');
}

export function formatPullHelp() {
  return [
    'Usage:',
    '  cflmd [global-options] pull [--help] [--manifest=FILE | --manifest FILE | -f FILE]',
    '',
    'Refresh Markdown files from Confluence using mappings from a `.cflmd` manifest.',
    'Each manifest entry behaves like `cflmd export --input <url> --output <file>`.',
    'Entries whose local file mtime is later than their metadata timestamp are skipped.',
    '',
    'Command options:',
    '  --help           Show help for this command',
    '  --manifest=FILE  Read manifest entries from FILE',
    '  --manifest FILE  Long form of --manifest with a separate value',
    '  -f FILE          Short form of --manifest',
    '',
    'When no manifest override is provided, pull reads `.cflmd` from the current directory.',
    '',
    'Global options:',
    '  --user=USER      Use this user instead of ATLASSIAN_USER',
    '  --token=TOKEN    Use this token instead of ATLASSIAN_TOKEN',
    '',
    'Global options must appear before the subcommand.',
    'Atlassian credentials are required for every pull entry.'
  ].join('\n');
}

export function formatPushHelp() {
  return [
    'Usage:',
    '  cflmd [global-options] push [--help] [--force] [--manifest=FILE | --manifest FILE | -f FILE]',
    '',
    'Refresh Confluence pages from Markdown using mappings from a `.cflmd` manifest.',
    'Each manifest entry behaves like `cflmd import --input <file> --output <url>`.',
    'Entries whose file mtime is not later than their metadata timestamp are skipped unless --force is used.',
    'After a successful publish, push rewrites the local metadata header with the next version and a fresh timestamp.',
    '',
    'Command options:',
    '  --help           Show help for this command',
    '  --force          Publish anyway when metadata checks would fail',
    '  --manifest=FILE  Read manifest entries from FILE',
    '  --manifest FILE  Long form of --manifest with a separate value',
    '  -f FILE          Short form of --manifest',
    '',
    'When no manifest override is provided, push reads `.cflmd` from the current directory.',
    '',
    'Global options:',
    '  --user=USER      Use this user instead of ATLASSIAN_USER',
    '  --token=TOKEN    Use this token instead of ATLASSIAN_TOKEN',
    '',
    'Global options must appear before the subcommand.',
    'Atlassian credentials are required for every push entry.'
  ].join('\n');
}
