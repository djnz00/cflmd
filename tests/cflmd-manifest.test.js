import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { readCflmdManifest } from '../lib/cflmd-manifest.js';

function pageUrl(pageId, title = 'Test+Page') {
  return `https://example.atlassian.net/wiki/spaces/ENG/pages/${pageId}/${title}`;
}

describe('readCflmdManifest', () => {
  it('reads the default .cflmd from the current working directory', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-manifest-'));
    const manifestPath = join(tempDir, '.cflmd');

    await writeFile(
      manifestPath,
      [
        '   # tracked pages',
        '',
        `docs/one.md: ${pageUrl('12345')}`,
        `docs/two.md: ${pageUrl('67890')}`
      ].join('\r\n')
    );

    const result = await readCflmdManifest({
      cwd: tempDir
    });

    expect(result.manifestPath).toBe(manifestPath);
    expect(result.entries).toEqual([
      {
        lineNumber: 3,
        markdownPath: join(tempDir, 'docs', 'one.md'),
        pageKey: 'https://example.atlassian.net:12345',
        pageUrl: pageUrl('12345'),
        rawMarkdownPath: 'docs/one.md'
      },
      {
        lineNumber: 4,
        markdownPath: join(tempDir, 'docs', 'two.md'),
        pageKey: 'https://example.atlassian.net:67890',
        pageUrl: pageUrl('67890'),
        rawMarkdownPath: 'docs/two.md'
      }
    ]);
  });

  it('resolves manifest overrides relative to the current working directory', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-manifest-'));
    const manifestDirectory = join(tempDir, 'config');

    await mkdir(manifestDirectory, { recursive: true });
    await writeFile(
      join(manifestDirectory, 'pages.cflmd'),
      `docs/page.md: ${pageUrl('12345')}\n`
    );

    const result = await readCflmdManifest({
      cwd: tempDir,
      manifest: 'config/pages.cflmd'
    });

    expect(result.manifestPath).toBe(join(manifestDirectory, 'pages.cflmd'));
    expect(result.entries[0]).toMatchObject({
      markdownPath: join(manifestDirectory, 'docs', 'page.md'),
      rawMarkdownPath: 'docs/page.md'
    });
  });

  it('fails when the manifest file does not exist', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-manifest-'));

    await expect(
      readCflmdManifest({
        cwd: tempDir
      })
    ).rejects.toThrow(`Manifest not found: ${join(tempDir, '.cflmd')}`);
  });

  it('reports malformed lines with the manifest path and line number', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-manifest-'));
    const manifestPath = join(tempDir, '.cflmd');

    await writeFile(
      manifestPath,
      [
        `docs/one.md: ${pageUrl('12345')}`,
        'docs/two.md'
      ].join('\n')
    );

    await expect(
      readCflmdManifest({
        cwd: tempDir
      })
    ).rejects.toThrow(`${manifestPath}:2: Expected \`<markdown path>: <confluence URL>\`.`);
  });

  it('rejects Markdown paths that contain a literal colon', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-manifest-'));

    await writeFile(
      join(tempDir, '.cflmd'),
      `docs:page.md: ${pageUrl('12345')}\n`
    );

    await expect(
      readCflmdManifest({
        cwd: tempDir
      })
    ).rejects.toThrow('Markdown paths cannot contain `:`.');
  });

  it('rejects duplicate Markdown paths after manifest-directory resolution', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-manifest-'));

    await writeFile(
      join(tempDir, '.cflmd'),
      [
        `docs/page.md: ${pageUrl('12345')}`,
        `./docs/page.md: ${pageUrl('67890')}`
      ].join('\n')
    );

    await expect(
      readCflmdManifest({
        cwd: tempDir
      })
    ).rejects.toThrow('Duplicate Markdown path: ./docs/page.md');
  });

  it('rejects duplicate remote targets even when their URLs differ textually', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-manifest-'));

    await writeFile(
      join(tempDir, '.cflmd'),
      [
        `docs/one.md: ${pageUrl('12345', 'First+Title')}`,
        `docs/two.md: ${pageUrl('12345', 'Second+Title')}`
      ].join('\n')
    );

    await expect(
      readCflmdManifest({
        cwd: tempDir
      })
    ).rejects.toThrow(`Duplicate Confluence page URL: ${pageUrl('12345', 'Second+Title')}`);
  });

  it('rejects unsupported Confluence page URLs using the shared page resolver', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-manifest-'));

    await writeFile(
      join(tempDir, '.cflmd'),
      'docs/page.md: https://example.atlassian.net/wiki/pages/viewpage.action?pageId=12345\n'
    );

    await expect(
      readCflmdManifest({
        cwd: tempDir
      })
    ).rejects.toThrow('Could not determine a Confluence page ID');
  });
});
