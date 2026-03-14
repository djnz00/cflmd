import { load } from 'cheerio';
import TurndownService from 'turndown';

import {
  CFLMD_TOC_COMMENT,
  formatCflmdImageComment,
  formatCflmdPreservedTagComment,
  getPreservedTagPlaceholderTag
} from './cflmd-comment-utils.js';
import {
  decodeBase64,
  encodeBase64,
  escapeHtml,
  escapeHtmlAttribute,
  renderAttributeMap
} from './markup-utils.js';

const PRESERVED_TAG_SENTINEL = 'cflmd-preserved';
const TASK_LIST_SENTINEL = 'cflmd-task-list';
const HTML_COMMENT_SENTINEL = 'cflmd-html-comment';
const HTML_VOID_ELEMENTS = new Set(['br', 'col', 'hr', 'img']);

export function convertStorageToMarkdown(storage) {
  return normalizeMarkdown(createTurndownService().turndown(preprocessStorage(storage)));
}

function preprocessStorage(storage) {
  const $ = load(`<root>${storage}</root>`, {
    decodeEntities: false,
    xmlMode: true
  });

  convertStyledBlockquotes($);

  $('ac\\:image').each((_, node) => {
    const image = $(node);
    const alt = image.attr('ac:alt') ?? '';
    const attachment = image.find('ri\\:attachment').attr('ri:filename');
    const source = image.find('ri\\:url').attr('ri:value') ?? image.attr('ac:src') ?? '';
    const width = image.attr('ac:width') ?? '';
    const replacement = $('<img>');

    replacement.attr('src', attachment ?? source);

    if (alt) {
      replacement.attr('alt', alt);
    }

    if (attachment) {
      replacement.attr('data-confluence-embedded', 'true');

      if (width) {
        replacement.attr('data-confluence-width', width);
      }
    }

    image.replaceWith(replacement);
  });

  $('a').each((_, node) => {
    const link = $(node);
    const children = link
      .contents()
      .toArray()
      .filter((child) => child.type !== 'text' || child.data.trim());

    if (children.length !== 1 || children[0].type !== 'tag' || children[0].name !== 'img') {
      return;
    }

    const image = $(children[0]);
    if (image.attr('data-confluence-embedded') !== 'true') {
      return;
    }

    const href = link.attr('href')?.trim();
    if (!href) {
      return;
    }

    image.attr('data-confluence-link-href', href);
    link.replaceWith(image);
  });

  for (const node of $('ac\\:structured-macro').toArray().reverse()) {
    const macro = $(node);
    const name = macro.attr('ac:name');

    if (name === 'toc') {
      macro.replaceWith(renderCflmdTocPlaceholder());
      continue;
    }

    if (name === 'details') {
      const body = macro.children('ac\\:rich-text-body').html() ?? '';
      macro.replaceWith(
        `${renderPreservedTagPlaceholder($, node, {
          block: true,
          context: 'details',
          visibleText: '',
          markup: renderPreservedStructuredMacroMarkup($, node)
        })}${body}`
      );
      continue;
    }

    if (name === 'info') {
      const body = macro.children('ac\\:rich-text-body').html() ?? '';
      const commentText = convertStorageFragmentToMarkdown(body).trim();

      macro.replaceWith(renderHtmlCommentPlaceholder(commentText, { block: true }));
      continue;
    }

    if (name !== 'code') {
      macro.replaceWith(
        renderPreservedTagPlaceholder($, node, {
          block: shouldRenderPreservedNodeAsBlock($, node),
          visibleText: extractPreservedNodeVisibleText($, node)
        })
      );
      continue;
    }

    const language = macro.find('ac\\:parameter[ac\\:name="language"]').text().trim();
    const body = macro.find('ac\\:plain-text-body').text();
    const attributes = language ? { class: `language-${language}` } : {};

    macro.replaceWith(
      `<pre><code${renderAttributeMap(attributes)}>${escapeHtml(body)}</code></pre>`
    );
  }

  $('ac\\:task-list').each((_, node) => {
    $(node).replaceWith(renderTaskListPlaceholder($, node));
  });

  $('ac\\:link').each((_, node) => {
    $(node).replaceWith(renderPreservedTagPlaceholder($, node));
  });

  unwrapNodes($, 'li > p:first-child');
  unwrapNodes($, 'table p');
  unwrapNodes($, 'span.placeholder-inline-tasks');

  $('table').each((_, node) => {
    const table = $(node);
    const rows = table.children('tbody').children('tr');

    if (table.children('thead').length === 0 && rows.first().find('th').length > 0) {
      const colgroups = table.children('colgroup').toArray();
      const footers = table.children('tfoot').toArray();
      const thead = $('<thead></thead>').append(rows.first());
      const tbody = $('<tbody></tbody>').append(rows.slice(1));
      table.empty().append(colgroups).append(thead).append(tbody).append(footers);
    }
  });

  $('p').each((_, node) => {
    const paragraph = $(node);
    const children = paragraph.contents().toArray();

    if (children.length !== 3 || children[1].tagName !== 'a') {
      return;
    }

    const left = children[0].data ?? '';
    const right = children[2].data ?? '';
    const hasLeftBracket = left.endsWith('<') || left.endsWith('&lt;');
    const hasRightBracket = right.startsWith('>') || right.startsWith('&gt;');

    if (!hasLeftBracket || !hasRightBracket) {
      return;
    }

    children[1].attribs['data-autolink'] = 'true';
    children[0].data = left.endsWith('&lt;') ? left.slice(0, -4) : left.slice(0, -1);
    children[2].data = right.startsWith('&gt;') ? right.slice(4) : right.slice(1);
  });

  return $('root').html() ?? '';
}

function convertStyledBlockquotes($) {
  $('p').each((_, node) => {
    if (!isStyledBlockquoteParagraph(node)) {
      return;
    }

    if (isStyledBlockquoteParagraph(getPreviousElementSibling(node))) {
      return;
    }

    const group = [];
    let current = node;

    while (isStyledBlockquoteParagraph(current)) {
      group.push(current);
      current = getNextElementSibling(current);
    }

    let html = '';
    let currentLevel = 0;

    for (const paragraph of group) {
      const level = getStyledBlockquoteLevel(paragraph);

      while (currentLevel < level) {
        html += '<blockquote>';
        currentLevel += 1;
      }

      while (currentLevel > level) {
        html += '</blockquote>';
        currentLevel -= 1;
      }

      html += `<p>${$(paragraph).html() ?? ''}</p>`;
    }

    while (currentLevel > 0) {
      html += '</blockquote>';
      currentLevel -= 1;
    }

    $(group[0]).replaceWith(html);

    for (const paragraph of group.slice(1)) {
      $(paragraph).remove();
    }
  });
}

function createTurndownService() {
  const turndown = new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    headingStyle: 'atx'
  });

  turndown.addRule('confluenceAutolink', {
    filter(node) {
      return node.nodeName === 'A' && node.getAttribute('data-autolink') === 'true';
    },
    replacement(content, node) {
      return `<${node.getAttribute('href')}>`;
    }
  });

  turndown.addRule('emailAutolink', {
    filter(node) {
      const href = node.getAttribute('href');
      return (
        node.nodeName === 'A' &&
        href?.startsWith('mailto:') &&
        node.textContent === href.slice('mailto:'.length)
      );
    },
    replacement(content, node) {
      return `<${node.textContent}>`;
    }
  });

  turndown.addRule('embeddedImage', {
    filter(node) {
      return (
        node.nodeName === 'IMG' &&
        node.getAttribute('data-confluence-embedded') === 'true'
      );
    },
    replacement(content, node) {
      const href = node.getAttribute('data-confluence-link-href');
      const width = node.getAttribute('data-confluence-width');
      const image = `[[${node.getAttribute('src')}]]`;

      if (!width && !href) {
        return image;
      }

      const metadata = {};

      if (width) {
        metadata['ac:width'] = width;
      }

      if (href) {
        metadata.href = href;
      }

      return `${formatCflmdImageComment(metadata)}\n${image}`;
    }
  });

  turndown.addRule('cflmdToc', {
    filter(node) {
      return (
        node.nodeName === 'DIV' &&
        node.getAttribute('data-cflmd-toc') === 'true' &&
        node.textContent === 'cflmd-toc'
      );
    },
    replacement() {
      return `\n\n${CFLMD_TOC_COMMENT}\n\n`;
    }
  });

  turndown.addRule('cflmdTaskList', {
    filter(node) {
      return (
        node.nodeName === 'DIV' &&
        node.getAttribute('data-cflmd-task-list') === 'true' &&
        node.textContent === TASK_LIST_SENTINEL
      );
    },
    replacement(content, node) {
      const markdown = decodeBase64(node.getAttribute('data-cflmd-task-list-base64') ?? '');
      return markdown ? `\n\n${markdown}\n\n` : '';
    }
  });

  turndown.addRule('htmlComment', {
    filter(node) {
      return (
        node.getAttribute('data-cflmd-html-comment') === 'true' &&
        node.textContent === HTML_COMMENT_SENTINEL
      );
    },
    replacement(content, node) {
      return renderHtmlComment(
        decodeBase64(node.getAttribute('data-cflmd-html-comment-base64') ?? ''),
        {
          block: node.getAttribute('data-cflmd-block') === 'true'
        }
      );
    }
  });

  turndown.addRule('cflmdPreservedTag', {
    filter(node) {
      return (
        node.getAttribute('data-cflmd-preserved') === 'true' &&
        node.textContent === PRESERVED_TAG_SENTINEL
      );
    },
    replacement(content, node) {
      return renderPreservedTagComment({
        block: node.getAttribute('data-cflmd-block') === 'true',
        kind: node.getAttribute('data-cflmd-kind') ?? '',
        visibleText: decodeBase64(node.getAttribute('data-cflmd-visible-text-base64') ?? ''),
        xml: decodeBase64(node.getAttribute('data-cflmd-xml-base64') ?? ''),
        context: node.getAttribute('data-cflmd-context') ?? ''
      });
    }
  });

  turndown.addRule('rawTable', {
    filter(node) {
      return node.nodeName === 'TABLE';
    },
    replacement(content, node) {
      return `\n\n${renderTable(node)}\n\n`;
    }
  });

  turndown.addRule('thematicBreak', {
    filter: 'hr',
    replacement() {
      return '\n\n---\n\n';
    }
  });

  return turndown;
}

function normalizeMarkdown(markdown) {
  return (
    markdown
      .replace(/^(\s*)- {3}/gm, '$1- ')
      .replace(/^(\s*\d+\.) {2}/gm, '$1 ')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

function unwrapNodes($, selector) {
  $(selector).each((_, node) => {
    $(node).replaceWith($(node).contents());
  });
}

function renderPreservedTagPlaceholder(
  $,
  node,
  { block = false, context = '', visibleText = $(node).text(), markup = $.xml(node) } = {}
) {
  const normalizedVisibleText = decodeHtmlEntities(visibleText);

  return renderDataElement(getPreservedTagPlaceholderTag(block), PRESERVED_TAG_SENTINEL, {
    'data-cflmd-preserved': 'true',
    'data-cflmd-kind': node.name,
    'data-cflmd-xml-base64': encodeBase64(markup),
    'data-cflmd-visible-text-base64': encodeBase64(normalizedVisibleText),
    'data-cflmd-block': String(block),
    'data-cflmd-context': context
  });
}

function renderPreservedTagComment({ block = false, kind, visibleText = '', xml, context = '' }) {
  const comment = formatCflmdPreservedTagComment(kind, {
    block,
    context,
    text: encodeBase64(visibleText),
    markup: encodeBase64(xml)
  });

  if (!comment) {
    return visibleText;
  }

  if (!block && kind === 'ac:link') {
    return `${comment}${visibleText}`;
  }

  return block ? addBlankLines(comment) : `\n${comment}\n${visibleText}`;
}

function renderCflmdTocPlaceholder() {
  return '<div data-cflmd-toc="true">cflmd-toc</div>';
}

function renderHtmlCommentPlaceholder(text, { block = true } = {}) {
  return renderDataElement(getPreservedTagPlaceholderTag(block), HTML_COMMENT_SENTINEL, {
    'data-cflmd-html-comment': 'true',
    'data-cflmd-html-comment-base64': encodeBase64(text),
    'data-cflmd-block': String(block)
  });
}

function renderHtmlComment(text, { block = true } = {}) {
  const comment = `<!-- ${text} -->`;
  return block ? addBlankLines(comment) : comment;
}

function renderTaskListPlaceholder($, node) {
  const markdown = renderTaskListMarkdown($, node);
  return renderDataElement('div', TASK_LIST_SENTINEL, {
    'data-cflmd-task-list': 'true',
    'data-cflmd-task-list-base64': encodeBase64(markdown)
  });
}

function renderPreservedStructuredMacroMarkup($, node) {
  const parsed = load(`<root>${$.xml(node)}</root>`, {
    decodeEntities: false,
    xmlMode: true
  });
  const macro = parsed('root').children('ac\\:structured-macro').first();
  const name = macro.attr('ac:name');

  if (name === 'details') {
    let body = macro.children('ac\\:rich-text-body').first();

    if (body.length === 0) {
      body = parsed('<ac:rich-text-body></ac:rich-text-body>');
      macro.append(body);
    }

    body.empty();
  }

  return parsed('root').html() ?? $.xml(node);
}

function renderTaskListMarkdown($, taskListNode) {
  return $(taskListNode)
    .children('ac\\:task')
    .toArray()
    .map((taskNode) => renderTaskMarkdownItem($, taskNode))
    .join('\n');
}

function renderTaskMarkdownItem($, taskNode) {
  const task = $(taskNode);
  const status = task.children('ac\\:task-status').first().text().trim() === 'complete' ? 'x' : ' ';
  const bodyMarkdown = convertStorageFragmentToMarkdown(
    unwrapTaskBodyPlaceholderSpans(task.children('ac\\:task-body').first().html() ?? '')
  );

  return formatChecklistItem(status, bodyMarkdown);
}

function convertStorageFragmentToMarkdown(storage) {
  if (!storage.trim()) {
    return '';
  }

  return createTurndownService().turndown(preprocessStorage(storage)).trim();
}

function unwrapTaskBodyPlaceholderSpans(storage) {
  return storage.replace(
    /<span class="placeholder-inline-tasks">([\s\S]*?)<\/span>/g,
    '$1'
  );
}

function formatChecklistItem(marker, bodyMarkdown) {
  const body = bodyMarkdown.replace(/\r\n?/g, '\n').trim();

  if (!body) {
    return `- [${marker}]`;
  }

  const lines = body.split('\n');
  const [firstLine, ...rest] = lines;

  if (shouldStartChecklistBodyOnNextLine(firstLine)) {
    return [`- [${marker}]`, ...lines.map(indentChecklistLine)].join('\n');
  }

  return [`- [${marker}] ${firstLine}`, ...rest.map(indentChecklistLine)].join('\n');
}

function shouldStartChecklistBodyOnNextLine(firstLine) {
  if (isInlineCflmdAcLinkComment(firstLine)) {
    return false;
  }

  return (
    !firstLine ||
    startsWithBlockOnlyComment(firstLine) ||
    firstLine.startsWith('```') ||
    firstLine.startsWith('>') ||
    firstLine.startsWith('- ') ||
    firstLine.startsWith('* ') ||
    /^\d+\.\s/.test(firstLine) ||
    firstLine.startsWith('<')
  );
}

function startsWithBlockOnlyComment(firstLine) {
  return firstLine.startsWith('<!--') && !firstLine.startsWith('<!-- cflmd-ac-link:');
}

function isInlineCflmdAcLinkComment(firstLine) {
  return firstLine.startsWith('<!-- cflmd-ac-link:');
}

function indentChecklistLine(line) {
  return line ? `  ${line}` : '  ';
}

function isStyledBlockquoteParagraph(node) {
  return (
    node?.type === 'tag' &&
    node.name === 'p' &&
    /margin-left:\s*\d/.test(node.attribs?.style ?? '')
  );
}

function getStyledBlockquoteLevel(node) {
  const match = (node.attribs?.style ?? '').match(/margin-left:\s*([0-9.]+)px/);
  const marginLeft = Number(match?.[1] ?? 0);
  return Math.max(1, Math.round(marginLeft / 30));
}

function getPreviousElementSibling(node) {
  let current = node?.prevSibling;

  while (current && current.type !== 'tag') {
    current = current.prevSibling;
  }

  return current;
}

function getNextElementSibling(node) {
  let current = node?.nextSibling;

  while (current && current.type !== 'tag') {
    current = current.nextSibling;
  }

  return current;
}

function renderTable(node) {
  const lines = ['<table>'];

  for (const section of getElementChildren(node, ['COLGROUP', 'THEAD', 'TBODY', 'TFOOT'])) {
    if (section.nodeName === 'COLGROUP') {
      lines.push(renderTableColgroup(section));
      continue;
    }

    lines.push(`  <${section.nodeName.toLowerCase()}>`);

    for (const row of getElementChildren(section, ['TR'])) {
      lines.push('    <tr>');

      for (const cell of getElementChildren(row, ['TH', 'TD'])) {
        const tag = cell.nodeName.toLowerCase();
        const content = Array.from(cell.childNodes ?? [], renderInlineHtml).join('');
        lines.push(renderTableCell(tag, content));
      }

      lines.push('    </tr>');
    }

    lines.push(`  </${section.nodeName.toLowerCase()}>`);
  }

  lines.push('</table>');
  return lines.join('\n');
}

function renderTableColgroup(node) {
  const attributes = renderHtmlAttributes(node);
  const lines = [`  <colgroup${attributes}>`];

  for (const column of getElementChildren(node, ['COL'])) {
    lines.push(`    ${renderInlineHtml(column)}`);
  }

  lines.push('  </colgroup>');
  return lines.join('\n');
}

function renderTableCell(tag, content) {
  const normalizedContent = content.replace(/^\n+|\n+$/g, '');
  const normalizedLines = normalizedContent
    .split('\n')
    .filter((line) => line.trim() || normalizedContent.trim() === '');

  if (normalizedLines.length <= 1 && !content.includes('\n') && !normalizedContent.includes('\n')) {
    return `      <${tag}>${normalizedContent}</${tag}>`;
  }

  const body = normalizedLines
    .map((line) => `        ${line}`)
    .join('\n');

  return `      <${tag}>\n${body}\n      </${tag}>`;
}

function getElementChildren(node, names) {
  return Array.from(node.childNodes ?? []).filter((child) => names.includes(child.nodeName));
}

function renderInlineHtml(node) {
  if (node.nodeType === 3) {
    return escapeHtml(node.nodeValue);
  }

  if (getNodeAttribute(node, 'data-cflmd-html-comment') === 'true') {
    return renderHtmlComment(
      decodeBase64(getNodeAttribute(node, 'data-cflmd-html-comment-base64') ?? ''),
      {
        block: getNodeAttribute(node, 'data-cflmd-block') === 'true'
      }
    );
  }

  if (getNodeAttribute(node, 'data-cflmd-task-list') === 'true') {
    return decodeBase64(getNodeAttribute(node, 'data-cflmd-task-list-base64') ?? '');
  }

  if (getNodeAttribute(node, 'data-cflmd-preserved') === 'true') {
    return renderPreservedTagComment({
      block: getNodeAttribute(node, 'data-cflmd-block') === 'true',
      kind: getNodeAttribute(node, 'data-cflmd-kind') ?? '',
      visibleText: decodeBase64(getNodeAttribute(node, 'data-cflmd-visible-text-base64') ?? ''),
      xml: decodeBase64(getNodeAttribute(node, 'data-cflmd-xml-base64') ?? ''),
      context: getNodeAttribute(node, 'data-cflmd-context') ?? ''
    });
  }

  const content = Array.from(node.childNodes ?? [], renderInlineHtml).join('');
  return renderHtmlElement(node, content);
}

function renderHtmlElement(node, content) {
  const tag = node.nodeName.toLowerCase();
  const attributes = renderHtmlAttributes(node);

  if (tag === 'strong' || tag === 'b') {
    return `**${content}**`;
  }

  if (HTML_VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attributes}>`;
  }

  return `<${tag}${attributes}>${content}</${tag}>`;
}

function renderHtmlAttributes(node) {
  return renderAttributeMap(
    Object.fromEntries(Array.from(node.attributes ?? []).map((attribute) => [attribute.name, attribute.value]))
  );
}

function renderDataElement(tag, content, attributes) {
  return `<${tag}${renderAttributeMap(attributes)}>${content}</${tag}>`;
}

function addBlankLines(text) {
  return `\n\n${text}\n\n`;
}

function getNodeAttribute(node, name) {
  if (typeof node?.getAttribute === 'function') {
    return node.getAttribute(name);
  }

  return node?.attribs?.[name];
}

function decodeHtmlEntities(text) {
  if (!text || !text.includes('&')) {
    return text;
  }

  return load(`<span>${text}</span>`)('span').text();
}

function extractPreservedNodeVisibleText($, node) {
  if (node.name === 'ac:structured-macro') {
    const macro = $(node);
    const name = macro.attr('ac:name');

    if (name === 'status') {
      return decodeHtmlEntities(
        macro.children('ac\\:parameter[ac\\:name="title"]').first().text().trim()
      );
    }

    if (name === 'jira') {
      return decodeHtmlEntities(
        macro.children('ac\\:parameter[ac\\:name="key"]').first().text().trim()
      );
    }
  }

  return '';
}

function shouldRenderPreservedNodeAsBlock($, node) {
  if ($(node).parents('table').length > 0) {
    return false;
  }

  if (node.name === 'ac:task-list') {
    return true;
  }

  if (node.name === 'ac:structured-macro') {
    const name = $(node).attr('ac:name');
    return name !== 'status' && name !== 'jira';
  }

  return false;
}
