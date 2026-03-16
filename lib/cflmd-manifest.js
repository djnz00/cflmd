import { readFile } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';

import { resolvePageEndpoint } from './confluence-api.js';

export async function readCflmdManifest({
  cwd = process.cwd(),
  manifest
} = {}) {
  const manifestPath = resolve(cwd, manifest ?? '.cflmd');
  const manifestDirectory = dirname(manifestPath);
  const text = await readManifestFile(manifestPath);
  const entries = [];
  const markdownPaths = new Set();
  const pageKeys = new Set();

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    if (!trimmedLine)
      continue;

    if (trimmedLine.startsWith('#'))
      continue;

    const separatorIndex = findSeparatorIndex(line);
    if (separatorIndex === -1)
      throw createManifestError({
        manifestPath,
        lineNumber,
        message: 'Expected `<markdown path>: <confluence URL>`.'
      });

    const rawMarkdownPath = line.slice(0, separatorIndex).trim();
    const pageUrl = line.slice(separatorIndex + 1).trim();

    if (!rawMarkdownPath) {
      throw createManifestError({
        manifestPath,
        lineNumber,
        message: 'Missing Markdown path before `:`.'
      });
    }

    if (!pageUrl) {
      throw createManifestError({
        manifestPath,
        lineNumber,
        message: 'Missing Confluence page URL after `:`.'
      });
    }

    if (rawMarkdownPath.includes(':')) {
      throw createManifestError({
        manifestPath,
        lineNumber,
        message: 'Markdown paths cannot contain `:`.'
      });
    }

    const markdownPath = normalize(resolve(manifestDirectory, rawMarkdownPath));
    const pageKey = readPageKey({
      lineNumber,
      manifestPath,
      pageUrl
    });

    if (markdownPaths.has(markdownPath)) {
      throw createManifestError({
        manifestPath,
        lineNumber,
        message: `Duplicate Markdown path: ${rawMarkdownPath}`
      });
    }

    if (pageKeys.has(pageKey)) {
      throw createManifestError({
        manifestPath,
        lineNumber,
        message: `Duplicate Confluence page URL: ${pageUrl}`
      });
    }

    markdownPaths.add(markdownPath);
    pageKeys.add(pageKey);
    entries.push({
      lineNumber,
      markdownPath,
      pageKey,
      pageUrl,
      rawMarkdownPath
    });
  }

  return {
    entries,
    manifestPath
  };
}

function createManifestError({ manifestPath, lineNumber, message }) {
  return new Error(`${manifestPath}:${lineNumber}: ${message}`);
}

function readPageKey({ lineNumber, manifestPath, pageUrl }) {
  try {
    const { pageId, sourceUrl } = resolvePageEndpoint(pageUrl);
    return `${sourceUrl.origin}:${pageId}`;
  } catch (error) {
    throw createManifestError({
      manifestPath,
      lineNumber,
      message: error.message
    });
  }
}

async function readManifestFile(manifestPath) {
  try {
    return await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT')
      throw new Error(`Manifest not found: ${manifestPath}`);

    throw error;
  }
}

function findSeparatorIndex(line) {
  const separatorMatch = line.match(/:\s*https?:\/\//);

  if (separatorMatch)
    return separatorMatch.index;

  return line.indexOf(':');
}
