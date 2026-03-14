import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseAtlDocument } from '../lib/atl-document.js';
import { parseMarkdownDocument } from '../lib/markdown-document.js';
import { convertStorageToMarkdown } from '../lib/storage-to-markdown.js';

const fixturesDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url));
const storageFixturePath = join(fixturesDirectory, 'storage-roundtrip-input.atl');
const sourceFixturePath = join(fixturesDirectory, 'storage-roundtrip-source.md');
const expectedFixturePath = join(fixturesDirectory, 'storage-roundtrip-expected.md');
const linkedAttachmentHref = 'https://example.com/diagrams/release-architecture';
const linkedAttachmentFilename = 'release-architecture-overview.jpg';
const preservedLinkTitle = 'ExampleCo’s Logging Guide';

describe('convertStorageToMarkdown', () => {
  it('converts the captured Confluence storage fixture into stable markdown', () => {
    const inputText = readFileSync(storageFixturePath, 'utf8');
    const expectedText = readFileSync(expectedFixturePath, 'utf8');
    const { document: storage } = parseAtlDocument(inputText);
    const { markdown: expected } = parseMarkdownDocument(expectedText);

    expect(convertStorageToMarkdown(storage)).toBe(expected);
  });

  it('preserves the current source fixture scope and section structure', () => {
    const inputText = readFileSync(storageFixturePath, 'utf8');
    const sourceText = readFileSync(sourceFixturePath, 'utf8');
    const { document: storage } = parseAtlDocument(inputText);
    const { markdown: source } = parseMarkdownDocument(sourceText);
    const converted = convertStorageToMarkdown(storage);
    const sourceHeadings = extractHeadingTexts(source);
    const convertedHeadings = extractHeadingTexts(converted);

    expect(convertedHeadings).toEqual(sourceHeadings);
    expect(converted).toContain('> Outer blockquote paragraph with *inline emphasis*.');
    expect(converted).toContain('> > Nested blockquote paragraph with `inline code`.');
    expect(converted).toContain(
      '> Back in the outer blockquote with an [inline link](https://commonmark.org/).'
    );
    expect(converted).toContain('Standard markdown image:');
    expect(converted).toContain('![Standard markdown image](images/standard-image.png)');
    expect(converted).toContain('Autolink: <https://www.example.org/docs>');
    expect(converted).toContain('```json');
    expect(converted).toContain('<table>');
  });

  it('exports attachment images with ac:width as a preceding HTML comment', () => {
    const converted = convertStorageToMarkdown(
      '<h2>Architecture</h2><ac:image ac:align="center" ac:layout="center" ac:alt="image-20260312-111304.png" ac:custom-width="true" ac:width="760"><ri:attachment ri:filename="image-20260312-111304.png" /></ac:image>'
    );

    expect(converted).toContain('<!-- cflmd-image: {"ac:width":"760"} -->');
    expect(converted).toContain('[[image-20260312-111304.png]]');
  });

  it('exports linked attachment images without wrapping the image syntax in a markdown link', () => {
    const converted = convertStorageToMarkdown(
      `<p><a href="${linkedAttachmentHref}"><ac:image ac:align="center" ac:layout="center" ac:custom-width="true" ac:width="760"><ri:attachment ri:filename="${linkedAttachmentFilename}" /></ac:image></a></p>`
    );

    expect(converted).toContain(
      `<!-- cflmd-image: {"ac:width":"760","href":"${linkedAttachmentHref}"} -->`
    );
    expect(converted).toContain(`[[${linkedAttachmentFilename}]]`);
    expect(converted).not.toContain(`]]](${linkedAttachmentHref})`);
  });

  it('exports TOC macros as a cflmd HTML comment', () => {
    const converted = convertStorageToMarkdown(
      '<h1>Overview</h1><ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default" ac:local-id="generated-local-id" ac:macro-id="generated-macro-id" /><h2>Details</h2>'
    );

    expect(converted).toContain('# Overview');
    expect(converted).toContain('<!-- cflmd-toc -->');
    expect(converted).toContain('## Details');
  });

  it('exports info macros as plain HTML comments with markdown content', () => {
    const converted = convertStorageToMarkdown(
      '<ac:structured-macro ac:name="info" ac:schema-version="1"><ac:rich-text-body><p><strong>Explain why the project is happening.</strong> When product gaps, PRDs, or postmortems exist, link to them.</p></ac:rich-text-body></ac:structured-macro>'
    );

    expect(converted).toBe(
      '<!-- **Explain why the project is happening.** When product gaps, PRDs, or postmortems exist, link to them. -->\n'
    );
  });

  it('exports plain HTML links as markdown links', () => {
    const converted = convertStorageToMarkdown(
      '<p>See <a href="https://example.com/docs">docs</a>.</p>'
    );

    expect(converted).toBe('See [docs](https://example.com/docs).\n');
  });

  it('exports ac:link tags as comments with visible text', () => {
    const converted = convertStorageToMarkdown(
      '<p>See <ac:link ac:card-appearance="inline"><ri:page ri:space-key="DOC" ri:content-title="Design Notes" ri:version-at-save="2" /><ac:link-body>Design Notes</ac:link-body></ac:link>.</p>'
    );

    expect(converted).toContain('See <!-- cflmd-ac-link:');
    expect(converted).toContain('<!-- cflmd-ac-link:');
    expect(converted).toContain('Design Notes.');
    expect(converted).not.toContain('\n<!-- cflmd-ac-link:');
  });

  it('decodes HTML entities in preserved link text', () => {
    const converted = convertStorageToMarkdown(
      `<p>See <ac:link ac:card-appearance="inline"><ri:page ri:space-key="SEC" ri:content-title="Logging Guide" ri:version-at-save="15" /><ac:link-body>${preservedLinkTitle.replace('’', '&rsquo;')}</ac:link-body></ac:link>.</p>`
    );

    expect(converted).toContain(`${preservedLinkTitle}.`);
    expect(converted).not.toContain('&rsquo;');
  });

  it('exports code macros as fenced code blocks without preserved macro comments', () => {
    const converted = convertStorageToMarkdown(
      '<ac:structured-macro ac:name="code" ac:schema-version="1"><ac:parameter ac:name="language">json</ac:parameter><ac:parameter ac:name="breakoutMode">wide</ac:parameter><ac:parameter ac:name="breakoutWidth">1011</ac:parameter><ac:plain-text-body>{"ready":true}</ac:plain-text-body></ac:structured-macro>'
    );

    expect(converted).not.toContain('<!-- cflmd-ac-structured-macro:');
    expect(converted).not.toContain('<!-- cflmd-ac-parameter:');
    expect(converted).toContain('```json');
  });

  it('preserves angle-bracketed text inside code macro CDATA', () => {
    const converted = convertStorageToMarkdown(
      '<ac:structured-macro ac:name="code" ac:schema-version="1"><ac:plain-text-body><![CDATA[On Sat 14 Mar 2026 at 14:45, X Y <x.y@z.com>\nwrote:\n\n> Just saw this\n>]]></ac:plain-text-body></ac:structured-macro>'
    );

    expect(converted).toContain('On Sat 14 Mar 2026 at 14:45, X Y <x.y@z.com>');
    expect(converted).toContain('\n> Just saw this\n>');
  });

  it('exports preserved ac:link tags inside raw HTML tables', () => {
    const converted = convertStorageToMarkdown(
      '<table><tbody><tr><td>alpha</td><td><ac:link ac:card-appearance="inline"><ri:page ri:space-key="DOC" ri:content-title="Design Notes" ri:version-at-save="2" /><ac:link-body>Design Notes</ac:link-body></ac:link></td></tr></tbody></table>'
    );

    expect(converted).toContain('<td>alpha</td>');
    expect(converted).toContain('<td><!-- cflmd-ac-link:');
    expect(converted).toContain('-->Design Notes</td>');
  });

  it('exports strong tags inside raw HTML tables as markdown strong syntax', () => {
    const converted = convertStorageToMarkdown(
      '<table><tbody><tr><th><p><strong>Column</strong></p></th><td><p><strong>Ready</strong></p></td></tr></tbody></table>'
    );

    expect(converted).toContain('<th>**Column**</th>');
    expect(converted).toContain('<td>**Ready**</td>');
  });

  it('exports colgroup tags inside raw HTML tables', () => {
    const converted = convertStorageToMarkdown(
      '<table><colgroup><col style="width: 30%;" /><col style="width: 70%;" /></colgroup><tbody><tr><td><p>alpha</p></td><td><p>beta</p></td></tr></tbody></table>'
    );

    expect(converted).toContain('  <colgroup>');
    expect(converted).toContain('    <col style="width: 30%;">');
    expect(converted).toContain('    <col style="width: 70%;">');
  });

  it('preserves colgroup when promoting a header row into thead', () => {
    const converted = convertStorageToMarkdown(
      '<table><colgroup><col style="width: 143.0px;" /><col style="width: 583.0px;" /></colgroup><tbody><tr><th><p><strong>Authors</strong></p></th><td><p>alice</p></td></tr><tr><th><p><strong>Status</strong></p></th><td><p>ready</p></td></tr></tbody></table>'
    );

    expect(converted).toContain('  <colgroup>');
    expect(converted).toContain('    <col style="width: 143.0px;">');
    expect(converted).toContain('    <col style="width: 583.0px;">');
    expect(converted).toContain('  <thead>');
  });

  it('exports preserved ac:structured-macro tags inside raw HTML tables', () => {
    const converted = convertStorageToMarkdown(
      '<table><tbody><tr><td><ac:structured-macro ac:name="status" ac:schema-version="1"><ac:parameter ac:name="title">Ready</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro></td><td><ac:structured-macro ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">OPS-42</ac:parameter><ac:parameter ac:name="serverId">server-1</ac:parameter><ac:parameter ac:name="server">Example Jira</ac:parameter></ac:structured-macro></td></tr></tbody></table>'
    );

    expect(converted).toContain('<td>\n        <!-- cflmd-ac-structured-macro:');
    expect(converted).toContain('\n        Ready\n      </td>');
    expect(converted).toContain('\n        OPS-42\n      </td>');
  });

  it('omits formatting-only blank lines between preserved comments in HTML table cells', () => {
    const converted = convertStorageToMarkdown(
      '<table><tbody><tr><td><ac:link><ri:user ri:account-id="user-a" /></ac:link> <ac:link><ri:user ri:account-id="user-b" /></ac:link></td></tr></tbody></table>'
    );

    expect(converted).toContain('<td><!-- cflmd-ac-link:');
    expect(converted).toContain('--> <!-- cflmd-ac-link:');
  });

  it('exports Confluence task lists as markdown checklists', () => {
    const converted = convertStorageToMarkdown(
      '<ac:task-list ac:task-list-id="task-list-1"><ac:task><ac:task-id>1</ac:task-id><ac:task-uuid>1</ac:task-uuid><ac:task-status>complete</ac:task-status><ac:task-body>Ship the release</ac:task-body></ac:task><ac:task><ac:task-id>2</ac:task-id><ac:task-uuid>2</ac:task-uuid><ac:task-status>incomplete</ac:task-status><ac:task-body>Write the docs</ac:task-body></ac:task></ac:task-list>'
    );

    expect(converted).toBe('- [x] Ship the release\n- [ ] Write the docs\n');
  });

  it('exports details tables with markdown checklist rows and preserved macros', () => {
    const converted = convertStorageToMarkdown(
      '<ac:structured-macro ac:name="details" ac:schema-version="1"><ac:parameter ac:name="id">release-notes</ac:parameter><ac:rich-text-body><table><tbody><tr><th><p><strong>Status</strong></p></th><td><p><ac:structured-macro ac:name="status" ac:schema-version="1"><ac:parameter ac:name="title">Ready</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro></p></td></tr><tr><th><p><strong>Reviewers</strong></p></th><td><ac:task-list ac:task-list-id="task-list-1"><ac:task><ac:task-id>1</ac:task-id><ac:task-uuid>1</ac:task-uuid><ac:task-status>incomplete</ac:task-status><ac:task-body><span class="placeholder-inline-tasks"><ac:link><ri:user ri:account-id="user-1" /></ac:link> </span></ac:task-body></ac:task></ac:task-list></td></tr><tr><th><p><strong>References</strong></p></th><td><p>Supporting documents</p><ul><li><p><ac:structured-macro ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">OPS-42</ac:parameter><ac:parameter ac:name="serverId">server-1</ac:parameter><ac:parameter ac:name="server">Example Jira</ac:parameter></ac:structured-macro></p></li></ul></td></tr></tbody></table></ac:rich-text-body></ac:structured-macro><ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default" />'
    );

    expect(converted).toContain('<!-- cflmd-ac-structured-macro:');
    expect(converted).toContain('<td>\n        <!-- cflmd-ac-structured-macro:');
    expect(converted).toContain('\n        Ready\n      </td>');
    expect(converted).not.toContain('<!-- cflmd-ac-parameter:');
    expect(converted).toContain('<td>- [ ] <!-- cflmd-ac-link:');
    expect(converted).toContain('<!-- cflmd-ac-link:');
    expect(converted).toContain('<ul>');
    expect(converted).toContain('OPS-42');
    expect(converted).toContain('<!-- cflmd-toc -->');
  });

  it('exports checklist user links inline with the checklist marker', () => {
    const converted = convertStorageToMarkdown(
      '<ac:task-list ac:task-list-id="task-list-1"><ac:task><ac:task-id>1</ac:task-id><ac:task-uuid>1</ac:task-uuid><ac:task-status>incomplete</ac:task-status><ac:task-body><span class="placeholder-inline-tasks"><ac:link><ri:user ri:account-id="user-1" /></ac:link> </span></ac:task-body></ac:task></ac:task-list>'
    );

    expect(converted).toBe(
      '- [ ] <!-- cflmd-ac-link: {"block":false,"context":"","text":"","markup":"PGFjOmxpbms+PHJpOnVzZXIgcmk6YWNjb3VudC1pZD0idXNlci0xIi8+PC9hYzpsaW5rPg=="} -->\n'
    );
  });
});

function extractHeadingTexts(markdown) {
  const headings = [];
  const lines = markdown.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const atxMatch = line.match(/^#{1,6}\s+(.*)$/);

    if (atxMatch) {
      headings.push(atxMatch[1]);
      continue;
    }

    const nextLine = lines[index + 1] ?? '';
    if (/^=+$/.test(nextLine) || /^-+$/.test(nextLine)) {
      headings.push(line);
      index += 1;
    }
  }

  return headings;
}
