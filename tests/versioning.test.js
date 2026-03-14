import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  formatVersionModule,
  nextVersion,
  writeReleaseVersion
} from '../scripts/versioning.mjs';

describe('nextVersion', () => {
  it('bumps patch releases', () => {
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1');
  });

  it('bumps minor releases and resets the patch number', () => {
    expect(nextVersion('0.1.1', 'minor')).toBe('0.2.0');
  });

  it('bumps major releases and resets minor and patch numbers', () => {
    expect(nextVersion('0.1.2', 'major')).toBe('1.0.0');
  });

  it('rejects invalid semantic versions', () => {
    expect(() => nextVersion('1.2', 'patch')).toThrow('Invalid semantic version');
  });

  it('rejects unknown release types', () => {
    expect(() => nextVersion('1.2.3', 'build')).toThrow('Unsupported release type');
  });

  it('formats the CLI version module source', () => {
    expect(formatVersionModule('1.2.3')).toBe("export const cliVersion = '1.2.3';\n");
  });

  it('writes the package version and CLI version module together', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cflmd-versioning-'));
    const packagePath = join(tempDir, 'package.json');
    const versionModulePath = join(tempDir, 'version.js');

    await writeFile(
      packagePath,
      `${JSON.stringify(
        {
          name: 'cflmd',
          version: '1.0.1'
        },
        null,
        2
      )}\n`
    );

    await writeReleaseVersion(packagePath, versionModulePath, '1.1.0');

    expect(JSON.parse(await readFile(packagePath, 'utf8')).version).toBe('1.1.0');
    expect(await readFile(versionModulePath, 'utf8')).toBe(
      "export const cliVersion = '1.1.0';\n"
    );
  });
});
