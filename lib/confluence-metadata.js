const METADATA_PREFIX = '<!-- cflmd-metadata:';
const LEADING_METADATA_COMMENT_PATTERN =
  /^<!--\s*cflmd-metadata:\s*([\s\S]*?)\s*-->\r?\n?/;

export function formatMetadataComment({ pageId, versionNumber }) {
  const metadata = normalizeMetadata({ pageId, versionNumber });

  return `${METADATA_PREFIX} ${JSON.stringify({
    pageId: metadata.pageId,
    version: {
      number: metadata.versionNumber
    }
  })} -->`;
}

export function parseLeadingMetadataComment(text, { invalidMessage }) {
  const match = text.match(LEADING_METADATA_COMMENT_PATTERN);

  if (!match) {
    return {
      metadata: null,
      text
    };
  }

  let parsed;

  try {
    parsed = JSON.parse(match[1]);
  } catch {
    throw new Error(invalidMessage);
  }

  return {
    metadata: normalizeMetadata({
      pageId: parsed?.pageId,
      versionNumber: parsed?.version?.number
    }),
    text: text.slice(match[0].length)
  };
}

export function normalizeMetadata({ pageId, versionNumber }) {
  return {
    pageId: normalizePageId(pageId),
    versionNumber: normalizeVersionNumber(versionNumber)
  };
}

function normalizePageId(pageId) {
  if (typeof pageId === 'number' && Number.isFinite(pageId)) {
    return String(pageId);
  }

  if (typeof pageId === 'string' && pageId.length > 0) {
    return pageId;
  }

  throw new Error('Confluence page metadata is missing a valid pageId.');
}

function normalizeVersionNumber(versionNumber) {
  if (typeof versionNumber === 'number' && Number.isFinite(versionNumber)) {
    return versionNumber;
  }

  throw new Error('Confluence page metadata is missing a valid version.number.');
}
