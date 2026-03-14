export const CFLMD_TOC_COMMENT = '<!-- cflmd-toc -->';

const PRESERVED_TAG_COMMENT_PREFIXES = {
  'ac:link': 'cflmd-ac-link',
  'ac:structured-macro': 'cflmd-ac-structured-macro',
  'ac:task-list': 'cflmd-ac-task-list'
};

export function formatCflmdImageComment(metadata) {
  return `<!-- cflmd-image: ${JSON.stringify(metadata)} -->`;
}

export function formatCflmdPreservedTagComment(kind, metadata) {
  const prefix = PRESERVED_TAG_COMMENT_PREFIXES[kind];
  return prefix ? `<!-- ${prefix}: ${JSON.stringify(metadata)} -->` : '';
}

export function parsePreservedTagCommentMetadata(metadataText) {
  try {
    const metadata = JSON.parse(metadataText);
    const markup = pickString(metadata?.markup, metadata?.xmlBase64);

    if (!markup) {
      return null;
    }

    return {
      ...metadata,
      markup,
      text: pickString(metadata?.text, metadata?.visibleTextBase64) ?? ''
    };
  } catch {
    return null;
  }
}

export function getPreservedTagPlaceholderTag(block) {
  return block ? 'div' : 'span';
}

function pickString(...values) {
  return values.find((value) => typeof value === 'string');
}
