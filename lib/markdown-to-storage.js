import { load } from 'cheerio';
import MarkdownIt from 'markdown-it';

import {
  getPreservedTagPlaceholderTag,
  parsePreservedTagCommentMetadata
} from './cflmd-comment-utils.js';
import {
  decodeBase64,
  encodeBase64,
  escapeHtml,
  escapeHtmlAttribute,
  extractTextAlign,
  normalizeImageWidth,
  removeStyleProperty,
  renderAttributeMap,
  setStyleProperty
} from './markup-utils.js';

const BLOCKQUOTE_INDENT = 30;
const CODE_MACRO_BREAKOUT_MODE = 'wide';
const CODE_MACRO_BREAKOUT_WIDTH = '760';
const ATTACHMENT_IMAGE_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i;
const MALFORMED_LINKED_CFLMD_IMAGE_PATTERN =
  /\[\s*<!--\s*cflmd-image:\s*\{[\s\S]*?\}\s*-->\s*(\[\[[^\]]+\]\])\s*\]\(([^)]+)\)/g;
const CFLMD_IMAGE_COMMENT_PATTERN =
  /<!--\s*cflmd-image:\s*(\{[\s\S]*?\})\s*-->\s*(\[\[[^\]]+\]\])/g;
const CFLMD_TOC_COMMENT_PATTERN = /<!--\s*cflmd-toc\s*-->/g;
const CFLMD_AC_LINK_COMMENT_PATTERN = /<!--\s*cflmd-ac-link:\s*(\{[\s\S]*?\})\s*-->/g;
const CFLMD_AC_PARAMETER_COMMENT_PATTERN =
  /[ \t]*\n?[ \t]*<!--\s*cflmd-ac-parameter:\s*(\{[\s\S]*?\})\s*-->[ \t]*\n?/g;
const CFLMD_AC_STRUCTURED_MACRO_COMMENT_PATTERN =
  /<!--\s*cflmd-ac-structured-macro:\s*(\{[\s\S]*?\})\s*-->/g;
const CFLMD_AC_TASK_LIST_COMMENT_PATTERN =
  /<!--\s*cflmd-ac-task-list:\s*(\{[\s\S]*?\})\s*-->/g;
const PRESERVED_TAG_SENTINEL = 'cflmd-preserved';
const RESTORED_TAG_PLACEHOLDER = 'span';
const RESTORED_TAG_SENTINEL = 'cflmd-restored';
const TASK_LIST_ITEM_PATTERN = /^\[([ xX])\]\s*/;
const STORAGE_TEXT_ENTITY_MAP = new Map([
  ["'", '&apos;'],
  ['‘', '&lsquo;'],
  ['’', '&rsquo;'],
  ['“', '&ldquo;'],
  ['”', '&rdquo;']
]);

const markdownIt = new MarkdownIt({
  breaks: true,
  html: true
});

markdownIt.use(addConfluenceAttachmentImageSyntax);

export function convertMarkdownToStorage(markdown) {
  const tableCellMarkdownState = createTableCellMarkdownState();
  const html = markdownIt
    .render(protectTableCellMarkdown(expandCflmdComments(markdown), tableCellMarkdownState))
    .trim();
  const $ = load(`<root>${html}</root>`, {
    decodeEntities: false
  });
  const taskListState = createTaskListState();

  renderMarkdownInTableCells($, tableCellMarkdownState);
  normalizeParagraphWhitespace($);
  convertBlockquotes($);
  convertAutolinks($);
  convertImages($);
  convertTocs($);
  convertCodeBlocks($);
  convertGenericHtmlComments($);
  convertChecklistLists($, taskListState);
  restorePreservedTags($);
  wrapListItemContent($);
  normalizeParagraphWhitespace($);
  wrapDetailsTables($);
  convertTables($);
  stripTitleAttributes($);
  encodeStorageTextEntities($);

  const normalizedStorage = normalizeStorageMarkup($('root').html()?.trim() ?? '');
  return normalizeStorageMarkup(restoreDetailsMacros(normalizedStorage));
}

function normalizeParagraphWhitespace($) {
  $('p').contents().each((_, node) => {
    if (node.type !== 'text') {
      return;
    }

    node.data = node.data.replace(/\n/g, '');
  });
}

function encodeStorageTextEntities($) {
  for (const node of $('root').contents().toArray()) {
    encodeStorageTextEntitiesInNode(node);
  }
}

function encodeStorageTextEntitiesInNode(node) {
  if (!node) {
    return;
  }

  if (node.type === 'text') {
    node.data = encodeStorageTextEntityString(node.data);
    return;
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    encodeStorageTextEntitiesInNode(child);
  }
}

function encodeStorageTextEntityString(text) {
  return Array.from(text, (character) => STORAGE_TEXT_ENTITY_MAP.get(character) ?? character).join(
    ''
  );
}

function convertBlockquotes($) {
  $('blockquote').each((_, node) => {
    if ($(node).parents('blockquote').length > 0) {
      return;
    }

    $(node).replaceWith(renderBlockquoteChildren($, node, 1));
  });
}

function renderBlockquoteChildren($, node, level) {
  let html = '';

  for (const child of $(node).contents().toArray()) {
    if (child.type === 'text') {
      if (!child.data.trim()) {
        continue;
      }

      html += renderStyledParagraph(escapeHtml(child.data), level);
      continue;
    }

    if (child.type !== 'tag') {
      continue;
    }

    if (child.name === 'blockquote') {
      html += renderBlockquoteChildren($, child, level + 1);
      continue;
    }

    if (child.name === 'p') {
      html += renderStyledParagraph($(child).html() ?? '', level);
      continue;
    }

    html += renderStyledParagraph($.html(child), level);
  }

  return html;
}

function renderStyledParagraph(content, level) {
  return `<p style="margin-left: ${(level * BLOCKQUOTE_INDENT).toFixed(1)}px;">${content}</p>`;
}

function convertAutolinks($) {
  $('a').each((_, node) => {
    const link = $(node);
    const href = link.attr('href') ?? '';
    const text = link.text();

    if (!href || href.startsWith('mailto:') || href !== text) {
      return;
    }

    const parent = link.parent();
    if (!parent.is('p')) {
      return;
    }

    const children = parent.contents().toArray();
    if (children.some((child) => child.type === 'tag' && child !== node)) {
      return;
    }

    const leadingText = children
      .filter((child) => child.type === 'text' && child !== node)
      .map((child) => child.data)
      .join('');

    parent.html(`${escapeHtml(leadingText)}&lt;${$.html(node)}&gt;`);
  });
}

function convertImages($) {
  $('img').each((_, node) => {
    const image = $(node);
    const source = image.attr('src') ?? '';
    const alt = image.attr('alt') ?? '';
    const isAttachment = image.attr('data-confluence-attachment') === 'true';
    const width = normalizeImageWidth(image.attr('data-confluence-width'));
    const replacement = isAttachment
      ? $('<ac:image ac:align="center" ac:layout="center"><ri:attachment /></ac:image>')
      : $('<ac:image ac:align="center" ac:layout="center"><ri:url /></ac:image>');

    if (alt) {
      replacement.attr('ac:alt', alt);
    }

    if (isAttachment) {
      replacement.find('ri\\:attachment').attr('ri:filename', source);
    } else {
      replacement.attr('ac:src', source);
      replacement.find('ri\\:url').attr('ri:value', source);
    }

    if (width) {
      replacement.attr('ac:custom-width', 'true');
      replacement.attr('ac:width', width);
    }

    image.replaceWith(replacement);
  });
}

function expandCflmdComments(markdown) {
  return expandPreservedTagComments(
    stripLegacyParameterComments(
      expandCflmdTocComments(
        expandCflmdImageComments(stripMalformedLinkedImageMarkdown(markdown))
      )
    )
  );
}

function expandCflmdImageComments(markdown) {
  return markdown.replace(CFLMD_IMAGE_COMMENT_PATTERN, (match, metadataText, imageSyntax) => {
    const imageTarget = parseAttachmentImageTarget(imageSyntax.slice(2, -2).trim());
    const { href, width } = parseCflmdImageMetadata(metadataText);

    if (!imageTarget || (!width && !href)) {
      return match;
    }

    return renderAttachmentImageHtml({
      alt: imageTarget.alt,
      source: imageTarget.source,
      href,
      width
    });
  });
}

function expandCflmdTocComments(markdown) {
  return markdown.replace(
    CFLMD_TOC_COMMENT_PATTERN,
    '<div data-cflmd-toc="true">cflmd-toc</div>'
  );
}

function stripMalformedLinkedImageMarkdown(markdown) {
  return markdown.replace(MALFORMED_LINKED_CFLMD_IMAGE_PATTERN, (match, imageSyntax, href) => {
    return `<a href="${escapeHtmlAttribute(href)}">${escapeHtml(imageSyntax)}</a>`;
  });
}

function stripLegacyParameterComments(markdown) {
  return markdown.replace(CFLMD_AC_PARAMETER_COMMENT_PATTERN, ' ');
}

function expandPreservedTagComments(markdown) {
  return markdown
    .replace(CFLMD_AC_LINK_COMMENT_PATTERN, (match, metadataText) =>
      expandPreservedTagComment(match, 'ac:link', metadataText)
    )
    .replace(CFLMD_AC_STRUCTURED_MACRO_COMMENT_PATTERN, (match, metadataText) =>
      expandPreservedTagComment(match, 'ac:structured-macro', metadataText)
    )
    .replace(CFLMD_AC_TASK_LIST_COMMENT_PATTERN, (match, metadataText) =>
      expandPreservedTagComment(match, 'ac:task-list', metadataText)
    );
}

function expandPreservedTagComment(match, kind, metadataText) {
  const metadata = parsePreservedTagCommentMetadata(metadataText);

  if (!metadata) {
    return match;
  }

  return renderPreservedTagPlaceholder({
    block: metadata.block === true,
    context: typeof metadata.context === 'string' ? metadata.context : '',
    kind,
    visibleText: decodeBase64(metadata.text),
    xml: decodeBase64(metadata.markup)
  });
}

function addConfluenceAttachmentImageSyntax(md) {
  md.inline.ruler.before('image', 'confluenceAttachmentImage', (state, silent) => {
    const start = state.pos;

    if (state.linkLevel > 0) {
      return false;
    }

    if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5b) {
      return false;
    }

    const end = state.src.indexOf(']]', start + 2);
    if (end === -1) {
      return false;
    }

    const imageTarget = parseAttachmentImageTarget(state.src.slice(start + 2, end).trim());

    if (!imageTarget) {
      return false;
    }

    if (silent) {
      return true;
    }

    const token = state.push('confluence_attachment_image', 'img', 0);
    token.attrSet('alt', imageTarget.alt);
    token.attrSet('data-confluence-attachment', 'true');
    token.attrSet('src', imageTarget.source);

    state.pos = end + 2;
    return true;
  });

  md.renderer.rules.confluence_attachment_image = (tokens, index, options, env, self) =>
    self.renderToken(tokens, index, options);
}

function convertCodeBlocks($) {
  $('pre').each((_, node) => {
    const pre = $(node);
    const code = pre.children('code').first();
    const body = code.length > 0 ? code.text() : pre.text();
    const languageClass = code.attr('class') ?? '';
    const languageMatch = languageClass.match(/language-([A-Za-z0-9_-]+)/);
    const macro = $(
      '<ac:structured-macro ac:name="code" ac:schema-version="1"></ac:structured-macro>'
    );

    if (languageMatch) {
      macro.append(
        `<ac:parameter ac:name="language">${escapeHtml(languageMatch[1])}</ac:parameter>`
      );
    }
    macro.append(
      `<ac:parameter ac:name="breakoutMode">${CODE_MACRO_BREAKOUT_MODE}</ac:parameter>`
    );
    macro.append(
      `<ac:parameter ac:name="breakoutWidth">${CODE_MACRO_BREAKOUT_WIDTH}</ac:parameter>`
    );

    macro.append(renderCodeMacroPlainTextBody(body));

    pre.replaceWith(macro);
  });
}

function convertChecklistLists($, taskListState) {
  $('ul').each((_, node) => {
    const list = $(node);
    const items = list.children('li').toArray();
    const itemsWithStatus = items.map((itemNode) => ({
      itemNode,
      status: getTaskStatusFromListItem($, itemNode)
    }));

    if (itemsWithStatus.length === 0 || itemsWithStatus.every(({ status }) => !status)) {
      return;
    }

    if (itemsWithStatus.some(({ status }) => !status)) {
      replaceMixedChecklistList($, list, itemsWithStatus, taskListState);
      return;
    }

    const taskItems = itemsWithStatus.map(({ itemNode, status }) => ({
      bodyHtml: stripTaskMarkerFromListItem($, itemNode),
      status
    }));

    list.replaceWith(renderTaskListMarkup(taskItems, taskListState));
  });
}

function replaceMixedChecklistList($, list, itemsWithStatus, taskListState) {
  const segments = [];
  let currentKind = null;

  for (const item of itemsWithStatus) {
    const kind = item.status ? 'task' : 'list';
    const currentSegment = segments.at(-1);

    if (!currentSegment || currentKind !== kind) {
      segments.push({ items: [item], kind });
      currentKind = kind;
      continue;
    }

    currentSegment.items.push(item);
  }

  for (const segment of segments) {
    list.before(
      segment.kind === 'task'
        ? renderTaskListMarkup(
            segment.items.map(({ itemNode, status }) => ({
              bodyHtml: stripTaskMarkerFromListItem($, itemNode),
              status
            })),
            taskListState
          )
        : renderListMarkup($, segment.items.map(({ itemNode }) => itemNode))
    );
  }

  list.remove();
}

function convertTocs($) {
  $('div[data-cflmd-toc="true"]').each((_, node) => {
    $(node).replaceWith(renderTocMacro());
  });
}

function convertGenericHtmlComments($) {
  for (const node of collectCommentNodes($('root').contents().toArray())) {
    const commentText = node.data.trim();

    if (!commentText || commentText.startsWith('cflmd-')) {
      $(node).remove();
      continue;
    }

    $(node).replaceWith(renderInfoMacro(commentText));
  }
}

function *collectCommentNodes(nodes) {
  for (const node of nodes) {
    if (!node) {
      continue;
    }

    if (node.type === 'comment') {
      yield node;
      continue;
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      yield* collectCommentNodes(node.children);
    }
  }
}

function renderMarkdownInTableCells($, tableCellMarkdownState) {
  while (true) {
    const placeholders = $('[data-cflmd-table-cell-markdown="true"]').toArray();

    if (placeholders.length === 0) {
      return;
    }

    for (const node of placeholders) {
      const placeholder = $(node);
      const cell = placeholder.parent();

      if (!cell.is('td, th')) {
        placeholder.remove();
        continue;
      }

      const sourceId = placeholder.attr('data-cflmd-table-cell-id') ?? '';
      const source = tableCellMarkdownState.sources.get(sourceId) ?? '';
      const protectedSource = protectTableCellMarkdown(source, tableCellMarkdownState);
      const rendered = protectedSource ? markdownIt.render(protectedSource).trim() : '';

      cell.empty();

      if (rendered) {
        cell.append(rendered);
      }
    }
  }
}

function protectTableCellMarkdown(markdown, tableCellMarkdownState) {
  const tagPattern = /<\/?(table|tbody|thead|tfoot|tr|td|th)\b[^>]*>/gi;
  let output = '';
  let lastIndex = 0;
  let tableDepth = 0;
  let activeCell = null;
  let match;

  while ((match = tagPattern.exec(markdown)) !== null) {
    const tag = match[1].toLowerCase();
    const isClosing = match[0][1] === '/';
    const tagStart = match.index;
    const tagEnd = tagPattern.lastIndex;

    if (activeCell) {
      if (tag === 'table') {
        tableDepth += isClosing ? -1 : 1;
      }

      if (isClosing && tag === activeCell.tag && tableDepth === activeCell.tableDepth) {
        const source = normalizeTableCellMarkdownSource(markdown.slice(activeCell.contentStart, tagStart));
        const sourceId = String(tableCellMarkdownState.nextId);
        tableCellMarkdownState.nextId += 1;
        tableCellMarkdownState.sources.set(sourceId, source);
        output += renderTableCellMarkdownPlaceholder(sourceId);
        output += markdown.slice(tagStart, tagEnd);
        lastIndex = tagEnd;
        activeCell = null;
      }

      continue;
    }

    if (tag === 'table') {
      tableDepth += isClosing ? -1 : 1;
    }

    if (tableDepth > 0 && !isClosing && (tag === 'td' || tag === 'th')) {
      output += markdown.slice(lastIndex, tagEnd);
      activeCell = {
        contentStart: tagEnd,
        tableDepth,
        tag
      };
      lastIndex = tagEnd;
    }
  }

  output += markdown.slice(lastIndex);
  return output;
}

function createTableCellMarkdownState() {
  return {
    nextId: 1,
    sources: new Map()
  };
}

function renderTableCellMarkdownPlaceholder(sourceId) {
  return `<span data-cflmd-table-cell-markdown="true" data-cflmd-table-cell-id="${escapeHtmlAttribute(sourceId)}"></span>`;
}

function normalizeTableCellMarkdownSource(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  while (lines.length > 0 && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length > 0 && !lines.at(-1)?.trim()) {
    lines.pop();
  }

  if (lines.length === 0) {
    return '';
  }

  const indentation = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const commonIndent = indentation.length > 0 ? Math.min(...indentation) : 0;

  return lines
    .map((line) => {
      if (!line.trim()) {
        return '';
      }

      return line.slice(commonIndent).replace(/[ \t]+$/g, '');
    })
    .join('\n');
}

function createTaskListState() {
  return { nextTaskId: 1, nextTaskListId: 1 };
}

function getTaskStatusFromListItem($, itemNode) {
  const location = findTaskMarkerLocation($(itemNode).contents().toArray());
  return location ? (location.checked ? 'complete' : 'incomplete') : null;
}

function stripTaskMarkerFromListItem($, itemNode) {
  const item = $(itemNode);
  const location = findTaskMarkerLocation(item.contents().toArray());

  if (!location) {
    return item.html() ?? '';
  }

  location.node.data = location.node.data.slice(location.prefixLength);

  if (!location.node.data.trim()) {
    $(location.node).remove();
  }

  if (item.children('p').length === 1 && item.contents().toArray().filter(isMeaningfulNode).length === 1) {
    return item.children('p').first().html()?.trim() ?? '';
  }

  return item.html()?.trim() ?? '';
}

function findTaskMarkerLocation(nodes) {
  for (const node of nodes) {
    if (!isMeaningfulNode(node)) {
      continue;
    }

    if (node.type === 'text') {
      const match = node.data.match(TASK_LIST_ITEM_PATTERN);

      if (match) {
        return {
          checked: match[1].toLowerCase() === 'x',
          node,
          prefixLength: match[0].length
        };
      }

      return null;
    }

    if (node.type === 'tag' && node.name === 'p') {
      return findTaskMarkerLocation(node.children ?? []);
    }

    return null;
  }

  return null;
}

function isMeaningfulNode(node) {
  return node.type !== 'text' || node.data.trim();
}

function renderTaskListMarkup(items, taskListState) {
  const taskListId = `cflmd-task-list-${taskListState.nextTaskListId}`;
  taskListState.nextTaskListId += 1;
  const tasks = items
    .map((item) => {
      const taskId = String(taskListState.nextTaskId);
      taskListState.nextTaskId += 1;
      return `<ac:task><ac:task-id>${taskId}</ac:task-id><ac:task-uuid>${taskId}</ac:task-uuid><ac:task-status>${item.status}</ac:task-status><ac:task-body>${item.bodyHtml}</ac:task-body></ac:task>`;
    })
    .join('');

  return `<ac:task-list ac:task-list-id="${taskListId}">${tasks}</ac:task-list>`;
}

function renderListMarkup($, items) {
  return `<ul>${items.map((itemNode) => $.html(itemNode)).join('')}</ul>`;
}

function restorePreservedTags($) {
  $('[data-cflmd-preserved="true"]').each((_, node) => {
    restorePreservedTag($, node);
  });
}

function wrapListItemContent($) {
  $('li').each((_, node) => {
    const item = $(node);

    if (item.children('p').first().length > 0) {
      return;
    }

    const children = item.contents().toArray();
    const nestedListIndex = children.findIndex(
      (child) => child.type === 'tag' && (child.name === 'ul' || child.name === 'ol')
    );
    const leadingChildren =
      nestedListIndex === -1 ? children : children.slice(0, nestedListIndex);
    const hasMeaningfulContent = leadingChildren.some(
      (child) => child.type !== 'text' || child.data.trim()
    );

    if (!hasMeaningfulContent) {
      return;
    }

    const paragraph = $('<p></p>');

    for (const child of leadingChildren) {
      paragraph.append(child);
    }

    if (nestedListIndex === -1) {
      item.empty().append(paragraph);
      return;
    }

    item.prepend(paragraph);
  });
}

function convertTables($) {
  $('table').each((_, node) => {
    const table = $(node);
    table.attr('data-layout', 'default');
    table.attr('data-table-width', '760');

    table.find('th').each((__, cellNode) => {
      const cell = $(cellNode);

      if (cell.children('p').length === 0) {
        const contents = cell.contents().toArray();
        const paragraph = $('<p></p>');

        for (const child of contents) {
          paragraph.append(child);
        }

        cell.empty().append(paragraph);
      }

      cell.children('p').each((___, paragraphNode) => {
        const paragraph = $(paragraphNode);

        if (paragraph.children('strong').length === 0) {
          const strong = $('<strong></strong>');
          const contents = paragraph.contents().toArray();

          for (const child of contents) {
            strong.append(child);
          }

          paragraph.empty().append(strong);
        }
      });

      normalizeTableCellAlignment($, cell);
    });

    table.find('td').each((__, cellNode) => {
      normalizeTableDataCell($, cellNode);
      normalizeTableCellAlignment($, $(cellNode));
    });
  });
}

function stripTitleAttributes($) {
  $('a, img').each((_, node) => {
    $(node).removeAttr('title');
  });
}

function wrapDetailsTables($) {
  const rootChildren = $('root').contents().toArray();

  for (let index = 0; index < rootChildren.length; index += 1) {
    const node = rootChildren[index];

    if (node?.type !== 'tag' || node.name !== 'p') {
      continue;
    }

    const paragraph = $(node);

    if (!isDetailsParameterParagraph($, paragraph)) {
      continue;
    }

    const tableNode = findFollowingRootTable($, rootChildren, index);

    if (!tableNode) {
      continue;
    }

    const macro = $(
      '<ac:structured-macro ac:name="details" ac:schema-version="1" data-layout="default"></ac:structured-macro>'
    );
    const body = $('<ac:rich-text-body></ac:rich-text-body>');

    for (const parameterNode of paragraph
      .contents()
      .toArray()
      .filter((child) => child.type !== 'text' || child.data.trim())) {
      macro.append(parameterNode);
    }

    body.append(tableNode);
    macro.append(body);
    paragraph.replaceWith(macro);
  }
}

function isDetailsParameterParagraph($, paragraph) {
  const meaningfulChildren = paragraph
    .contents()
    .toArray()
    .filter((child) => child.type !== 'text' || child.data.trim());

  return (
    meaningfulChildren.length > 0 &&
    meaningfulChildren.every(isDetailsParameterNode) &&
    meaningfulChildren.some((child) => getParameterNodeName($, child) === 'id')
  );
}

function normalizeTableDataCell($, cellNode) {
  const cell = $(cellNode);
  const normalizedChildren = [];
  let paragraph = null;

  const flushParagraph = () => {
    if (!paragraph) {
      return;
    }

    const hasMeaningfulContent = paragraph
      .contents()
      .toArray()
      .some((child) => child.type !== 'text' || child.data.trim());

    if (hasMeaningfulContent) {
      normalizedChildren.push(paragraph);
    }

    paragraph = null;
  };

  for (const child of cell.contents().toArray()) {
    if (isTableCellBlockNode(child)) {
      flushParagraph();
      normalizedChildren.push(child);
      continue;
    }

    if (!paragraph) {
      paragraph = $('<p></p>');
    }

    paragraph.append(child);
  }

  flushParagraph();

  cell.empty();
  cell.append(normalizedChildren.length > 0 ? normalizedChildren : '<p></p>');
}

function normalizeTableCellAlignment($, cell) {
  const alignment = extractTextAlign(cell.attr('style'));
  const paragraphs = cell.children('p');

  if (!alignment || paragraphs.length === 0) {
    return;
  }

  const remainingStyle = removeStyleProperty(cell.attr('style'), 'text-align');

  if (remainingStyle) {
    cell.attr('style', remainingStyle);
  } else {
    cell.removeAttr('style');
  }

  paragraphs.each((_, paragraphNode) => {
    const paragraph = $(paragraphNode);
    paragraph.attr('style', setStyleProperty(paragraph.attr('style'), 'text-align', alignment));
  });
}

function isTableCellBlockNode(node) {
  return (
    node?.type === 'tag' &&
    (node.name === 'p' ||
      node.name === 'ul' ||
      node.name === 'ol' ||
      node.name === 'table' ||
      node.name === 'blockquote' ||
      node.name === 'pre' ||
      node.name === 'ac:task-list')
  );
}

function isDetailsParameterNode(node) {
  return (
    (node?.type === 'tag' && node.name === 'ac:parameter') ||
    isRestoredParameterPlaceholder(node)
  );
}

function isRestoredParameterPlaceholder(node) {
  if (node?.type !== 'tag' || node.name !== RESTORED_TAG_PLACEHOLDER) {
    return false;
  }

  return /^<ac:parameter\b/.test(decodeRestoredPlaceholderXml(node));
}

function getParameterNodeName($, node) {
  if (node?.type === 'tag' && node.name === 'ac:parameter') {
    return $(node).attr('ac:name') ?? '';
  }

  const match = decodeRestoredPlaceholderXml(node).match(/ac:name="([^"]+)"/);
  return match?.[1] ?? '';
}

function decodeRestoredPlaceholderXml(node) {
  if (
    node?.type !== 'tag' ||
    node.name !== RESTORED_TAG_PLACEHOLDER ||
    node.attribs?.['data-cflmd-restored'] !== 'true'
  ) {
    return '';
  }

  return decodeBase64(node.attribs?.['data-cflmd-xml-base64'] ?? '');
}

function parseAttachmentImageTarget(rawTarget) {
  const [source, alt = source] = rawTarget.split('|').map((part) => part.trim());

  if (!source || !isAttachmentImageSource(source)) {
    return null;
  }

  return {
    alt: alt || source,
    source
  };
}

function parseCflmdImageMetadata(metadataText) {
  try {
    const metadata = JSON.parse(metadataText);

    return {
      href: typeof metadata?.href === 'string' && metadata.href.trim() ? metadata.href.trim() : null,
      width: normalizeImageWidth(metadata?.['ac:width'] ?? metadata?.width)
    };
  } catch {
    return {
      href: null,
      width: null
    };
  }
}

function renderAttachmentImageHtml({ alt, source, href, width }) {
  const image = `<img alt="${escapeHtmlAttribute(alt)}" data-confluence-attachment="true"${width ? ` data-confluence-width="${escapeHtmlAttribute(width)}"` : ''} src="${escapeHtmlAttribute(source)}">`;

  if (!href) {
    return image;
  }

  return `<a href="${escapeHtmlAttribute(href)}">${image}</a>`;
}

function restorePreservedTag($, node) {
  const preserved = $(node);
  const xml = decodeBase64(preserved.attr('data-cflmd-xml-base64') ?? '');
  const visibleText = decodeBase64(preserved.attr('data-cflmd-visible-text-base64') ?? '');

  if (visibleText || isInsideTableCell($, node)) {
    stripFormattingAroundPreservedTag($, node, visibleText);
  }

  if (visibleText) {
    consumeFollowingVisibleText($, node, visibleText);
  }

  preserved.replaceWith(renderRestoredTagPlaceholder(xml));
}

function stripFormattingAroundPreservedTag($, node, visibleText) {
  let previous = getPreviousSibling(node);

  while (previous?.type === 'text' && !previous.data.trim()) {
    $(previous).remove();
    previous = getPreviousSibling(node);
  }

  if (isBreakNode(previous)) {
    const beforeBreak = getPreviousSibling(previous);

    if (
      visibleText &&
      beforeBreak?.type === 'text' &&
      beforeBreak.data &&
      !/\s$/.test(beforeBreak.data)
    ) {
      beforeBreak.data += ' ';
    }

    $(previous).remove();
  }

  let next = getNextSibling(node);

  while (next?.type === 'text' && !next.data.trim()) {
    $(next).remove();
    next = getNextSibling(node);
  }

  if (isBreakNode(next)) {
    $(next).remove();
  }
}

function consumeFollowingVisibleText($, node, expectedText) {
  let remaining = expectedText;
  let current = getNextSibling(node);

  while (current && remaining) {
    const next = getNextSibling(current);

    if (current.type === 'text') {
      const text = current.data ?? '';
      const normalizedText = text.replace(/^\s+/, '');

      if (!normalizedText) {
        $(current).remove();
        current = next;
        continue;
      }

      if (normalizedText.startsWith(remaining)) {
        current.data = normalizedText.slice(remaining.length);
        remaining = '';

        if (!current.data.trim()) {
          $(current).remove();
        }

        break;
      }

      if (remaining.startsWith(normalizedText)) {
        remaining = remaining.slice(normalizedText.length);
        $(current).remove();
        current = next;
        continue;
      }

      break;
    }

    break;
  }
}

function isInsideTableCell($, node) {
  return $(node).parents('td, th').length > 0;
}

function getPreviousSibling(node) {
  return node?.prevSibling ?? node?.prev ?? null;
}

function getNextSibling(node) {
  return node?.nextSibling ?? node?.next ?? null;
}

function isBreakNode(node) {
  return node?.type === 'tag' && node?.name === 'br';
}

function renderPreservedTagPlaceholder({
  block = false,
  context = '',
  kind,
  visibleText = '',
  xml
}) {
  return renderElement(getPreservedTagPlaceholderTag(block), PRESERVED_TAG_SENTINEL, {
    'data-cflmd-preserved': 'true',
    'data-cflmd-kind': kind,
    'data-cflmd-xml-base64': encodeBase64(xml),
    'data-cflmd-visible-text-base64': encodeBase64(visibleText),
    'data-cflmd-block': String(block),
    'data-cflmd-context': context
  });
}

function renderRestoredTagPlaceholder(xml) {
  return renderElement(RESTORED_TAG_PLACEHOLDER, RESTORED_TAG_SENTINEL, {
    'data-cflmd-restored': 'true',
    'data-cflmd-xml-base64': encodeBase64(xml)
  });
}

function renderTocMacro() {
  return '<ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default" />';
}

function renderInfoMacro(markdown) {
  const bodyMarkup = convertMarkdownToStorage(markdown);
  return `<ac:structured-macro ac:name="info" ac:schema-version="1"><ac:rich-text-body>${bodyMarkup}</ac:rich-text-body></ac:structured-macro>`;
}

function renderCodeMacroPlainTextBody(body) {
  return `<ac:plain-text-body data-cflmd-cdata-base64="${escapeHtmlAttribute(encodeBase64(body))}"></ac:plain-text-body>`;
}

function isAttachmentImageSource(source) {
  return ATTACHMENT_IMAGE_PATTERN.test(source.split(/[?#]/, 1)[0] ?? '');
}

function normalizeStorageMarkup(storage) {
  return storage
    .replace(
      /&amp;(apos|lsquo|rsquo|ldquo|rdquo);/g,
      '&$1;'
    )
    .replace(
      /<ac:plain-text-body data-cflmd-cdata-base64="([^"]+)"><\/ac:plain-text-body>/g,
      (_, bodyBase64) =>
        `<ac:plain-text-body><![CDATA[${escapeCdata(decodeBase64(bodyBase64))}]]></ac:plain-text-body>`
    )
    .replace(
      /<span data-cflmd-restored="true" data-cflmd-xml-base64="([^"]+)">cflmd-restored<\/span>/g,
      (_, xmlBase64) => decodeBase64(xmlBase64)
    )
    .replace(
      /<ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default"><\/ac:structured-macro>/g,
      '<ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default" />'
    )
    .replace(
      /<ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default"\/>/g,
      '<ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default" />'
    )
    .replace(
      /<ri:attachment([^>]*)\/>/g,
      '<ri:attachment$1></ri:attachment>'
    )
    .replace(
      /<colgroup\b[\s\S]*?<\/colgroup>/g,
      (markup) => normalizeColgroupMarkup(markup)
    )
    .replaceAll('<br>', '<br />')
    .replaceAll('<hr>', '<hr />');
}

function normalizeColgroupMarkup(markup) {
  const $ = load(`<table>${markup}</table>`, {
    decodeEntities: false
  });
  const colgroup = $('table').children('colgroup').first();

  if (colgroup.length === 0) {
    return markup;
  }

  const attributes = renderCheerioAttributes(colgroup.attr() ?? {});
  const columns = colgroup
    .children('col')
    .toArray()
    .map((node) => `<col${renderCheerioAttributes($(node).attr() ?? {})} />`)
    .join('');

  return `<colgroup${attributes}>${columns}</colgroup>`;
}

function renderCheerioAttributes(attributes) {
  return renderAttributeMap(attributes);
}

function renderElement(tag, content, attributes) {
  return `<${tag}${renderAttributeMap(attributes)}>${content}</${tag}>`;
}

function restoreDetailsMacros(storage) {
  const $ = load(`<root>${storage}</root>`, {
    decodeEntities: false,
    xmlMode: true
  });
  const rootChildren = $('root').contents().toArray();

  for (let index = 0; index < rootChildren.length; index += 1) {
    const node = rootChildren[index];

    if (
      node?.type === 'tag' &&
      node.name === 'ac:structured-macro' &&
      $(node).attr('ac:name') === 'details'
    ) {
      const tableNode = findFollowingRootTable($, rootChildren, index);

      if (!tableNode) {
        continue;
      }

      const macro = $(node);
      let body = macro.children('ac\\:rich-text-body').first();

      if (body.length === 0) {
        body = $('<ac:rich-text-body></ac:rich-text-body>');
        macro.append(body);
      }

      body.empty().append(tableNode);
      continue;
    }

    if (node?.type !== 'tag' || node.name !== 'p') {
      continue;
    }

    const paragraph = $(node);
    const meaningfulChildren = paragraph
      .contents()
      .toArray()
      .filter((child) => child.type !== 'text' || child.data.trim());

    if (
      meaningfulChildren.length === 0 ||
      !meaningfulChildren.every((child) => child.type === 'tag' && child.name === 'ac:parameter') ||
      !meaningfulChildren.some((child) => $(child).attr('ac:name') === 'id')
    ) {
      continue;
    }

    let nextIndex = index + 1;

    while (
      nextIndex < rootChildren.length &&
      rootChildren[nextIndex]?.type === 'text' &&
      !rootChildren[nextIndex].data.trim()
    ) {
      $(rootChildren[nextIndex]).remove();
      nextIndex += 1;
    }

    const tableNode = rootChildren[nextIndex];

    if (tableNode?.type !== 'tag' || tableNode.name !== 'table') {
      continue;
    }

    const macro = $(
      '<ac:structured-macro ac:name="details" ac:schema-version="1" data-layout="default"></ac:structured-macro>'
    );
    const body = $('<ac:rich-text-body></ac:rich-text-body>');

    paragraph.children('ac\\:parameter').each((__, parameterNode) => {
      macro.append(parameterNode);
    });

    body.append(tableNode);
    macro.append(body);
    paragraph.replaceWith(macro);
  }

  return $('root').html()?.trim() ?? storage;
}

function findFollowingRootTable($, rootChildren, index) {
  let nextIndex = index + 1;

  while (
    nextIndex < rootChildren.length &&
    rootChildren[nextIndex]?.type === 'text' &&
    !rootChildren[nextIndex].data.trim()
  ) {
    $(rootChildren[nextIndex]).remove();
    nextIndex += 1;
  }

  const tableNode = rootChildren[nextIndex];
  return tableNode?.type === 'tag' && tableNode.name === 'table' ? tableNode : null;
}

function escapeCdata(text) {
  return String(text).replaceAll(']]>', ']]]]><![CDATA[>');
}
