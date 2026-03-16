import {
  formatMetadataComment,
  parseLeadingMetadataComment
} from './confluence-metadata.js';

export function formatMarkdownDocument({ markdown, pageId, versionNumber, versionTime }) {
  return [
    formatMetadataComment({ pageId, versionNumber, versionTime }),
    '',
    markdown
  ].join('\n');
}

export function parseMarkdownDocument(text) {
  const parsed = parseLeadingMetadataComment(text, {
    invalidMessage: 'Invalid page metadata comments in the Markdown document.'
  });

  return {
    markdown: parsed.metadata ? stripLeadingBlankLine(parsed.text) : parsed.text,
    metadata: parsed.metadata
  };
}

function stripLeadingBlankLine(text) {
  return text.replace(/^\r?\n/, '');
}
