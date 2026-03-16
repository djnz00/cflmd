import { describe, expect, it, vi } from 'vitest';

import {
  createVersionTime,
  formatMetadataComment,
  normalizeMetadata,
  parseLeadingMetadataComment
} from '../lib/confluence-metadata.js';

describe('createVersionTime', () => {
  it('rounds up to the next UTC second', () => {
    expect(createVersionTime(new Date('2026-03-16T16:50:21.321Z').valueOf())).toBe(
      '2026-03-16T16:50:22Z'
    );
  });
});

describe('formatMetadataComment', () => {
  it('includes version.time by default', () => {
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-03-16T16:50:21.321Z').valueOf());

    try {
      expect(formatMetadataComment({ pageId: '6847529106', versionNumber: 3 })).toBe(
        '<!-- cflmd-metadata: {"pageId":"6847529106","version":{"number":3,"time":"2026-03-16T16:50:22Z"}} -->'
      );
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe('parseLeadingMetadataComment', () => {
  it('parses version.time from the leading metadata comment', () => {
    expect(
      parseLeadingMetadataComment(
        '<!-- cflmd-metadata: {"pageId":"6847529106","version":{"number":3,"time":"2026-03-16T16:50:22Z"}} -->\n<body />',
        { invalidMessage: 'Invalid metadata.' }
      )
    ).toEqual({
      metadata: {
        pageId: '6847529106',
        versionNumber: 3,
        versionTime: '2026-03-16T16:50:22Z'
      },
      text: '<body />'
    });
  });

  it('continues to accept legacy metadata without version.time', () => {
    expect(
      parseLeadingMetadataComment(
        '<!-- cflmd-metadata: {"pageId":"6847529106","version":{"number":3}} -->\n<body />',
        { invalidMessage: 'Invalid metadata.' }
      )
    ).toEqual({
      metadata: {
        pageId: '6847529106',
        versionNumber: 3
      },
      text: '<body />'
    });
  });
});

describe('normalizeMetadata', () => {
  it('rejects version.time values that are not second-precision UTC timestamps', () => {
    expect(() =>
      normalizeMetadata({
        pageId: '6847529106',
        versionNumber: 3,
        versionTime: '2026-03-16T16:50:22.000Z'
      })
    ).toThrow('Confluence page metadata is missing a valid version.time.');
  });
});
