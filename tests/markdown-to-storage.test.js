import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { formatAtlDocument, parseAtlDocument } from '../lib/atl-document.js';
import {
  formatMarkdownDocument,
  parseMarkdownDocument
} from '../lib/markdown-document.js';
import { convertMarkdownToStorage } from '../lib/markdown-to-storage.js';
import { convertStorageToMarkdown } from '../lib/storage-to-markdown.js';

const fixturesDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url));
const inputFixturePath = join(fixturesDirectory, 'storage-roundtrip-expected.md');
const linkedAttachmentHref = 'https://example.com/diagrams/release-architecture';
const linkedAttachmentFilename = 'release-architecture-overview.jpg';
const metadataClockTime = new Date('2026-03-16T16:50:21Z');

describe('convertMarkdownToStorage', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(metadataClockTime);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('roundtrips the exported markdown fixture back into stable markdown', () => {
    const markdownInput = readFileSync(inputFixturePath, 'utf8');
    const { markdown, metadata } = parseMarkdownDocument(markdownInput);
    const storage = convertMarkdownToStorage(markdown);
    const roundtrippedMarkdown = convertStorageToMarkdown(storage);

    expect(
      formatMarkdownDocument({
        markdown: roundtrippedMarkdown,
        pageId: metadata.pageId,
        versionNumber: metadata.versionNumber
      })
    ).toBe(markdownInput);
  });

  it('preserves the metadata expected by .atl documents when wrapped back up', () => {
    const markdownInput = readFileSync(inputFixturePath, 'utf8');
    const { markdown, metadata } = parseMarkdownDocument(markdownInput);
    const storage = convertMarkdownToStorage(markdown);
    const atl = formatAtlDocument({
      document: storage,
      pageId: metadata.pageId,
      versionNumber: metadata.versionNumber,
      versionTime: metadata.versionTime
    });
    const parsed = parseAtlDocument(atl);

    expect(parsed.metadata).toEqual(metadata);
    expect(parsed.document).toBe(storage);
  });

  it('reimports embedded attachment images exported as wiki-style links', () => {
    const markdownInput = '## Architecture\n\n[[image-20260312-111304.png]]\n';
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain(
      '<ri:attachment ri:filename="image-20260312-111304.png"></ri:attachment>'
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('restores attachment image width from the exported HTML comment', () => {
    const markdownInput = [
      '## Architecture',
      '',
      '<!-- cflmd-image: {"ac:width":"760"} -->',
      '[[image-20260312-111304.png]]',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('ac:custom-width="true"');
    expect(storage).toContain('ac:width="760"');
    expect(storage).toContain(
      '<ri:attachment ri:filename="image-20260312-111304.png"></ri:attachment>'
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('restores linked attachment images from cflmd image comments', () => {
    const markdownInput = [
      `<!-- cflmd-image: {"ac:width":"760","href":"${linkedAttachmentHref}"} -->`,
      `[[${linkedAttachmentFilename}]]`,
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain(`<a href="${linkedAttachmentHref}">`);
    expect(storage).toContain('ac:custom-width="true"');
    expect(storage).toContain('ac:width="760"');
    expect(storage).toContain(
      `<ri:attachment ri:filename="${linkedAttachmentFilename}"></ri:attachment>`
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('does not import the malformed legacy linked-image markdown form', () => {
    const markdownInput =
      `[<!-- cflmd-image: {"ac:width":"760"} -->\n[[${linkedAttachmentFilename}]]](${linkedAttachmentHref})\n`;
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).not.toContain('<ac:image');
    expect(storage).not.toContain('ri:attachment');
    expect(storage).not.toContain('cflmd-image');
    expect(storage).toContain(
      `<p><a href="${linkedAttachmentHref}">[[${linkedAttachmentFilename}]]</a></p>`
    );
  });

  it('reimports TOC comments as TOC macros', () => {
    const markdownInput = ['# Overview', '', '<!-- cflmd-toc -->', '', '## Details', ''].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain(
      '<ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default" />'
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('reimports generic HTML comments as info macros', () => {
    const markdownInput =
      '<!-- **Explain why the project is happening.** When product gaps, PRDs, or postmortems exist, link to them. -->\n';
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toBe(
      '<ac:structured-macro ac:name="info" ac:schema-version="1"><ac:rich-text-body><p><strong>Explain why the project is happening.</strong> When product gaps, PRDs, or postmortems exist, link to them.</p></ac:rich-text-body></ac:structured-macro>'
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('reimports plain markdown links as HTML links', () => {
    const markdownInput = 'See [docs](https://example.com/docs).\n';
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toBe('<p>See <a href="https://example.com/docs">docs</a>.</p>');
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('encodes apostrophes in plain text as XML-safe entities', () => {
    const markdownInput = "it's ready\n";
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toBe('<p>it&apos;s ready</p>');
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('re-encodes typographic apostrophes back to storage entities after markdown roundtrip', () => {
    const markdown = convertStorageToMarkdown('<p>ExampleCo&rsquo;s Logging Guide</p>');
    const storage = convertMarkdownToStorage(markdown);

    expect(markdown).toBe('ExampleCo’s Logging Guide\n');
    expect(storage).toBe('<p>ExampleCo&rsquo;s Logging Guide</p>');
  });

  it('ignores legacy ac:parameter comments on import', () => {
    const markdownInput =
      'Status: \n<!-- cflmd-ac-parameter: {"block":false,"context":"","text":"UmVhZHk=","markup":"PGFjOnBhcmFtZXRlciBhYzpuYW1lPSJ0aXRsZSI+UmVhZHk8L2FjOnBhcmFtZXRlcj4="} -->\nReady.\n';
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toBe('<p>Status: Ready.</p>');
    expect(convertStorageToMarkdown(storage)).toBe('Status: Ready.\n');
  });

  it('reimports ac:link comments as raw ac:link tags', () => {
    const markdownInput =
      'See <!-- cflmd-ac-link: {"block":false,"context":"","text":"RGVzaWduIE5vdGVz","markup":"PGFjOmxpbmsgYWM6Y2FyZC1hcHBlYXJhbmNlPSJpbmxpbmUiPjxyaTpwYWdlIHJpOnNwYWNlLWtleT0iRE9DIiByaTpjb250ZW50LXRpdGxlPSJEZXNpZ24gTm90ZXMiIHJpOnZlcnNpb24tYXQtc2F2ZT0iMiIvPjxhYzpsaW5rLWJvZHk+RGVzaWduIE5vdGVzPC9hYzpsaW5rLWJvZHk+PC9hYzpsaW5rPg=="} -->Design Notes.\n';
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toBe(
      '<p>See <ac:link ac:card-appearance="inline"><ri:page ri:space-key="DOC" ri:content-title="Design Notes" ri:version-at-save="2"/><ac:link-body>Design Notes</ac:link-body></ac:link>.</p>'
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('reimports fenced code blocks as code macros using only the markdown language', () => {
    const markdownInput = [
      '```protobuf',
      'message ReleaseCheck {',
      '  bool ready = 1;',
      '}',
      '```',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<ac:parameter ac:name="language">protobuf</ac:parameter>');
    expect(storage).toContain('<ac:parameter ac:name="breakoutMode">wide</ac:parameter>');
    expect(storage).toContain('<ac:parameter ac:name="breakoutWidth">760</ac:parameter>');
    expect(storage).toContain(
      '<ac:plain-text-body><![CDATA[message ReleaseCheck {\n  bool ready = 1;\n}\n]]></ac:plain-text-body>'
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('reimports markdown-native pipe tables as Confluence tables', () => {
    const markdownInput = [
      '| **Column** | **Value** | **Notes** |',
      '| --- | --- | --- |',
      '| alpha | 1 | plain text cell |',
      '| beta | 2 | contains & entity |',
      '| gamma | 3 | `inline html code` |',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<table data-layout="default" data-table-width="760">');
    expect(storage).toContain('<thead>');
    expect(storage).toContain('<th><p><strong>Column</strong></p></th>');
    expect(storage).toContain('<th><p><strong>Notes</strong></p></th>');
    expect(storage).toContain('<td><p>contains &amp; entity</p></td>');
    expect(storage).toContain('<td><p><code>inline html code</code></p></td>');
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });


  it('reimports centered markdown-native pipe table columns as centered paragraphs', () => {
    const markdownInput = [
      '| **Priority** | **Status** | **Item** |',
      '| :---: | :---: | --- |',
      '| H | M | alpha |',
      '| M | L | beta |',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<th><p style="text-align: center;"><strong>Priority</strong></p></th>');
    expect(storage).toContain('<th><p style="text-align: center;"><strong>Status</strong></p></th>');
    expect(storage).toContain('<td><p style="text-align: center;">H</p></td>');
    expect(storage).toContain('<td><p style="text-align: center;">M</p></td>');
    expect(storage).not.toContain('<td style="text-align:center">');
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('moves raw HTML table cell alignment styles onto inner paragraphs', () => {
    const markdownInput = [
      '<table>',
      '  <colgroup>',
      '    <col style="width: 10%;">',
      '    <col style="width: 20%;">',
      '  </colgroup>',
      '  <tbody>',
      '    <tr>',
      '      <th style="text-align:center">Priority</th>',
      '      <th>Item</th>',
      '    </tr>',
      '    <tr>',
      '      <td style="text-align:center">H</td>',
      '      <td>alpha</td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<colgroup><col style="width: 10%;" /><col style="width: 20%;" /></colgroup>');
    expect(storage).toContain('<th><p style="text-align: center;"><strong>Priority</strong></p></th>');
    expect(storage).toContain('<td><p style="text-align: center;">H</p></td>');
    expect(storage).not.toContain('<th style="text-align:center">');
    expect(storage).not.toContain('<td style="text-align:center">');

    const roundtripped = convertStorageToMarkdown(storage);

    expect(roundtripped).toContain('  <colgroup>');
    expect(roundtripped).toContain('<th style="text-align:center">**Priority**</th>');
    expect(roundtripped).toContain('<td style="text-align:center">H</td>');
    expect(roundtripped).toContain('  <thead>');
  });

  it('ignores legacy preserved code parameter comments before fenced code blocks', () => {
    const markdownInput = [
      '<!-- cflmd-ac-parameter: {"block":true,"context":"code","text":"","markup":"PGFjOnBhcmFtZXRlciBhYzpuYW1lPSJsYW5ndWFnZSI+anNvbjwvYWM6cGFyYW1ldGVyPg=="} -->',
      '',
      '<!-- cflmd-ac-parameter: {"block":true,"context":"code","text":"","markup":"PGFjOnBhcmFtZXRlciBhYzpuYW1lPSJicmVha291dE1vZGUiPndpZGU8L2FjOnBhcmFtZXRlcj4="} -->',
      '',
      '<!-- cflmd-ac-parameter: {"block":true,"context":"code","text":"","markup":"PGFjOnBhcmFtZXRlciBhYzpuYW1lPSJicmVha291dFdpZHRoIj4xMDExPC9hYzpwYXJhbWV0ZXI+"} -->',
      '',
      '```json',
      '{"ready":true}',
      '```',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<ac:parameter ac:name="language">json</ac:parameter>');
    expect(storage).toContain('<ac:parameter ac:name="breakoutMode">wide</ac:parameter>');
    expect(storage).toContain('<ac:parameter ac:name="breakoutWidth">760</ac:parameter>');
    expect(storage).not.toContain('<ac:parameter ac:name="breakoutWidth">1011</ac:parameter>');
    expect(storage).toContain(
      '<ac:plain-text-body><![CDATA[{"ready":true}\n]]></ac:plain-text-body>'
    );
    expect(convertStorageToMarkdown(storage)).toBe('```json\n{"ready":true}\n```\n');
  });

  it('reimports preserved ac:link tags inside raw HTML tables', () => {
    const markdownInput = [
      '<table>',
      '  <tbody>',
      '    <tr>',
      '      <td>alpha</td>',
      '      <td><!-- cflmd-ac-link: {"block":false,"context":"","text":"RGVzaWduIE5vdGVz","markup":"PGFjOmxpbmsgYWM6Y2FyZC1hcHBlYXJhbmNlPSJpbmxpbmUiPjxyaTpwYWdlIHJpOnNwYWNlLWtleT0iRE9DIiByaTpjb250ZW50LXRpdGxlPSJEZXNpZ24gTm90ZXMiIHJpOnZlcnNpb24tYXQtc2F2ZT0iMiIvPjxhYzpsaW5rLWJvZHk+RGVzaWduIE5vdGVzPC9hYzpsaW5rLWJvZHk+PC9hYzpsaW5rPg=="} -->Design Notes</td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<td><p>alpha</p></td>');
    expect(storage).toContain(
      '<ac:link ac:card-appearance="inline"><ri:page ri:space-key="DOC" ri:content-title="Design Notes" ri:version-at-save="2"/><ac:link-body>Design Notes</ac:link-body></ac:link>'
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('does not preserve formatting whitespace around visible preserved tags in raw HTML table cells', () => {
    const markdownInput = [
      '<table>',
      '  <tbody>',
      '    <tr>',
      '      <td>',
      '        <!-- cflmd-ac-link: {"block":false,"context":"","text":"RGVzaWduIE5vdGVz","markup":"PGFjOmxpbmsgYWM6Y2FyZC1hcHBlYXJhbmNlPSJpbmxpbmUiPjxyaTpwYWdlIHJpOnNwYWNlLWtleT0iRE9DIiByaTpjb250ZW50LXRpdGxlPSJEZXNpZ24gTm90ZXMiIHJpOnZlcnNpb24tYXQtc2F2ZT0iMiIvPjxhYzpsaW5rLWJvZHk+RGVzaWduIE5vdGVzPC9hYzpsaW5rLWJvZHk+PC9hYzpsaW5rPg=="} -->',
      '        Design Notes',
      '      </td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain(
      '<td><p><ac:link ac:card-appearance="inline"><ri:page ri:space-key="DOC" ri:content-title="Design Notes" ri:version-at-save="2"/><ac:link-body>Design Notes</ac:link-body></ac:link></p></td>'
    );
    expect(storage).not.toContain('</ac:link>\n');
  });

  it('does not preserve formatting whitespace around empty preserved tags in raw HTML table cells', () => {
    const markdownInput = [
      '<table>',
      '  <tbody>',
      '    <tr>',
      '      <td>',
      '        <!-- cflmd-ac-link: {"block":false,"context":"","text":"","markup":"PGFjOmxpbms+PHJpOnVzZXIgcmk6YWNjb3VudC1pZD0idXNlci0xIi8+PC9hYzpsaW5rPg=="} -->',
      '      </td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain(
      '<td><p><ac:link><ri:user ri:account-id="user-1"/></ac:link></p></td>'
    );
    expect(storage).not.toContain('<p>\n');
  });

  it('reimports markdown strong syntax inside raw HTML tables', () => {
    const markdownInput = [
      '<table>',
      '  <tbody>',
      '    <tr>',
      '      <th>**Column**</th>',
      '      <td>**Ready**</td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);
    const roundtripped = convertStorageToMarkdown(storage);

    expect(storage).toContain('<th><p><strong>Column</strong></p></th>');
    expect(storage).toContain('<td><p><strong>Ready</strong></p></td>');
    expect(roundtripped).toContain('<th>**Column**</th>');
    expect(roundtripped).toContain('<td>**Ready**</td>');
  });

  it('ignores wrapper whitespace and supports block markdown inside raw HTML table cells', () => {
    const markdownInput = [
      '<table>',
      '  <tbody>',
      '    <tr>',
      '      <td>',
      '        Summary',
      '',
      '        - **Architecture**',
      '        - [Runbook](https://example.com/runbook)',
      '',
      '        > Reviewed',
      '      </td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);
    const roundtripped = convertStorageToMarkdown(storage);

    expect(storage).toContain('<td><p>Summary</p><ul>');
    expect(storage).toContain('<li><p><strong>Architecture</strong></p></li>');
    expect(storage).toContain(
      '<li><p><a href="https://example.com/runbook">Runbook</a></p></li>'
    );
    expect(storage).toContain('<p style="margin-left: 30.0px;">Reviewed</p></td>');
    expect(storage).not.toContain('<td><p></p>');
    expect(roundtripped).toContain('- **Architecture**');
    expect(roundtripped).toContain('- [Runbook](https://example.com/runbook)');
    expect(roundtripped).toContain('> Reviewed');
    expect(roundtripped).not.toContain('<ul>');
  });

  it('supports nested bullet markdown inside raw HTML table cells', () => {
    const markdownInput = [
      '<table>',
      '  <tbody>',
      '    <tr>',
      `      <td>
  - outer bullet
    - inner bullet
</td>`,
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);
    const roundtripped = convertStorageToMarkdown(storage);

    expect(storage).toContain('<td><ul>');
    expect(storage).toContain('<li><p>outer bullet</p><ul>');
    expect(storage).toContain('<li><p>inner bullet</p></li>');
    expect(roundtripped).toContain(
      '<td>\n        - outer bullet\n            - inner bullet\n      </td>'
    );
    expect(roundtripped).not.toContain('<ul>');
  });

  it('roundtrips colgroup tags inside raw HTML tables', () => {
    const markdownInput = [
      '<table>',
      '  <colgroup>',
      '    <col style="width: 30%;">',
      '    <col style="width: 70%;">',
      '  </colgroup>',
      '  <tbody>',
      '    <tr>',
      '      <td>alpha</td>',
      '      <td>beta</td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<colgroup><col style="width: 30%;" /><col style="width: 70%;" /></colgroup>');
    expect(storage).not.toContain('</col>');
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('reimports markdown checklists as Confluence task lists', () => {
    const markdownInput = ['- [x] Ship the release', '- [ ] Write the docs', ''].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<ac:task-list ac:task-list-id="cflmd-task-list-1">');
    expect(storage).toContain('<ac:task-status>complete</ac:task-status>');
    expect(storage).toContain('<ac:task-status>incomplete</ac:task-status>');
    expect(storage).toContain('<ac:task-body>Ship the release</ac:task-body>');
    expect(storage).toContain('<ac:task-body>Write the docs</ac:task-body>');
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('splits mixed bullet and checklist markdown into a list followed by a task list', () => {
    const markdownInput = [
      '- **System events**: stored in the EU or US based on application log region.',
      '- **Audit events**: always stored in the US.',
      '',
      '- [ ] <!-- cflmd-ac-link: {"block":false,"context":"","text":"","markup":"PGFjOmxpbms+PHJpOnVzZXIgcmk6YWNjb3VudC1pZD0idXNlci1sZWdhbCIvPjwvYWM6bGluaz4="} --> to confirm from Legal perspective',
      '- [ ] <!-- cflmd-ac-link: {"block":false,"context":"","text":"","markup":"PGFjOmxpbms+PHJpOnVzZXIgcmk6YWNjb3VudC1pZD0idXNlci1zZWN1cml0eSIvPjwvYWM6bGluaz4="} --> to confirm from Security perspective',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<ul><li>');
    expect(storage).toContain(
      '<p><strong>System events</strong>: stored in the EU or US based on application log region.</p>'
    );
    expect(storage).toContain(
      '<p><strong>Audit events</strong>: always stored in the US.</p>'
    );
    expect(storage).toContain('<ac:task-list ac:task-list-id="cflmd-task-list-1">');
    expect(storage).toContain('<ac:task-body><ac:link><ri:user ri:account-id="user-legal"/></ac:link> to confirm from Legal perspective</ac:task-body>');
    expect(storage).toContain('<ac:task-body><ac:link><ri:user ri:account-id="user-security"/></ac:link> to confirm from Security perspective</ac:task-body>');
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('does not preserve a trailing newline before nested bullet lists on import', () => {
    const markdownInput = ['- line 1', '  - line 2', '  - line 3', ''].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<li><p>line 1</p><ul>');
    expect(storage).not.toContain('<li><p>line 1\n</p><ul>');
  });

  it('reimports markdown checklists inside raw HTML table cells as Confluence task lists', () => {
    const markdownInput = [
      '<table>',
      '  <tbody>',
      '    <tr>',
      '      <td>- [ ] <!-- cflmd-ac-link: {"block":false,"context":"","text":"RGVzaWduIE5vdGVz","markup":"PGFjOmxpbmsgYWM6Y2FyZC1hcHBlYXJhbmNlPSJpbmxpbmUiPjxyaTpwYWdlIHJpOnNwYWNlLWtleT0iRE9DIiByaTpjb250ZW50LXRpdGxlPSJEZXNpZ24gTm90ZXMiIHJpOnZlcnNpb24tYXQtc2F2ZT0iMiIvPjxhYzpsaW5rLWJvZHk+RGVzaWduIE5vdGVzPC9hYzpsaW5rLWJvZHk+PC9hYzpsaW5rPg=="} -->Design Notes</td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
      ''
    ].join('\n');
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain('<ac:task-list ac:task-list-id="cflmd-task-list-1">');
    expect(storage).toContain('<ac:task-status>incomplete</ac:task-status>');
    expect(storage).toContain(
      '<ac:link ac:card-appearance="inline"><ri:page ri:space-key="DOC" ri:content-title="Design Notes" ri:version-at-save="2"/><ac:link-body>Design Notes</ac:link-body></ac:link>'
    );
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });

  it('roundtrips details tables with markdown checklist rows and preserved macros', () => {
    const storageInput =
      '<ac:structured-macro ac:name="details" ac:schema-version="1"><ac:parameter ac:name="id">release-notes</ac:parameter><ac:rich-text-body><table><tbody><tr><th><p><strong>Status</strong></p></th><td><p><ac:structured-macro ac:name="status" ac:schema-version="1"><ac:parameter ac:name="title">Ready</ac:parameter><ac:parameter ac:name="colour">Green</ac:parameter></ac:structured-macro></p></td></tr><tr><th><p><strong>Reviewers</strong></p></th><td><ac:task-list ac:task-list-id="task-list-1"><ac:task><ac:task-id>1</ac:task-id><ac:task-uuid>1</ac:task-uuid><ac:task-status>incomplete</ac:task-status><ac:task-body><span class="placeholder-inline-tasks"><ac:link><ri:user ri:account-id="user-1" /></ac:link> </span></ac:task-body></ac:task></ac:task-list></td></tr><tr><th><p><strong>References</strong></p></th><td><p>Supporting documents</p><ul><li><p><ac:structured-macro ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">OPS-42</ac:parameter><ac:parameter ac:name="serverId">server-1</ac:parameter><ac:parameter ac:name="server">Example Jira</ac:parameter></ac:structured-macro></p></li></ul></td></tr></tbody></table></ac:rich-text-body></ac:structured-macro><ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default" />';
    const markdown = convertStorageToMarkdown(storageInput);
    const storage = convertMarkdownToStorage(markdown);

    expect(markdown).toContain('- [ ]');
    expect(markdown).toContain('- [ ] <!-- cflmd-ac-link:');
    expect(markdown).toContain('<!-- cflmd-ac-structured-macro:');
    expect(markdown).not.toContain('<!-- cflmd-ac-parameter:');
    expect(storage).toContain('<ac:structured-macro ac:name="details"');
    expect(storage).toContain('<ac:task-list ac:task-list-id="cflmd-task-list-1">');
    expect(storage).toContain('<ac:structured-macro ac:name="status"');
    expect(storage).toContain('<ac:structured-macro ac:name="jira"');
    expect(storage).toContain(
      '<ac:structured-macro ac:name="toc" ac:schema-version="1" data-layout="default" />'
    );
  });

  it('reimports checklist user links without inserting a leading line break', () => {
    const markdownInput =
      '- [ ] <!-- cflmd-ac-link: {"block":false,"context":"","text":"","markup":"PGFjOmxpbms+PHJpOnVzZXIgcmk6YWNjb3VudC1pZD0idXNlci0xIi8+PC9hYzpsaW5rPg=="} -->\n';
    const storage = convertMarkdownToStorage(markdownInput);

    expect(storage).toContain(
      '<ac:task-body><ac:link><ri:user ri:account-id="user-1"/></ac:link></ac:task-body>'
    );
    expect(storage).not.toContain('<ac:task-body><br/>');
    expect(convertStorageToMarkdown(storage)).toBe(markdownInput);
  });
});
