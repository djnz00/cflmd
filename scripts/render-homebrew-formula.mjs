import { readFile } from 'node:fs/promises';

const options = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(await readFile(options.manifest, 'utf8'));
const repo = options.repo;
const homepage = `https://github.com/${repo}`;
const license = options.license ?? 'MIT';

const linux = requireArtifact(manifest, 'linux-x64');
const macosX64 = requireArtifact(manifest, 'macos-x64');
const macosArm64 = requireArtifact(manifest, 'macos-arm64');

process.stdout.write(`${[
  'class Cflmd < Formula',
  '  desc "CLI for working with Atlassian Confluence page content as Markdown"',
  `  homepage "${homepage}"`,
  `  license "${license}"`,
  `  version "${manifest.version}"`,
  '',
  '  on_macos do',
  '    if Hardware::CPU.arm?',
  `      url "${assetUrl(repo, manifest.tag, macosArm64.archive)}"`,
  `      sha256 "${macosArm64.sha256}"`,
  '    else',
  `      url "${assetUrl(repo, manifest.tag, macosX64.archive)}"`,
  `      sha256 "${macosX64.sha256}"`,
  '    end',
  '  end',
  '',
  '  on_linux do',
  `    url "${assetUrl(repo, manifest.tag, linux.archive)}"`,
  `    sha256 "${linux.sha256}"`,
  '  end',
  '',
  '  def install',
  '    bin.install "cflmd"',
  '  end',
  '',
  '  test do',
  '    assert_match "Usage:", shell_output("#{bin}/cflmd --help")',
  '  end',
  'end',
  ''
].join('\n')}`);

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      options.manifest = argv[++index];
      continue;
    }
    if (arg === '--repo') {
      options.repo = argv[++index];
      continue;
    }
    if (arg === '--license') {
      options.license = argv[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.manifest || !options.repo) {
    throw new Error('Usage: node scripts/render-homebrew-formula.mjs --manifest FILE --repo OWNER/REPO');
  }

  return options;
}

function requireArtifact(manifest, target) {
  const artifact = manifest.artifacts?.[target];

  if (!artifact) {
    throw new Error(`Missing release artifact for ${target}.`);
  }

  return artifact;
}

function assetUrl(repo, tag, archive) {
  return `https://github.com/${repo}/releases/download/${tag}/${archive}`;
}
