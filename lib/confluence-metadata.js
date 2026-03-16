const METADATA_PREFIX = '<!-- cflmd-metadata:';
const LEADING_METADATA_COMMENT_PATTERN =
  /^<!--\s*cflmd-metadata:\s*([\s\S]*?)\s*-->\r?\n?/;
const VERSION_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function formatMetadataComment({
  pageId,
  versionNumber,
  versionTime = createVersionTime()
}) {
  const metadata = normalizeMetadata({ pageId, versionNumber, versionTime });

  return `${METADATA_PREFIX} ${JSON.stringify({
    pageId: metadata.pageId,
    version: {
      number: metadata.versionNumber,
      time: metadata.versionTime
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
      versionNumber: parsed?.version?.number,
      versionTime: parsed?.version?.time
    }),
    text: text.slice(match[0].length)
  };
}

export function normalizeMetadata({ pageId, versionNumber, versionTime }) {
  const metadata = {
    pageId: normalizePageId(pageId),
    versionNumber: normalizeVersionNumber(versionNumber)
  };

  const normalizedVersionTime = normalizeVersionTime(versionTime);
  if (normalizedVersionTime) {
    metadata.versionTime = normalizedVersionTime;
  }

  return metadata;
}

export function createVersionTime(now_ = Date.now()) {
  return new Date(Math.floor(now_ / 1000) * 1000 + 1000).toISOString().replace('.000Z', 'Z');
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

function normalizeVersionTime(versionTime) {
  if (versionTime == null) {
    return null;
  }

  if (typeof versionTime !== 'string' || !VERSION_TIME_PATTERN.test(versionTime)) {
    throw new Error('Confluence page metadata is missing a valid version.time.');
  }

  const parsedTime = Date.parse(versionTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error('Confluence page metadata is missing a valid version.time.');
  }

  return versionTime;
}
