## Summary

Research conducted on 2026-03-16 in the `Europe/London` timezone.

`cflmd` is a Node.js ESM command-line tool for moving Confluence page content between Atlassian Confluence storage markup and Markdown. The executable entry point is `cflmd`, which forwards to `main()` in `lib/cli.js` and dispatches four subcommands: `get`, `export`, `import`, and `put` (`cflmd:1-8`, `lib/cli.js:10-70`, `lib/help.js:1-119`).

The runtime code is concentrated under `lib/`. The command modules coordinate argument parsing, I/O, metadata wrapping, format conversion, and Confluence API requests (`lib/commands/get.js:10-59`, `lib/commands/export.js:16-94`, `lib/commands/import.js:15-92`, `lib/commands/put.js:10-62`). The two largest subsystems are the format converters:

- `lib/storage-to-markdown.js` converts Confluence storage markup into Markdown by preprocessing XML-like storage with Cheerio, translating unsupported constructs into `cflmd-*` HTML comments and placeholders, and then running Turndown (`lib/storage-to-markdown.js:23-764`).
- `lib/markdown-to-storage.js` converts Markdown back into storage markup by rendering with Markdown-It, expanding the `cflmd-*` comments back into placeholders, transforming the DOM into Confluence constructs, and normalizing the emitted storage markup (`lib/markdown-to-storage.js:52-1292`).

The repository also contains packaging and release automation for standalone binaries, npm artifacts, and a Homebrew formula (`package.json:24-56`, `Makefile:1-39`, `scripts/build-dist.mjs:42-478`, `scripts/build-release-assets.mjs:23-126`, `scripts/build-release-candidate.mjs:23-186`, `scripts/render-homebrew-formula.mjs:3-85`, `scripts/versioning.mjs:8-130`, `scripts/bump:1-102`), plus a Vitest suite that exercises the CLI, API adapter, both conversion directions, versioning helpers, and roundtrip fixtures (`tests/cli.test.js:42-1204`, `tests/confluence-api.test.js:14-224`, `tests/storage-to-markdown.test.js:19-230`, `tests/markdown-to-storage.test.js:20-418`, `tests/versioning.test.js:13-62`).

This repository does not contain the `source.yaml` file referenced by `research_codebase.md`. For this run, the documented scope is the tracked implementation, build, and test files that define the current behavior: `cflmd`, `Makefile`, `package.json`, `lib/**/*.js`, `scripts/*`, and `tests/**/*`.

## Coding Style and Conventions

- JavaScript modules use ECMAScript module syntax with `import`/`export`, named exports, and a function-oriented structure rather than classes. The only class in the runtime is `CommandLineError` in `lib/command-line-error.js:1-7`.
- Runtime files use two-space indentation, semicolons, single-quoted strings, and trailing commas only where multiline literals already contain them (`lib/cli.js:1-70`, `lib/options.js:3-196`, `lib/confluence-api.js:6-246`).
- Constants that represent protocol markers or regexes use `UPPER_SNAKE_CASE`, while helper functions and variables use `camelCase` (`lib/cflmd-comment-utils.js:1-43`, `lib/storage-to-markdown.js:18-21`, `lib/markdown-to-storage.js:17-43`).
- File names are kebab-case. Command modules are grouped under `lib/commands/` and expose `run<Name>Command` functions (`lib/commands/export.js:16-94`, `lib/commands/get.js:10-59`, `lib/commands/import.js:15-92`, `lib/commands/put.js:10-62`).
- Small formatting and parsing helpers are split into single-purpose modules: metadata parsing, document wrappers, stream reading, HTML/base64 utilities, and `cflmd-*` comment helpers (`lib/confluence-metadata.js:1-68`, `lib/atl-document.js:1-19`, `lib/markdown-document.js:1-27`, `lib/read-stream.js:1-13`, `lib/markup-utils.js:1-35`, `lib/cflmd-comment-utils.js:1-43`).
- The CLI entrypoint and command handlers accept injected dependencies such as `argv`, `env`, `fetchImpl`, `stdin`, `stdout`, and `stderr`, which the tests use directly instead of shelling out to the executable (`lib/cli.js:17-70`, `tests/cli.test.js:42-1204`).
- Help text is assembled as arrays of lines joined with `\n`, keeping usage text close to the command modules that consume it (`lib/help.js:1-119`).
- The build and release scripts follow the same two-space JavaScript formatting, use `async` functions for top-level workflows, and centralize process spawning through local `run()`/`capture()` helpers (`scripts/build-dist.mjs:42-478`, `scripts/build-release-assets.mjs:23-126`, `scripts/build-release-candidate.mjs:23-186`).
- Tests use Vitest with top-level `describe()` blocks and sentence-style `it()` names that document behaviors and edge cases (`tests/cli.test.js:42-1204`, `tests/confluence-api.test.js:14-224`, `tests/storage-to-markdown.test.js:19-230`, `tests/markdown-to-storage.test.js:20-418`, `tests/versioning.test.js:13-62`).
- The `Makefile` uses tab-indented recipes and exposes a small command surface for install, test, cleaning, cache cleaning, and distribution builds (`Makefile:10-39`).

## Detailed Findings

### CLI Entry Points and Public Surface

- `package.json` defines the package as ESM, exports `./lib/index.js`, registers the `cflmd` binary, and declares runtime dependencies on `cheerio`, `markdown-it`, `turndown`, and `turndown-plugin-gfm` (`package.json:2-56`).
- The executable shim in `cflmd` imports `main()` from `lib/cli.js`, awaits it, and copies a numeric result into `process.exitCode` (`cflmd:1-8`).
- `lib/index.js` re-exports the document wrappers, metadata helpers, Confluence API helpers, both converters, and `main()` for programmatic use (`lib/index.js:1-22`).
- `lib/version.js` stores the CLI version string as a standalone module, which the CLI and release tooling both reference (`lib/version.js:1`, `scripts/versioning.mjs:46-59`).
- The command dispatcher in `lib/cli.js` maps the four subcommand names to handler functions and resolves credentials from root options or environment variables before handing control to the command module (`lib/cli.js:10-70`).

### Argument Parsing, Help Text, and I/O Helpers

- `parseRootArguments()` accepts `--help`, `--version`/`-v`, `--user`, and `--token` before the subcommand, and stops scanning when it reaches the first non-option token (`lib/options.js:3-74`).
- `parseGetArguments()`, `parseExportArguments()`, `parseImportArguments()`, and `parsePutArguments()` all delegate to `parseCommandArguments()` with feature flags for `--input`, `--output`, and `--force` (`lib/options.js:76-167`).
- `parseCommandArguments()` collects positional arguments, rejects unknown options, and explicitly rejects `--user` and `--token` after the subcommand (`lib/options.js:104-196`).
- `lib/help.js` holds separately formatted usage text for the root CLI and all four commands, including the distinction that global options must appear before `get` and `put`, and that `export`/`import` can use stdin (`lib/help.js:1-119`).
- `requireAtlassianCredentials()` reads already-resolved global options and throws when the Atlassian user or token is absent (`lib/command-helpers.js:5-17`).
- `readTextInput()` and `writeTextOutput()` provide the shared file-or-stdio behavior used by all command modules (`lib/command-helpers.js:28-43`).
- `readStream()` reads a whole stream as UTF-8 text and is used for stdin-based command execution (`lib/read-stream.js:1-13`, `lib/command-helpers.js:28-33`).

### Metadata and Document Wrappers

- `lib/confluence-metadata.js` defines the `<!-- cflmd-metadata: ... -->` header format, parses a leading metadata comment from a document, normalizes `pageId` to a string, and requires `version.number` to be numeric (`lib/confluence-metadata.js:1-68`).
- `formatAtlDocument()` prepends the metadata header to a storage document, while `parseAtlDocument()` removes it and returns `{ document, metadata }` (`lib/atl-document.js:1-19`).
- `formatMarkdownDocument()` writes the same metadata comment followed by a blank line and the Markdown body, and `parseMarkdownDocument()` strips a single leading blank line after the metadata block when present (`lib/markdown-document.js:1-27`).
- The metadata model is shared by the `get`, `export`, `import`, and `put` flows as well as the conversion tests and fixtures (`lib/commands/get.js:40-53`, `lib/commands/export.js:54-68`, `lib/commands/import.js:51-59`, `tests/fixtures/storage-roundtrip-input.atl:1-7`, `tests/fixtures/storage-roundtrip-expected.md:1-112`).

### Confluence API Adapter

- `resolvePageEndpoint()` accepts a Confluence page URL, extracts the numeric `/pages/<id>` path segment, chooses `/wiki/api/v2/` or `/api/v2/` based on the source URL path, and appends `body-format=storage` (`lib/confluence-api.js:6-25`).
- `fetchNativeDocument()` performs an authenticated `GET`, requires `body.storage.value` in the JSON response, and returns the parsed payload along with the page ID and resolved API URL (`lib/confluence-api.js:27-60`).
- `fetchAtlDocument()` wraps the fetched storage body in the local `.atl` format by combining the storage content with normalized page metadata and the current Confluence version (`lib/confluence-api.js:62-96`).
- `updateNativeDocument()` first fetches the current page, parses the supplied `.atl` input, compares embedded page ID and version unless `force` is true, and then performs a `PUT` with the incremented version number and current title (`lib/confluence-api.js:98-177`).
- `buildApiError()` attempts to surface structured Confluence error fields such as `message`, `detail`, `title`, or an `errors` array, and falls back to the raw response body or status line (`lib/confluence-api.js:193-241`).
- The API adapter is used directly by `get` and indirectly by `export`, `import`, and `put` (`lib/commands/get.js:40-53`, `lib/commands/export.js:76-94`, `lib/commands/import.js:61-79`, `lib/commands/put.js:41-57`).

### Command Modules

- `runGetCommand()` requires exactly one positional URL, fetches the page as `.atl`, and writes it either to stdout or to `--output`/`-o` (`lib/commands/get.js:10-59`).
- `runExportCommand()` accepts a local `.atl` file, stdin, or a Confluence page URL. It parses the `.atl` metadata header if present, converts the storage body to Markdown, and re-adds metadata comments on the Markdown side when metadata exists (`lib/commands/export.js:16-94`).
- `runImportCommand()` reads Markdown from a file or stdin, parses metadata comments, converts Markdown to storage, and either writes storage/`.atl` locally or publishes directly to a Confluence page URL. Direct publish requires metadata unless `--force` is present (`lib/commands/import.js:15-92`).
- `runPutCommand()` uploads an existing `.atl` document from a file or stdin to a target page URL using the shared `updateNativeDocument()` path (`lib/commands/put.js:10-62`).
- All command modules follow the same structure: parse arguments, print command-specific help when requested, validate positional usage, execute the main workflow, and write a plain error line to stderr on failure (`lib/commands/export.js:16-74`, `lib/commands/get.js:10-59`, `lib/commands/import.js:15-92`, `lib/commands/put.js:10-62`).

### `cflmd-*` Comment and Markup Helper Layer

- `lib/cflmd-comment-utils.js` defines the HTML comment tokens used to preserve Confluence-only constructs across Markdown edits: `cflmd-toc`, `cflmd-image`, `cflmd-ac-link`, `cflmd-ac-structured-macro`, and `cflmd-ac-task-list` (`lib/cflmd-comment-utils.js:1-43`).
- `formatCflmdImageComment()` and `formatCflmdPreservedTagComment()` serialize preservation metadata into HTML comments, while `parsePreservedTagCommentMetadata()` accepts both current and older property names (`lib/cflmd-comment-utils.js:9-34`).
- `lib/markup-utils.js` centralizes HTML escaping, base64 encoding/decoding, width normalization, and HTML attribute rendering for both converters (`lib/markup-utils.js:1-35`).
- The conversion layer uses base64-encoded storage snippets and visible text to keep Confluence-specific XML available during Markdown editing without exposing the raw XML directly in normal paragraph flow (`lib/storage-to-markdown.js:392-425`, `lib/markdown-to-storage.js:274-301`, `lib/markdown-to-storage.js:1085-1106`).

### Storage-to-Markdown Conversion

- `convertStorageToMarkdown()` is the entrypoint. It preprocesses storage with Cheerio in XML mode, then passes the result through a custom Turndown instance and a final Markdown normalization step (`lib/storage-to-markdown.js:23-25`, `lib/storage-to-markdown.js:27-181`, `lib/storage-to-markdown.js:234-384`).
- `preprocessStorage()` rewrites `ac:image` into `<img>` placeholders, attaches linked-image metadata onto embedded images, converts TOC macros to placeholders, converts `details` macros into a preserved placeholder plus table body, converts `info` macros into HTML comment placeholders, rewrites `code` macros into `<pre><code>`, converts task lists into placeholders, and converts raw `ac:link` nodes into preserved-tag placeholders (`lib/storage-to-markdown.js:27-140`).
- The same preprocessing step unwraps paragraph wrappers in list items and table cells, promotes a first `th` row into `<thead>` when needed, and marks paragraph-wrapped autolinks so Turndown can emit `<https://...>` style Markdown (`lib/storage-to-markdown.js:142-181`).
- `convertStyledBlockquotes()` groups adjacent `<p style="margin-left: ...px;">` nodes into nested `<blockquote>` structures before Turndown runs (`lib/storage-to-markdown.js:184-232`, `lib/storage-to-markdown.js:554-586`).
- `createTurndownService()` installs custom rules for Confluence autolinks, email autolinks, embedded attachment images, TOC placeholders, task-list placeholders, HTML comment placeholders, preserved-tag placeholders, raw HTML tables, and thematic breaks (`lib/storage-to-markdown.js:234-374`).
- `renderPreservedTagComment()` emits inline comments for inline `ac:link` constructs and blank-line-separated comments for block constructs, preserving the visible text when one exists (`lib/storage-to-markdown.js:392-425`).
- Task lists are converted by encoding the task list into a placeholder, decoding it back into Markdown checklist syntax, and indenting multiline bodies when they start with comments, code fences, blockquotes, lists, or raw HTML (`lib/storage-to-markdown.js:445-552`).
- Raw HTML tables are emitted by `renderTable()` and related helpers, which preserve `colgroup`, `thead`, `tbody`, `tfoot`, strong formatting in cells, preserved macros/comments, and multiline cell bodies (`lib/storage-to-markdown.js:588-764`).
- Structured macros named `status` and `jira` contribute visible text when preserved, while many other preserved constructs export as comments with blank visible text (`lib/storage-to-markdown.js:728-764`).

### Markdown-to-Storage Conversion

- `convertMarkdownToStorage()` is the reverse entrypoint. It first renders Markdown to HTML with Markdown-It, then applies a fixed transform sequence over a Cheerio DOM before normalizing the output storage markup (`lib/markdown-to-storage.js:52-79`).
- The transform pipeline includes blockquote conversion, autolink conversion, image conversion, TOC conversion, code block conversion, generic HTML comment conversion, inline Markdown expansion inside table cells, checklist extraction, preserved-tag restoration, list item wrapping, details-table wrapping, table normalization, title removal, and text-entity encoding (`lib/markdown-to-storage.js:59-78`).
- `expandCflmdComments()` rewrites exported `cflmd-image`, `cflmd-toc`, `cflmd-ac-link`, `cflmd-ac-structured-macro`, and `cflmd-ac-task-list` comments back into placeholder HTML before Markdown-It processing. It also strips legacy `cflmd-ac-parameter` comments (`lib/markdown-to-storage.js:229-301`).
- `addConfluenceAttachmentImageSyntax()` extends Markdown-It with `[[attachment.png]]` parsing for attachment images, attaching `data-confluence-attachment="true"` and the source filename to the generated token (`lib/markdown-to-storage.js:303-341`).
- `convertImages()` turns normal images into `ac:image` with `ri:url`, and turns attachment images into `ac:image` with `ri:attachment`, carrying width metadata when present (`lib/markdown-to-storage.js:198-227`, `lib/markdown-to-storage.js:937-974`).
- `convertCodeBlocks()` turns fenced and indented code blocks into `ac:structured-macro ac:name="code"` with optional language, fixed `breakoutMode`/`breakoutWidth`, and an encoded plain-text body placeholder that later becomes CDATA (`lib/markdown-to-storage.js:343-370`, `lib/markdown-to-storage.js:1118-1159`).
- Checklist handling is split across `convertChecklistTextInTableCells()`, `convertChecklistLists()`, `replaceMixedChecklistList()`, `parseChecklistTextNodes()`, `parseChecklistSource()`, and `renderTaskListMarkup()`. Together these functions detect checklist markers in lists and raw table cells, preserve embedded non-text tokens, and emit `ac:task-list` with incrementing task IDs and list IDs (`lib/markdown-to-storage.js:372-449`, `lib/markdown-to-storage.js:533-696`).
- `restorePreservedTags()` and `restorePreservedTag()` convert placeholder spans/divs back into encoded XML placeholders, remove formatting-only whitespace and `<br>` tags around them, and consume duplicated visible text when the Markdown body contains both the preservation comment and the plain text export (`lib/markdown-to-storage.js:702-742`, `lib/markdown-to-storage.js:976-1106`).
- `convertTables()` normalizes all tables to `data-layout="default"` and `data-table-width="760"`, wraps header cell contents in `<p><strong>...</strong></p>`, and normalizes table data cells into paragraph or block-node groupings (`lib/markdown-to-storage.js:745-885`).
- `wrapDetailsTables()` looks for a root paragraph that consists entirely of details parameters and is followed by a root table, then wraps the pair into an `ac:structured-macro ac:name="details"` with `ac:rich-text-body` (`lib/markdown-to-storage.js:793-843`).
- `restoreDetailsMacros()` performs a second pass over serialized storage markup to reattach following root tables to `details` macros and to reconstruct `details` macros from a parameter paragraph plus following table when that pattern remains in the serialized markup (`lib/markdown-to-storage.js:1189-1288`).
- `normalizeStorageMarkup()` converts the encoded code-body placeholder into `<![CDATA[...]]>`, restores preserved XML placeholders, canonicalizes self-closing TOC and `ri:attachment` forms, normalizes `colgroup`, and rewrites `<br>`/`<hr>` into XML-style tags (`lib/markdown-to-storage.js:1126-1179`).

### Build, Distribution, and Release Automation

- The `Makefile` exposes `install`, `test`, `clean`, `clean-cache`, and `dist`, with `dist` delegating to `scripts/build-dist.mjs` and a default target of `help` (`Makefile:1-39`).
- `scripts/build-dist.mjs` bundles the CLI with esbuild, writes a temporary CommonJS SEA entry wrapper, downloads or reuses cached Node distributions, verifies archive checksums, extracts runtime binaries, and builds standalone executables for `linux-x64`, `macos-x64`, and `macos-arm64` (`scripts/build-dist.mjs:42-105`, `scripts/build-dist.mjs:117-221`, `scripts/build-dist.mjs:277-478`).
- The same build script uses a blob-plus-postject path for `macos-x64` on macOS hosts, including `codesign` operations before and after injecting the SEA blob (`scripts/build-dist.mjs:224-275`).
- `scripts/build-release-assets.mjs` scans `releases/` for built binaries, archives each present binary as `cflmd-<target>.tar.gz`, computes SHA-256 hashes, and writes both `release-manifest.json` and `SHA256SUMS` under `dist/release-assets/` (`scripts/build-release-assets.mjs:23-126`).
- `scripts/render-homebrew-formula.mjs` reads the release manifest and prints a Ruby formula with `on_macos` and `on_linux` branches pointing at GitHub release asset URLs (`scripts/render-homebrew-formula.mjs:3-85`).
- `scripts/build-release-candidate.mjs` runs `make clean`, `make dist`, verifies the Linux binary with `--help`, generates release assets, packs the npm tarball, renders the Homebrew formula, and validates that all three release targets are present in both the manifest and formula output (`scripts/build-release-candidate.mjs:23-186`).
- `scripts/versioning.mjs` handles semantic version arithmetic, package.json rewriting, and version module rewriting. It also has a small CLI for `get-version`, `next-version`, `set-version`, and `set-release-version` (`scripts/versioning.mjs:8-130`).
- `scripts/bump` is a Bash workflow that selects a patch/minor/major bump, verifies branch state and remote/tag conditions, updates `package.json` and `lib/version.js`, creates a release commit, pushes the branch, and either prints the current PR URL or opens a new PR targeting `main` with `gh pr create` (`scripts/bump:1-102`).

### Tests and Fixtures

- `tests/cli.test.js` exercises the CLI by calling `main()` directly with injected streams and mocked `fetchImpl`. The covered behaviors include root help, per-command help, version output, stdin/file/URL variants for `export` and `import`, direct publish flows, credential handling, `put` metadata comparisons, `--force` behavior, and global option placement (`tests/cli.test.js:42-1204`).
- `tests/confluence-api.test.js` covers page endpoint resolution, direct page update payload construction, metadata mismatch handling, `.atl` wrapping on fetch, and structured API error formatting (`tests/confluence-api.test.js:14-224`).
- `tests/storage-to-markdown.test.js` exercises the export side of the converter across attachment images, linked attachment images, TOC macros, info macros, inline `ac:link` preservation, code macros, raw HTML tables, preserved macros inside tables, task lists, details tables, and user-link checklist items (`tests/storage-to-markdown.test.js:19-230`).
- `tests/markdown-to-storage.test.js` exercises the import side of the converter across attachment syntax, image comments, malformed legacy linked-image markdown, TOC comments, info comments, plain links, apostrophe entity handling, preserved `ac:link` restoration, code macros, raw HTML table handling, checklist parsing, mixed bullet/checklist splitting, details-table roundtrips, and checklist user-link import (`tests/markdown-to-storage.test.js:20-418`).
- `tests/versioning.test.js` verifies semantic version bumping and the shared package/module version write path (`tests/versioning.test.js:13-62`).
- The fixtures under `tests/fixtures/` consist of:
  - a captured `.atl` storage fixture with metadata (`tests/fixtures/storage-roundtrip-input.atl:1-7`);
  - a source Markdown fixture used for scope/section-structure comparison (`tests/fixtures/storage-roundtrip-source.md:1-112`);
  - an expected Markdown fixture used for stable exported output and roundtrip assertions (`tests/fixtures/storage-roundtrip-expected.md:1-112`).

## Code References

- `cflmd:1-8` - executable shim that calls `main()` and sets `process.exitCode`.
- `package.json:2-56` - package metadata, runtime dependencies, scripts, ESM declaration, and binary entry.
- `lib/cli.js:10-70` - command dispatch, help/version handling, and injected dependency surface.
- `lib/options.js:3-196` - root and command argument parsing for `get`, `export`, `import`, and `put`.
- `lib/help.js:1-119` - usage text for the root CLI and each subcommand.
- `lib/command-helpers.js:5-43` - credential validation, URL detection, shared text input/output helpers.
- `lib/confluence-metadata.js:1-68` - metadata header formatting and parsing.
- `lib/atl-document.js:1-19` - `.atl` document wrapper/parsing helpers.
- `lib/markdown-document.js:1-27` - Markdown document wrapper/parsing helpers.
- `lib/confluence-api.js:6-25` - Confluence page URL to API endpoint resolution.
- `lib/confluence-api.js:27-96` - fetch paths for storage and `.atl` content.
- `lib/confluence-api.js:98-177` - page update flow, metadata comparison, and PUT payload assembly.
- `lib/commands/get.js:10-59` - `get` command orchestration.
- `lib/commands/export.js:16-94` - `export` command orchestration for file, stdin, and URL inputs.
- `lib/commands/import.js:15-92` - `import` command orchestration for local output and direct publish.
- `lib/commands/put.js:10-62` - `put` command orchestration for `.atl` upload.
- `lib/cflmd-comment-utils.js:1-43` - `cflmd-*` comment format definitions and parsing.
- `lib/markup-utils.js:1-35` - HTML escaping, base64 helpers, image width normalization, attribute rendering.
- `lib/storage-to-markdown.js:27-181` - storage preprocessing before Turndown.
- `lib/storage-to-markdown.js:234-374` - custom Turndown rules for Confluence-specific constructs.
- `lib/storage-to-markdown.js:445-552` - task-list placeholder decoding and checklist formatting.
- `lib/storage-to-markdown.js:588-764` - raw HTML table rendering and preserved-node formatting.
- `lib/markdown-to-storage.js:52-79` - Markdown-to-storage transform pipeline entrypoint.
- `lib/markdown-to-storage.js:229-301` - expansion of `cflmd-*` comments back into placeholders.
- `lib/markdown-to-storage.js:303-341` - Markdown-It extension for `[[attachment]]` syntax.
- `lib/markdown-to-storage.js:343-370` - code block conversion into Confluence code macros.
- `lib/markdown-to-storage.js:372-449` - checklist conversion from lists and mixed-list segmentation.
- `lib/markdown-to-storage.js:533-696` - checklist parsing and `ac:task-list` generation.
- `lib/markdown-to-storage.js:745-885` - table normalization and cell wrapping.
- `lib/markdown-to-storage.js:976-1106` - preserved-tag restoration and whitespace trimming.
- `lib/markdown-to-storage.js:1126-1179` - serialized storage normalization.
- `lib/markdown-to-storage.js:1189-1288` - details macro restoration pass.
- `scripts/build-dist.mjs:42-105` - top-level standalone build workflow and temporary SEA entry creation.
- `scripts/build-dist.mjs:162-275` - executable creation and macOS postject path.
- `scripts/build-dist.mjs:297-478` - runtime caching, archive download/verification, extraction, and command spawning.
- `scripts/build-release-assets.mjs:23-126` - release archive creation and manifest generation.
- `scripts/build-release-candidate.mjs:23-186` - release candidate build-and-verify workflow.
- `scripts/render-homebrew-formula.mjs:3-85` - Homebrew formula rendering from the release manifest.
- `scripts/versioning.mjs:8-130` - semantic version helpers and versioning CLI.
- `scripts/bump:1-102` - shell-based release branch bump and PR creation workflow.
- `tests/cli.test.js:42-1204` - end-to-end CLI behavior coverage with injected streams and mocked fetch.
- `tests/confluence-api.test.js:14-224` - Confluence API adapter behavior coverage.
- `tests/storage-to-markdown.test.js:19-230` - storage export conversion coverage.
- `tests/markdown-to-storage.test.js:20-418` - Markdown import conversion coverage.
- `tests/versioning.test.js:13-62` - versioning helper coverage.
- `tests/fixtures/storage-roundtrip-input.atl:1-7` - storage input fixture used by conversion tests.
- `tests/fixtures/storage-roundtrip-source.md:1-112` - Markdown source fixture used for structural comparison.
- `tests/fixtures/storage-roundtrip-expected.md:1-112` - normalized Markdown fixture used for stable output assertions.

## Architecture Documentation

The current runtime architecture is a layered CLI pipeline:

- Entry: `cflmd` invokes `lib/cli.js`, which parses root options, resolves credentials from CLI args or environment variables, and hands off to a subcommand handler.
- Command layer: each command module owns its command-specific parsing, help text integration, positional validation, and top-level orchestration.
- Shared document layer: metadata parsing and formatting are centralized in `lib/confluence-metadata.js`, `lib/atl-document.js`, and `lib/markdown-document.js`.
- Confluence transport layer: `lib/confluence-api.js` resolves page URLs, performs authenticated API calls, and manages the `.atl` metadata comparison/update flow.
- Conversion layer: `lib/storage-to-markdown.js` and `lib/markdown-to-storage.js` form a roundtrip pair. Both use Cheerio DOM transforms; the export side feeds Turndown, while the import side starts from Markdown-It HTML.
- Preservation model: unsupported or Confluence-specific constructs are represented in Markdown as `cflmd-*` HTML comments plus optional visible text. The reverse converter expands those comments back into placeholders and then into Confluence XML.
- Distribution layer: `Makefile` and the `scripts/` directory manage standalone SEA builds, release asset packaging, Homebrew formula rendering, semantic version updates, and release-branch PR creation.
- Validation layer: Vitest exercises the CLI via dependency injection, the API adapter with mocked fetch responses, both conversion directions against targeted fixtures and edge cases, and the versioning helpers.

The format-conversion architecture uses a placeholder-based roundtrip design:

- On export, Confluence storage nodes that do not have a direct Markdown representation are converted into temporary DOM markers and finally emitted as HTML comments such as `<!-- cflmd-ac-link: ... -->` or `<!-- cflmd-ac-structured-macro: ... -->`.
- On import, those comments are expanded back into placeholders before Markdown-It parses the document, so later DOM transforms can restore the underlying Confluence XML, remove duplicated visible text, and normalize whitespace around the reconstructed nodes.
- Tables and task lists are handled as explicit subsystems in both directions. Both converters contain dedicated logic for raw HTML table emission/import, Confluence checklist serialization, and details-table preservation.

The release architecture is separate from the runtime conversion code:

- `scripts/build-dist.mjs` creates native executables from the CLI bundle.
- `scripts/build-release-assets.mjs` turns built binaries into release archives plus a manifest.
- `scripts/render-homebrew-formula.mjs` derives a Homebrew formula from that manifest.
- `scripts/build-release-candidate.mjs` composes those steps with `npm pack`.
- `scripts/versioning.mjs` and `scripts/bump` provide the version-bump and release-branch workflow.

## Open Questions

- `research_codebase.md` refers to a repository-local `source.yaml`, but no `source.yaml` was present in this repository during the 2026-03-16 research run. This report therefore used the tracked implementation, build, and test files as the documentation scope.
