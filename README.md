# cflmd

`cflmd` is a command line tool for editing Confluence pages in Markdown. Releases are available via GitHub Releases, Homebrew, and standalone binaries for Linux and MacOS.

[Latest releases](https://github.com/djnz00/cflmd/releases/latest)

`cflmd` can:

- download Confluence pages as `.atl`
  - `.atl` is an invented file extension for Confluence's native document storage format, sometimes referred to as "atlas" in Confluence's documentation. `.atl` is a dialect of html.
- convert `.atl` to Markdown
- convert Markdown back to `.atl`
- publish `.atl` or Markdown back to existing Confluence pages
- download and convert to markdown in one step
- convert to Confluence and publish in one step

This permits local-storage editing of Confluence pages as markdown files.

Most modern markdown features are supported, including html tables. Mermaid diagrams are not supported.

## Installation

### Homebrew

```bash
brew install djnz00/cflmd/cflmd
```

### npm

Download the `cflmd-X.Y.Z.tgz` asset from the [latest release](https://github.com/djnz00/cflmd/releases/latest)

```bash
npm install -g ./cflmd-X.Y.Z.tgz
```

### Standalone Binary

Download matching binary from:

```text
https://github.com/djnz00/cflmd/releases/latest
```

- `cflmd-linux-x64.tar.gz` for Linux x64
- `cflmd-macos-x64.tar.gz` for Intel macOS
- `cflmd-macos-arm64.tar.gz` for Apple Silicon macOS

linux-x64 example:

```bash
curl -fsSLO https://github.com/djnz00/cflmd/releases/latest/download/cflmd-linux-x64.tar.gz
curl -fsSLO https://github.com/djnz00/cflmd/releases/latest/download/SHA256SUMS
grep 'cflmd-linux-x64.tar.gz$' SHA256SUMS | shasum -a 256 -c -
tar xzf cflmd-linux-x64.tar.gz
install -m 0755 cflmd ~/.local/bin/cflmd
cflmd --version
cflmd --help
```

Replace the tarball name with the asset that matches your machine. If `~/.local/bin` is not on your `PATH`, either add it or run the extracted binary directly as `./cflmd`.

### Source

Clone the repo. In the repo directory:

```bash
pnpm install
chmod +x ./cflmd
```

Run it directly:

```bash
./cflmd --help
```

Or use the Makefile:

```bash
make test
make dist
pnpm run release:verify
```

Maintainer notes for npm publishing and the separate Homebrew tap live in [docs/distribution.md](./docs/distribution.md).

## Authentication

Commands that talk to Confluence use basic auth with:

- `ATLASSIAN_USER`
- `ATLASSIAN_TOKEN`

You can provide them through the environment:

```bash
export ATLASSIAN_USER='you@example.com'
export ATLASSIAN_TOKEN='...'
```

Or as global CLI options before the subcommand:

```bash
./cflmd --user=you@example.com --token=... get 'https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page'
```

## Usage

### Batch Workflow

Use `pull` to refresh a set of Markdown files from Confluence, edit them locally, then use `push` to publish them back:

```bash
cat > .cflmd <<'EOF'
docs/page-one.md: https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page+One
docs/page-two.md: https://example.atlassian.net/wiki/spaces/ENG/pages/67890/Page+Two
EOF

./cflmd --user=you@example.com --token=... pull
# edit docs/page-one.md and docs/page-two.md
./cflmd --user=you@example.com --token=... push
```

`pull` reuses the existing `export` conversion path for each entry. `push` reuses the existing `import` direct-publish path for each entry. Both commands process entries sequentially, print one human-readable status line per entry, print a final processed/succeeded/failed summary, continue after runtime failures, and return a non-zero exit code if any entry fails.

### Single-Page Workflow

```bash
./cflmd export -i 'https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page' -o page.md
# edit page.md
./cflmd import -i page.md -o 'https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page'
```

### `get`

Download a Confluence page as raw `.atl`:

```bash
./cflmd get 'https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page' --output=page.atl
```

### `export`

Convert `.atl` to Markdown:

```bash
./cflmd export --input=page.atl --output=page.md
```

You can also fetch from Confluence and export directly:

```bash
./cflmd export \
  --input='https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page' \
  --output=page.md
```

If `--input` is omitted, `export` reads `.atl` from stdin.

### `pull`

Refresh Markdown files from a manifest:

```bash
./cflmd --user=you@example.com --token=... pull
```

Use a different manifest file:

```bash
./cflmd --user=you@example.com --token=... pull --manifest=docs/team-pages.cflmd
```

Each manifest entry behaves like:

```bash
./cflmd export --input='https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page' --output=docs/page.md
```

`pull` overwrites existing files and creates new files when the file path itself does not yet exist. It does not create missing parent directories.

### `import`

Convert Markdown to `.atl`:

```bash
./cflmd import --input=page.md --output=page.atl
```

If `--input` is omitted, `import` reads Markdown from stdin.

`import` can also publish directly to an existing page by using a Confluence page URL as `--output`:

```bash
./cflmd import \
  --input=page.md \
  --output='https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page'
```

Direct publish normally requires valid page metadata in the Markdown header so the page ID and version can be verified. Use `--force` to publish anyway.

### `push`

Publish Markdown files from a manifest:

```bash
./cflmd --user=you@example.com --token=... push
```

Use a different manifest file:

```bash
./cflmd --user=you@example.com --token=... push -f docs/team-pages.cflmd
```

Publish even when some entries have missing or mismatched metadata:

```bash
./cflmd --user=you@example.com --token=... push --force
```

Each manifest entry behaves like:

```bash
./cflmd import --input=docs/page.md --output='https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page'
```

`push` only updates existing pages. It relies on the embedded `cflmd-metadata` comment in each Markdown file to verify the target page ID and version unless `--force` is used.

### `put`

Publish an existing `.atl` document back to Confluence:

```bash
./cflmd put \
  --input=page.atl \
  'https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Page'
```

By default, `put` checks that the embedded page ID and version match the current page. Use `--force` to override that safety check.

## Build Requirements

- Node.js 18+ (ESM and `fetch` support)
- pnpm (preferred) or npm

Building standalone release binaries requires Node.js 25.5+ because `make dist` uses Node's built-in SEA builder.

## Metadata Format

Both `.atl` files and exported Markdown carry a leading metadata comment:

```html
<!-- cflmd-metadata: {"pageId":"265021483","version":{"number":2}} -->
```

That metadata is used to keep conversions tied to the correct page and version.

Exported Markdown can also include `cflmd` HTML comments for Confluence-only constructs that Markdown cannot express directly:

```html
<!-- cflmd-toc -->
<!-- cflmd-image: {"ac:width":"760"} -->
<!-- cflmd-ac-link: {...} -->
<!-- cflmd-ac-structured-macro: {...} -->
```

Plain HTML comments that do not start with `cflmd-` round-trip as Confluence `info` macros. Their comment text is interpreted as markdown content.

Confluence task lists export as normal markdown checklists such as `- [ ]` and `- [x]`, and import back to `ac:task-list`.

`cflmd-ac-link` and `cflmd-ac-structured-macro` comments carry encoded Confluence payloads and are often followed by the plain-text export of the same content. Keep these comments in place if you want table-of-contents macros, embedded image widths, raw `ac:link` tags, details tables, and unsupported Confluence macros to survive `export` -> edit -> `import` roundtrips. Code macros round-trip as native fenced markdown code blocks, using only the fence language. Macro parameters stay attached to their parent macro instead of being emitted or accepted in isolation.

## `.cflmd` Manifest Format

`pull` and `push` use a UTF-8 manifest file named `.cflmd` by default. Each non-empty, non-comment line maps one Markdown file to one Confluence page URL:

```text
docs/architecture.md: https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Architecture
docs/runbook.md: https://example.atlassian.net/wiki/spaces/OPS/pages/67890/Runbook
```

Manifest rules:

- blank lines are ignored
- lines whose first non-whitespace character is `#` are ignored
- paths are resolved relative to the manifest file directory, not the shell working directory
- duplicate Markdown paths are rejected before any work begins
- duplicate Confluence page targets are rejected before any work begins
- path fields cannot contain `:`, so Windows drive-letter absolute paths are not supported in this iteration

You can override the default manifest location with:

- `--manifest=FILE`
- `--manifest FILE`
- `-f FILE`

## Development

Run the test suite with:

```bash
make test
```

Install dependencies with:

```bash
make install
```

Build standalone release executables with:

```bash
make dist
```

Build the full release candidate set used by CI and CD with:

```bash
pnpm run release:verify
```

Bump the next semantic version and open a release PR with:

```bash
./scripts/bump
./scripts/bump --minor
./scripts/bump --major
```

Patch bumps increment only the patch number, minor bumps reset patch to zero, and major bumps reset both minor and patch to zero. For example: `0.1.0 -> 0.1.1`, `0.1.1 -> 0.2.0`, `0.1.2 -> 1.0.0`.

`./scripts/bump` must be run from a non-`main` branch with a clean working tree. It commits the version bump, pushes that branch, and opens or reuses a pull request. When that PR merges to `main`, CI/CD automatically creates tag `vX.Y.Z`, publishes the GitHub release assets, and, when configured, publishes npm and updates the Homebrew tap.

This writes fully self-contained executables into `releases/`. The target machine does not need a separate Node.js or pnpm installation.

By default this writes:

- `releases/cflmd-linux-x64`
- `releases/cflmd-macos-x64`

`make dist` bundles the CLI with `esbuild`, caches the matching official Node.js runtime archives and extracted runtimes, and generates self-contained executables with Node SEA tooling. Most targets use `node --build-sea`; native `macos-x64` builds use the older documented blob-plus-`postject` path.

The dist cache is persistent across runs, so repeated `make dist` invocations reuse previously downloaded artifacts when they match the current Node.js version and target. By default the cache lives at `${XDG_CACHE_HOME:-~/.cache}/cflmd/dist`. Override it with `DIST_CACHE_DIR=/path/to/cache make dist`.

If you need an Apple Silicon binary as well, override the targets:

```bash
make dist DIST_TARGETS="linux-x64 macos-x64 macos-arm64"
```

When macOS binaries are generated on a non-macOS host, they are left unsigned. Re-sign them on macOS before distribution:

```bash
codesign --sign - releases/cflmd-macos-x64
```

Remove generated artifacts with:

```bash
make clean
```

Remove the persistent dist cache with:

```bash
make clean-cache
```

## Project Layout

```text
cflmd           executable CLI entrypoint
lib/            implementation
releases/       generated standalone executables
scripts/        release build helpers
tests/          Vitest test suite
```
