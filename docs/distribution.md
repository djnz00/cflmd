# Distribution

This repository targets two published distribution channels:

- npm
- a separate Homebrew tap that builds bottles from a generated `Formula/cflmd.rb`

Versioning follows Semantic Versioning. Maintainers prepare releases with `./scripts/bump`, which defaults to a patch bump and also accepts `--minor` or `--major`.

Pull requests are gated by [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), which requires both:

- `test`
- `release-readiness`

The `release-readiness` job runs the same release-candidate build used by CD, so a PR cannot merge unless it can:

- build all standalone release binaries with `make dist`
- package Linux and macOS archives for GitHub Releases
- render the Homebrew formula that points at those archives
- create the npm package tarball

## Release Assets

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on every push to `main`.

If the version in [package.json](../package.json) does not already exist as a GitHub release, that workflow treats the merged commit as the next release and cuts tag `vX.Y.Z` automatically. This is why release PRs are created through `./scripts/bump`: once the PR merges, the latest-release link in the README starts resolving immediately without any extra manual tag push.

That workflow:

- runs the test suite
- runs the full release-candidate build
- builds standalone executables for `linux-x64`, `macos-x64`, and `macos-arm64`
- packages each binary into a release archive containing a single `cflmd` executable
- creates an npm package tarball
- renders `cflmd.rb` for the Homebrew tap
- creates or updates the GitHub release and uploads those archives, `SHA256SUMS`, `release-manifest.json`, the npm tarball, and `cflmd.rb`
- publishes the npm tarball when `NPM_TOKEN` is configured
- updates the separate Homebrew tap when `HOMEBREW_TAP_REPO` and `HOMEBREW_TAP_GITHUB_TOKEN` are configured

The release-candidate build is orchestrated by [scripts/build-release-candidate.mjs](../scripts/build-release-candidate.mjs), which reuses [scripts/build-release-assets.mjs](../scripts/build-release-assets.mjs) for the GitHub release archives.

## npm

[`.github/workflows/release.yml`](../.github/workflows/release.yml) publishes the package to npm from the generated tarball in the same run that creates the GitHub release.

Required secret:

- `NPM_TOKEN`

The published package is intentionally small:

- `cflmd`
- `lib/`
- `README.md`

That package layout is controlled in [package.json](../package.json).

## Homebrew Tap

The Homebrew tap lives in a separate repository, typically named something like `your-org/homebrew-djnz00`.
That shared tap can host multiple formulae; `cflmd` is one formula in it.

Set that tap repository up once with:

```bash
brew tap-new your-org/djnz00
```

Keep the default workflows that `brew tap-new` creates so the tap can build and publish bottles from formula updates.

This repository can then update the tap automatically through [`.github/workflows/release.yml`](../.github/workflows/release.yml).

Required repository variable:

- `HOMEBREW_TAP_REPO`
  Set this to the full tap repository name, for example `djnz00/homebrew-djnz00`.

Required secret:

- `HOMEBREW_TAP_GITHUB_TOKEN`

That workflow:

- reuses the freshly rendered `dist/homebrew/cflmd.rb`
- commits the updated formula into the tap repo

The tap repo's own workflows are responsible for building bottles after the formula changes.
