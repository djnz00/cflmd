import { describe, expect, it, vi } from 'vitest';

import { formatAtlDocument } from '../lib/atl-document.js';
import {
  fetchAtlDocument,
  resolvePageEndpoint,
  updateNativeDocument
} from '../lib/confluence-api.js';

function pageUrl(pageId) {
  return `https://example.atlassian.net/wiki/spaces/ENG/pages/${pageId}/Test+Page`;
}

describe('resolvePageEndpoint', () => {
  it('builds the v2 endpoint from a standard Confluence Cloud page URL', () => {
    const { apiUrl, pageId } = resolvePageEndpoint(pageUrl('12345'));

    expect(pageId).toBe('12345');
    expect(apiUrl.href).toBe(
      'https://example.atlassian.net/wiki/api/v2/pages/12345?body-format=storage'
    );
  });

  it('rejects URLs without an identifiable page ID', () => {
    expect(() =>
      resolvePageEndpoint('https://example.atlassian.net/wiki/spaces/ENG/overview')
    ).toThrow('Could not determine a Confluence page ID');
  });

  it('rejects older query-based page URLs', () => {
    expect(() =>
      resolvePageEndpoint('https://example.atlassian.net/wiki/pages/viewpage.action?pageId=67890')
    ).toThrow('Could not determine a Confluence page ID');
  });
});

describe('updateNativeDocument', () => {
  it('fetches the current page and publishes the next storage version', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              storage: {
                value: '<p>existing storage</p>'
              }
            },
            id: '12345',
            title: 'Test Page',
            version: {
              number: 7
            }
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: '12345' }), {
          headers: { 'content-type': 'application/json' },
          status: 200
        })
      );

    await updateNativeDocument({
      document: formatAtlDocument({
        document: '<p>updated storage</p>',
        pageId: '12345',
        versionNumber: 7
      }),
      fetchImpl,
      pageUrl: pageUrl('12345'),
      token: 'api-token',
      user: 'engineer@example.com'
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [getUrl, getInit] = fetchImpl.mock.calls[0];
    expect(getUrl.href).toBe(
      'https://example.atlassian.net/wiki/api/v2/pages/12345?body-format=storage'
    );
    expect(getInit.method).toBe('GET');

    const [putUrl, putInit] = fetchImpl.mock.calls[1];
    expect(putUrl.href).toBe('https://example.atlassian.net/wiki/api/v2/pages/12345');
    expect(putInit.method).toBe('PUT');
    expect(putInit.headers.Authorization).toBe(
      `Basic ${Buffer.from('engineer@example.com:api-token').toString('base64')}`
    );

    expect(JSON.parse(putInit.body)).toEqual({
      body: {
        storage: {
          representation: 'storage',
          value: '<p>updated storage</p>'
        }
      },
      id: '12345',
      status: 'current',
      title: 'Test Page',
      version: {
        number: 8
      }
    });
  });

  it('rejects updates when embedded metadata does not match the current page version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: '<p>existing storage</p>'
            }
          },
          id: '12345',
          title: 'Test Page',
          version: {
            number: 8
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    await expect(
      updateNativeDocument({
        document: formatAtlDocument({
          document: '<p>updated storage</p>',
          pageId: '12345',
          versionNumber: 7
        }),
        fetchImpl,
        pageUrl: pageUrl('12345'),
        token: 'api-token',
        user: 'engineer@example.com'
      })
    ).rejects.toThrow('Input .atl version 7 does not match current page version 8.');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAtlDocument', () => {
  it('wraps fetched storage in atl metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: {
            storage: {
              value: '<p>example storage</p>'
            }
          },
          id: '12345',
          version: {
            number: 9
          }
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    );

    const result = await fetchAtlDocument({
      fetchImpl,
      pageUrl: pageUrl('12345'),
      token: 'api-token',
      user: 'engineer@example.com'
    });

    expect(result.metadata).toEqual({
      pageId: '12345',
      versionNumber: 9
    });
    expect(result.atl).toBe(
      formatAtlDocument({
        document: '<p>example storage</p>',
        pageId: '12345',
        versionNumber: 9
      })
    );
  });

  it('surfaces structured API errors instead of coercing them to [object Object]', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [
            {
              code: 'NOT_FOUND',
              title: 'Not Found',
              detail: null,
              status: 404
            }
          ]
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 404,
          statusText: 'Not Found'
        }
      )
    );

    await expect(
      fetchAtlDocument({
        fetchImpl,
        pageUrl: pageUrl('12345'),
        token: 'api-token',
        user: 'engineer@example.com'
      })
    ).rejects.toThrow(
      'Confluence API request failed for page 12345: 404 Not Found: NOT_FOUND: Not Found'
    );
  });
});
