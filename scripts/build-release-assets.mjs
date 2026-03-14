import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releasesDir = path.join(rootDir, 'releases');
const outputDir = path.join(rootDir, 'dist', 'release-assets');
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;
const tag = process.env.RELEASE_TAG ?? `v${version}`;
const supportedTargets = ['linux-x64', 'macos-x64', 'macos-arm64'];

main().catch((error) => {
  console.error(`[release-assets] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });

  const artifacts = {};

  for (const target of supportedTargets) {
    const sourceBinaryPath = path.join(releasesDir, `cflmd-${target}`);
    if (!(await exists(sourceBinaryPath))) {
      continue;
    }

    const archiveName = `cflmd-${target}.tar.gz`;
    const archivePath = path.join(outputDir, archiveName);
    await createArchive({
      archivePath,
      sourceBinaryPath
    });

    artifacts[target] = {
      archive: archiveName,
      sha256: await hashFile(archivePath)
    };
  }

  if (Object.keys(artifacts).length === 0) {
    throw new Error('No release binaries were found in releases/. Run make dist first.');
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    name: packageJson.name,
    tag,
    version,
    artifacts
  };

  await writeFile(path.join(outputDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(outputDir, 'SHA256SUMS'),
    Object.values(artifacts)
      .map(({ archive, sha256 }) => `${sha256}  ${archive}`)
      .join('\n') + '\n'
  );

  console.log(`[release-assets] Wrote ${Object.keys(artifacts).length} archive(s) to ${outputDir}`);
}

async function createArchive({ archivePath, sourceBinaryPath }) {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'cflmd-release-'));

  try {
    const stagingBinaryPath = path.join(workDir, 'cflmd');
    await cp(sourceBinaryPath, stagingBinaryPath);
    await run('tar', ['-C', workDir, '-czf', archivePath, 'cflmd']);
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} exited with signal ${signal}`
            : `${command} exited with code ${code}`
        )
      );
    });
  });
}
