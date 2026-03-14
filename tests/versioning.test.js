import { describe, expect, it } from 'vitest';

import { nextVersion } from '../scripts/versioning.mjs';

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
});
