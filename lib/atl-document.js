import {
  formatMetadataComment,
  parseLeadingMetadataComment
} from './confluence-metadata.js';

export function formatAtlDocument({ document, pageId, versionNumber }) {
  return `${formatMetadataComment({ pageId, versionNumber })}\n${document}`;
}

export function parseAtlDocument(text) {
  const parsed = parseLeadingMetadataComment(text, {
    invalidMessage: 'Invalid page metadata header in the .atl document.'
  });

  return {
    document: parsed.text,
    metadata: parsed.metadata
  };
}
