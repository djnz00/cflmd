import { formatAtlDocument, parseAtlDocument } from './atl-document.js';
import { createVersionTime, normalizeMetadata } from './confluence-metadata.js';

const BODY_FORMAT = 'storage';

export function resolvePageEndpoint(pageUrl) {
  let sourceUrl;

  try {
    sourceUrl = new URL(pageUrl);
  } catch {
    throw new Error(`Invalid Confluence page URL: ${pageUrl}`);
  }

  const pageId = extractPageId(sourceUrl);
  if (!pageId) {
    throw new Error(`Could not determine a Confluence page ID from URL: ${pageUrl}`);
  }

  const apiBaseUrl = inferApiBaseUrl(sourceUrl);
  const apiUrl = new URL(`pages/${pageId}`, apiBaseUrl);
  apiUrl.searchParams.set('body-format', BODY_FORMAT);

  return { apiUrl, pageId, sourceUrl };
}

export async function fetchNativeDocument({
  fetchImpl = globalThis.fetch,
  pageUrl,
  user,
  token
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is unavailable in this Node.js runtime.');
  }

  const { apiUrl, pageId } = resolvePageEndpoint(pageUrl);
  const response = await fetchImpl(apiUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: buildBasicAuthorizationHeader(user, token)
    },
    method: 'GET'
  });

  if (!response.ok) {
    throw new Error(await buildApiError(response, pageId));
  }

  const payload = await response.json();
  const document = payload?.body?.[BODY_FORMAT]?.value;

  if (typeof document !== 'string') {
    throw new Error(
      `Confluence page ${pageId} did not include body.${BODY_FORMAT}.value in the API response.`
    );
  }

  return { apiUrl, document, pageId, payload };
}

export async function fetchAtlDocument({
  fetchImpl = globalThis.fetch,
  pageUrl,
  token,
  user
}) {
  const { document, pageId, payload } = await fetchNativeDocument({
    fetchImpl,
    pageUrl,
    token,
    user
  });
  const versionNumber = payload?.version?.number;

  if (typeof versionNumber !== 'number') {
    throw new Error(`Confluence page ${pageId} did not include version.number in the API response.`);
  }

  const versionTime = createVersionTime();
  const metadata = normalizeMetadata({
    pageId: payload?.id ?? pageId,
    versionNumber,
    versionTime
  });

  return {
    atl: formatAtlDocument({
      document,
      pageId: metadata.pageId,
      versionNumber: metadata.versionNumber,
      versionTime: metadata.versionTime
    }),
    document,
    metadata,
    pageId,
    payload
  };
}

export async function updateNativeDocument({
  document,
  fetchImpl = globalThis.fetch,
  force = false,
  pageUrl,
  token,
  user
}) {
  const { apiUrl, pageId, payload } = await fetchNativeDocument({
    fetchImpl,
    pageUrl,
    token,
    user
  });

  const updateUrl = new URL(apiUrl);
  updateUrl.search = '';

  const currentVersion = payload?.version?.number;
  if (typeof currentVersion !== 'number') {
    throw new Error(`Confluence page ${pageId} did not include version.number in the API response.`);
  }

  const currentPageId = String(payload?.id ?? pageId);

  if (typeof payload?.title !== 'string' || !payload.title) {
    throw new Error(`Confluence page ${pageId} did not include title in the API response.`);
  }

  const { document: storageDocument, metadata } = parseAtlDocument(document);

  if (!force) {
    if (!metadata) {
      throw new Error(
        'Input .atl document is missing page metadata. Re-run `cflmd get` or use --force.'
      );
    }

    if (metadata.pageId !== currentPageId) {
      throw new Error(
        `Input .atl page ID ${metadata.pageId} does not match target page ${currentPageId}. Use --force to override.`
      );
    }

    if (metadata.versionNumber !== currentVersion) {
      throw new Error(
        `Input .atl version ${metadata.versionNumber} does not match current page version ${currentVersion}. Use --force to override.`
      );
    }
  }

  const response = await fetchImpl(updateUrl, {
    body: JSON.stringify({
      body: {
        storage: {
          representation: BODY_FORMAT,
          value: storageDocument
        }
      },
      id: currentPageId,
      status: 'current',
      title: payload.title,
      version: {
        number: currentVersion + 1
      }
    }),
    headers: {
      Accept: 'application/json',
      Authorization: buildBasicAuthorizationHeader(user, token),
      'Content-Type': 'application/json'
    },
    method: 'PUT'
  });

  if (!response.ok) {
    throw new Error(await buildApiError(response, pageId));
  }

  return response.json();
}

function extractPageId(url) {
  const match = url.pathname.match(/\/pages\/(\d+)(?:[/?#]|$)/);
  return match?.[1];
}

function inferApiBaseUrl(sourceUrl) {
  const basePath =
    sourceUrl.pathname === '/wiki' || sourceUrl.pathname.startsWith('/wiki/')
      ? '/wiki/api/v2/'
      : '/api/v2/';

  return new URL(basePath, sourceUrl);
}

async function buildApiError(response, pageId) {
  const prefix = `Confluence API request failed for page ${pageId}: ${response.status} ${response.statusText}`;
  const bodyText = await response.text();

  if (!bodyText) {
    return prefix;
  }

  try {
    const body = JSON.parse(bodyText);
    const message =
      body.message ??
      body.errorMessage ??
      body.detail ??
      body.title ??
      formatApiErrors(body.errors);

    if (message) {
      return `${prefix}: ${message}`;
    }
  } catch {
    return `${prefix}: ${bodyText.trim()}`;
  }

  return prefix;
}

function formatApiErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }

  const formattedErrors = errors
    .map((error) => {
      if (typeof error === 'string') {
        return error;
      }

      if (!error || typeof error !== 'object') {
        return null;
      }

      const parts = [error.code, error.title, error.detail].filter(Boolean);
      return parts.length > 0 ? parts.join(': ') : null;
    })
    .filter(Boolean);

  return formattedErrors.length > 0 ? formattedErrors.join(', ') : null;
}

function buildBasicAuthorizationHeader(user, token) {
  const credentials = Buffer.from(`${user}:${token}`).toString('base64');
  return `Basic ${credentials}`;
}
