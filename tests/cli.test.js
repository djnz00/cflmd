import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { formatAtlDocument, parseAtlDocument } from '../lib/atl-document.js';
import {
  formatMarkdownDocument,
  parseMarkdownDocument
} from '../lib/markdown-document.js';
import { convertStorageToMarkdown } from '../lib/storage-to-markdown.js';
import { main } from '../lib/cli.js';
import { cliVersion } from '../lib/version.js';

const fixturesDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url));
const storageFixturePath = join(fixturesDirectory, 'storage-roundtrip-input.atl');
const expectedMarkdownFixturePath = join(fixturesDirectory, 'storage-roundtrip-expected.md');

function pageUrl(pageId) {
  return `https://example.atlassian.net/wiki/spaces/ENG/pages/${pageId}/Test+Page`;
}

function createWriter() {
  const chunks = [];

  return {
    text() {
      return chunks.join('');
    },
    writer: {
      write(chunk) {
        chunks.push(String(chunk));
        return true;
      }
    }
  };
}

describe('cflmd CLI', () => {
  it('prints abbreviated help when no command is provided', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: [],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain('Usage:');
    expect(stderr.text()).toContain('export');
    expect(stderr.text()).toContain('get <url>');
    expect(stderr.text()).toContain('import');
    expect(stderr.text()).toContain('put <url>');
  });

  it('prints root help with --help', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: ['--help'],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toContain('cflmd [global-options] <command> [command-options]');
    expect(stdout.text()).toContain('export');
    expect(stdout.text()).toContain('import');
    expect(stdout.text()).toContain('put <url>');
    expect(stdout.text()).toContain('--version, -v');
    expect(stdout.text()).toContain('--user=USER');
  });

  it('prints the current version with --version', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: ['--version'],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe(`${cliVersion}\n`);
  });

  it('prints the current version with -v', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: ['-v'],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe(`${cliVersion}\n`);
  });

  it('prints command-specific help for export --help', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: ['export', '--help'],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toContain(
      'cflmd export [--help] [--input=FILE|URL | -i FILE|URL] [--output=FILE | -o FILE]'
    );
    expect(stdout.text()).toContain('Confluence storage document (`.atl`)');
    expect(stdout.text()).toContain('Confluence page URL');
    expect(stdout.text()).toContain('top-of-file comments');
    expect(stdout.text()).toContain('Input defaults to stdin');
  });

  it('prints command-specific help for get --help', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: ['get', '--help'],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toContain('cflmd [global-options] get [--help] <url>');
    expect(stdout.text()).toContain('storage');
    expect(stdout.text()).toContain('Global options must appear before the subcommand.');
    expect(stdout.text()).toContain('--output=FILE');
    expect(stdout.text()).toContain('-o FILE');
  });

  it('prints command-specific help for import --help', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: ['import', '--help'],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toContain(
      'cflmd import [--help] [--force] [--input=FILE | -i FILE] [--output=FILE|URL | -o FILE|URL]'
    );
    expect(stdout.text()).toContain('Import Markdown and emit a Confluence storage document');
    expect(stdout.text()).toContain('Confluence page URL');
    expect(stdout.text()).toContain('Use --force to publish even when the Markdown metadata is missing or mismatched.');
    expect(stdout.text()).toContain('--force           Publish anyway when metadata checks would fail');
    expect(stdout.text()).toContain('Input defaults to stdin');
  });

  it('prints command-specific help for put --help', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: ['put', '--help'],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toContain(
      'cflmd [global-options] put [--help] [--force] [--input=FILE | -i FILE] <url>'
    );
    expect(stdout.text()).toContain('Update and publish an existing Confluence page');
    expect(stdout.text()).toContain('--force');
    expect(stdout.text()).toContain('Input defaults to stdin');
  });

  it('downloads the storage document body for get', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: '<p>Example storage body</p>'
            }
          },
          id: '12345',
          version: {
            number: 7
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    const exitCode = await main({
      argv: ['get', 'https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Test+Page'],
      env: {
        ATLASSIAN_TOKEN: 'env-token',
        ATLASSIAN_USER: 'engineer@example.com'
      },
      fetchImpl,
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe(
      formatAtlDocument({
        document: '<p>Example storage body</p>',
        pageId: '12345',
        versionNumber: 7
      })
    );

    const [requestUrl, requestInit] = fetchImpl.mock.calls[0];
    expect(requestUrl.href).toBe(
      'https://example.atlassian.net/wiki/api/v2/pages/12345?body-format=storage'
    );
    expect(requestInit.headers.Authorization).toBe(
      `Basic ${Buffer.from('engineer@example.com:env-token').toString('base64')}`
    );
    expect(requestInit.headers.Accept).toBe('application/json');
  });

  it('exports storage to markdown and writes it to stdout', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const expectedMarkdown = await readFile(expectedMarkdownFixturePath, 'utf8');

    const exitCode = await main({
      argv: ['export', '--input', storageFixturePath],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe(expectedMarkdown);
  });

  it('exports storage from stdin when no input file is specified', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const storage = await readFile(storageFixturePath, 'utf8');
    const expectedMarkdown = await readFile(expectedMarkdownFixturePath, 'utf8');

    const exitCode = await main({
      argv: ['export'],
      env: {},
      stdin: Readable.from([storage]),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe(expectedMarkdown);
  });

  it('exports storage fetched from a Confluence URL input', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const expectedMarkdown = await readFile(expectedMarkdownFixturePath, 'utf8');
    const { document, metadata } = parseAtlDocument(await readFile(storageFixturePath, 'utf8'));
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: document
            }
          },
          id: metadata.pageId,
          version: {
            number: metadata.versionNumber
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'export',
        '--input',
        pageUrl(metadata.pageId)
      ],
      env: {},
      fetchImpl,
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe(expectedMarkdown);
  });

  it('fails cleanly when export uses a URL input without Atlassian credentials', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: [
        'export',
        '--input',
        pageUrl('265021483')
      ],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain('Missing Atlassian user');
  });

  it('uses global credentials parsed before the subcommand', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: '<p>ok</p>'
            }
          },
          id: '67890',
          version: {
            number: 11
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    const exitCode = await main({
      argv: [
        '--user=root@example.com',
        '--token=root-token',
        'get',
        pageUrl('67890')
      ],
      env: {
        ATLASSIAN_TOKEN: 'env-token',
        ATLASSIAN_USER: 'env@example.com'
      },
      fetchImpl,
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);

    const [, requestInit] = fetchImpl.mock.calls[0];
    expect(requestInit.headers.Authorization).toBe(
      `Basic ${Buffer.from('root@example.com:root-token').toString('base64')}`
    );
  });

  it('writes the downloaded document to the requested output file', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-cli-'));
    const outputPath = join(tempDir, 'page.adf.json');
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: '<p>storage version 1</p>'
            }
          },
          id: '67890',
          version: {
            number: 1
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'get',
        '--output',
        outputPath,
        pageUrl('67890')
      ],
      env: {},
      fetchImpl,
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');
    await expect(readFile(outputPath, 'utf8')).resolves.toBe(
      formatAtlDocument({
        document: '<p>storage version 1</p>',
        pageId: '67890',
        versionNumber: 1
      })
    );
  });

  it('supports -o as a short output option', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-cli-'));
    const outputPath = join(tempDir, 'page.adf.json');
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: '<p>storage version 2</p>'
            }
          },
          id: '67890',
          version: {
            number: 2
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'get',
        '-o',
        outputPath,
        pageUrl('67890')
      ],
      env: {},
      fetchImpl,
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');
    await expect(readFile(outputPath, 'utf8')).resolves.toBe(
      formatAtlDocument({
        document: '<p>storage version 2</p>',
        pageId: '67890',
        versionNumber: 2
      })
    );
  });

  it('writes exported markdown to the requested output file', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-cli-'));
    const outputPath = join(tempDir, 'page.md');
    const expectedMarkdown = await readFile(expectedMarkdownFixturePath, 'utf8');

    const exitCode = await main({
      argv: ['export', '-i', storageFixturePath, '--output', outputPath],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');
    await expect(readFile(outputPath, 'utf8')).resolves.toBe(expectedMarkdown);
  });

  it('imports markdown to atl and writes it to stdout', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const markdownInput = await readFile(expectedMarkdownFixturePath, 'utf8');
    const { metadata } = parseMarkdownDocument(markdownInput);

    const exitCode = await main({
      argv: ['import', '--input', expectedMarkdownFixturePath],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');

    const { document: storage, metadata: atlMetadata } = parseAtlDocument(stdout.text());
    expect(atlMetadata).toEqual(metadata);
    expect(
      formatMarkdownDocument({
        markdown: convertStorageToMarkdown(storage),
        pageId: atlMetadata.pageId,
        versionNumber: atlMetadata.versionNumber
      })
    ).toBe(markdownInput);
  });

  it('imports markdown from stdin when no input file is specified', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const markdownInput = await readFile(expectedMarkdownFixturePath, 'utf8');
    const { metadata } = parseMarkdownDocument(markdownInput);

    const exitCode = await main({
      argv: ['import'],
      env: {},
      stdin: Readable.from([markdownInput]),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');

    const { document: storage, metadata: atlMetadata } = parseAtlDocument(stdout.text());
    expect(atlMetadata).toEqual(metadata);
    expect(
      formatMarkdownDocument({
        markdown: convertStorageToMarkdown(storage),
        pageId: atlMetadata.pageId,
        versionNumber: atlMetadata.versionNumber
      })
    ).toBe(markdownInput);
  });

  it('writes imported atl to the requested output file', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-cli-'));
    const outputPath = join(tempDir, 'page.atl');
    const markdownInput = await readFile(expectedMarkdownFixturePath, 'utf8');
    const { metadata } = parseMarkdownDocument(markdownInput);

    const exitCode = await main({
      argv: ['import', '--input', expectedMarkdownFixturePath, '--output', outputPath],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');

    const atlOutput = await readFile(outputPath, 'utf8');
    const { document: storage, metadata: atlMetadata } = parseAtlDocument(atlOutput);
    expect(atlMetadata).toEqual(metadata);
    expect(
      formatMarkdownDocument({
        markdown: convertStorageToMarkdown(storage),
        pageId: atlMetadata.pageId,
        versionNumber: atlMetadata.versionNumber
      })
    ).toBe(markdownInput);
  });

  it('publishes imported atl directly to a Confluence URL output', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const markdownInput = await readFile(expectedMarkdownFixturePath, 'utf8');
    const { metadata } = parseMarkdownDocument(markdownInput);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              storage: {
                value: '<p>current storage</p>'
              }
            },
            id: metadata.pageId,
            title: 'Existing Page',
            version: {
              number: metadata.versionNumber
            }
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: metadata.pageId }), {
          headers: { 'content-type': 'application/json' },
          status: 200
        })
      );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'import',
        '--input',
        expectedMarkdownFixturePath,
        '--output',
        pageUrl(metadata.pageId)
      ],
      env: {},
      fetchImpl,
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [requestUrl, requestInit] = fetchImpl.mock.calls[1];
    expect(requestUrl.href).toBe(`https://example.atlassian.net/wiki/api/v2/pages/${metadata.pageId}`);
    expect(requestInit.method).toBe('PUT');

    const publishedStorage = JSON.parse(requestInit.body).body.storage.value;
    expect(
      formatMarkdownDocument({
        markdown: convertStorageToMarkdown(publishedStorage),
        pageId: metadata.pageId,
        versionNumber: metadata.versionNumber
      })
    ).toBe(markdownInput);
  });

  it('publishes exported attachment embeds back as Confluence attachments', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const markdownInput = [
      '<!-- cflmd-metadata: {"pageId":"6839074845","version":{"number":5}} -->',
      '',
      '# Logging Pipeline',
      '',
      '## Architecture',
      '',
      '[[image-20260312-111304.png]]',
      ''
    ].join('\n');
    const { metadata } = parseMarkdownDocument(markdownInput);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              storage: {
                value: '<p>current storage</p>'
              }
            },
            id: metadata.pageId,
            title: 'Logging Pipeline',
            version: {
              number: metadata.versionNumber
            }
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: metadata.pageId }), {
          headers: { 'content-type': 'application/json' },
          status: 200
        })
      );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'import',
        '--output',
        pageUrl(metadata.pageId)
      ],
      env: {},
      fetchImpl,
      stdin: Readable.from([markdownInput]),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');

    const [, requestInit] = fetchImpl.mock.calls[1];
    const publishedStorage = JSON.parse(requestInit.body).body.storage.value;

    expect(publishedStorage).toContain(
      '<ri:attachment ri:filename="image-20260312-111304.png"></ri:attachment>'
    );
    expect(
      formatMarkdownDocument({
        markdown: convertStorageToMarkdown(publishedStorage),
        pageId: metadata.pageId,
        versionNumber: metadata.versionNumber
      })
    ).toBe(markdownInput);
  });

  it('fails cleanly when import uses a URL output without Atlassian credentials', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: [
        'import',
        '--input',
        expectedMarkdownFixturePath,
        '--output',
        pageUrl('265021483')
      ],
      env: {},
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain('Missing Atlassian user');
  });

  it('rejects direct import publish when the Markdown input lacks metadata comments', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi.fn();

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'import',
        '--output',
        pageUrl('265021483')
      ],
      env: {},
      fetchImpl,
      stdin: Readable.from(['# Logging Pipeline TODO\n']),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain(
      'Input Markdown is missing page metadata. Use --force to publish anyway.'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('publishes direct import with --force when the Markdown input lacks metadata comments', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              storage: {
                value: '<p>old storage</p>'
              }
            },
            id: '265021483',
            title: 'Existing Page',
            version: {
              number: 4
            }
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: '265021483' }), {
          headers: { 'content-type': 'application/json' },
          status: 200
        })
      );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'import',
        '--force',
        '--output',
        pageUrl('265021483')
      ],
      env: {},
      fetchImpl,
      stdin: Readable.from(['# Logging Pipeline TODO\n']),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toBe('');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [requestUrl, requestInit] = fetchImpl.mock.calls[1];
    expect(requestUrl.href).toBe('https://example.atlassian.net/wiki/api/v2/pages/265021483');
    expect(requestInit.method).toBe('PUT');
    expect(JSON.parse(requestInit.body).body.storage.value).toContain('<h1>Logging Pipeline TODO</h1>');
  });

  it('publishes storage from an input file with put', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const storageInput = await readFile(storageFixturePath, 'utf8');
    const { document: storage, metadata } = parseAtlDocument(storageInput);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              storage: {
              value: '<p>old storage</p>'
            }
          },
            id: metadata.pageId,
            title: 'Existing Page',
            version: {
              number: metadata.versionNumber
            }
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: metadata.pageId }), {
          headers: { 'content-type': 'application/json' },
          status: 200
        })
      );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'put',
        '--input',
        storageFixturePath,
        pageUrl(metadata.pageId)
      ],
      env: {},
      fetchImpl,
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [requestUrl, requestInit] = fetchImpl.mock.calls[1];
    expect(requestUrl.href).toBe(`https://example.atlassian.net/wiki/api/v2/pages/${metadata.pageId}`);
    expect(requestInit.method).toBe('PUT');
    expect(requestInit.headers.Authorization).toBe(
      `Basic ${Buffer.from('engineer@example.com:env-token').toString('base64')}`
    );
    expect(JSON.parse(requestInit.body)).toEqual({
      body: {
        storage: {
          representation: 'storage',
          value: storage
        }
      },
      id: metadata.pageId,
      status: 'current',
      title: 'Existing Page',
      version: {
        number: metadata.versionNumber + 1
      }
    });
  });

  it('publishes storage from stdin when put has no input file', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              storage: {
                value: '<p>old storage</p>'
              }
            },
            id: '67890',
            title: 'Existing Page',
            version: {
              number: 10
            }
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: '67890' }), {
          headers: { 'content-type': 'application/json' },
          status: 200
        })
      );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'put',
        pageUrl('67890')
      ],
      env: {},
      fetchImpl,
      stdin: Readable.from([
        formatAtlDocument({
          document: '<p>stdin storage</p>',
          pageId: '67890',
          versionNumber: 10
        })
      ]),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');

    const [, requestInit] = fetchImpl.mock.calls[1];
    expect(JSON.parse(requestInit.body).body.storage.value).toBe('<p>stdin storage</p>');
  });

  it('rejects put when the embedded page ID does not match the target page', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fixtureInput = await readFile(storageFixturePath, 'utf8');
    const { metadata } = parseAtlDocument(fixtureInput);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: '<p>old storage</p>'
            }
          },
          id: metadata.pageId,
          title: 'Existing Page',
          version: {
            number: metadata.versionNumber
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'put',
        pageUrl(metadata.pageId)
      ],
      env: {},
      fetchImpl,
      stdin: Readable.from([
        formatAtlDocument({
          document: '<p>stdin storage</p>',
          pageId: '11111',
          versionNumber: metadata.versionNumber
        })
      ]),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain(
      `Input .atl page ID 11111 does not match target page ${metadata.pageId}.`
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects put when the embedded version does not match the current page version', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fixtureInput = await readFile(storageFixturePath, 'utf8');
    const { metadata } = parseAtlDocument(fixtureInput);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: '<p>old storage</p>'
            }
          },
          id: metadata.pageId,
          title: 'Existing Page',
          version: {
            number: metadata.versionNumber + 1
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'put',
        pageUrl(metadata.pageId)
      ],
      env: {},
      fetchImpl,
      stdin: Readable.from([
        formatAtlDocument({
          document: '<p>stdin storage</p>',
          pageId: metadata.pageId,
          versionNumber: metadata.versionNumber
        })
      ]),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain(
      `Input .atl version ${metadata.versionNumber} does not match current page version ${metadata.versionNumber + 1}.`
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uploads with put --force even when the embedded metadata mismatches', async () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              storage: {
                value: '<p>old storage</p>'
              }
            },
            id: '67890',
            title: 'Existing Page',
            version: {
              number: 6
            }
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: '67890' }), {
          headers: { 'content-type': 'application/json' },
          status: 200
        })
      );

    const exitCode = await main({
      argv: [
        '--user=engineer@example.com',
        '--token=env-token',
        'put',
        '--force',
        pageUrl('67890')
      ],
      env: {},
      fetchImpl,
      stdin: Readable.from([
        formatAtlDocument({
          document: '<p>stdin storage</p>',
          pageId: '11111',
          versionNumber: 1
        })
      ]),
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe('');
    expect(stdout.text()).toBe('');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [, requestInit] = fetchImpl.mock.calls[1];
    expect(JSON.parse(requestInit.body)).toMatchObject({
      body: {
        storage: {
          value: '<p>stdin storage</p>'
        }
      },
      id: '67890',
      version: {
        number: 7
      }
    });
  });

  it('fails cleanly when the Atlassian user is missing', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: ['get', pageUrl('67890')],
      env: { ATLASSIAN_TOKEN: 'env-token' },
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain('Missing Atlassian user');
  });

  it('rejects global options that appear after the subcommand', async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const exitCode = await main({
      argv: [
        'get',
        '--user=command@example.com',
        pageUrl('67890')
      ],
      env: { ATLASSIAN_TOKEN: 'env-token' },
      stderr: stderr.writer,
      stdout: stdout.writer
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain('Global option --user must appear before the subcommand.');
  });
});
