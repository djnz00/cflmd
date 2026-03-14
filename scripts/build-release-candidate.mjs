import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const releaseRepo = process.env.RELEASE_REPO ?? inferRepository(packageJson.repository?.url);
const releaseTag = process.env.RELEASE_TAG ?? `v${packageJson.version}`;
const distTargets = process.env.DIST_TARGETS ?? 'linux-x64 macos-x64 macos-arm64';
const distRoot = path.join(rootDir, 'dist');
const npmOutputDir = path.join(distRoot, 'npm');
const homebrewOutputDir = path.join(distRoot, 'homebrew');
const formulaPath = path.join(homebrewOutputDir, 'cflmd.rb');
const releaseManifestPath = path.join(distRoot, 'release-assets', 'release-manifest.json');

main().catch((error) => {
  console.error(`[release-verify] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!releaseRepo) {
    throw new Error(
      'Could not determine the GitHub repository. Set RELEASE_REPO=OWNER/REPO or add package.json.repository.'
    );
  }

  await run('make', ['clean']);
  await run('make', ['dist', `DIST_TARGETS=${distTargets}`], {
    env: {
      ...process.env
    }
  });

  await run(path.join(rootDir, 'releases', 'cflmd-linux-x64'), ['--help']);
  await run(process.execPath, [path.join(rootDir, 'scripts', 'build-release-assets.mjs')], {
    env: {
      ...process.env,
      RELEASE_TAG: releaseTag
    }
  });

  await rm(npmOutputDir, { force: true, recursive: true });
  await rm(homebrewOutputDir, { force: true, recursive: true });
  await mkdir(npmOutputDir, { recursive: true });
  await mkdir(homebrewOutputDir, { recursive: true });

  await run('npm', ['pack', '--pack-destination', npmOutputDir]);

  const formula = await capture(process.execPath, [
    path.join(rootDir, 'scripts', 'render-homebrew-formula.mjs'),
    '--manifest',
    releaseManifestPath,
    '--repo',
    releaseRepo,
    '--license',
    packageJson.license
  ]);
  await writeFile(formulaPath, formula);

  await validateOutputs({
    formula,
    releaseManifestPath
  });

  console.log('[release-verify] Release candidate artifacts are ready.');
  console.log(`[release-verify] GitHub release assets: ${path.join(distRoot, 'release-assets')}`);
  console.log(`[release-verify] npm package: ${npmOutputDir}`);
  console.log(`[release-verify] Homebrew formula: ${formulaPath}`);
}

async function validateOutputs({ formula, releaseManifestPath }) {
  await assertExists(releaseManifestPath);
  const manifest = JSON.parse(await readFile(releaseManifestPath, 'utf8'));

  for (const target of ['linux-x64', 'macos-x64', 'macos-arm64']) {
    const artifact = manifest.artifacts?.[target];
    if (!artifact) {
      throw new Error(`Release manifest is missing ${target}.`);
    }

    await assertExists(path.join(distRoot, 'release-assets', artifact.archive));
  }

  if (!formula.includes('cflmd-macos-arm64.tar.gz')) {
    throw new Error('Rendered Homebrew formula does not reference the macOS arm64 release.');
  }

  if (!formula.includes('cflmd-macos-x64.tar.gz')) {
    throw new Error('Rendered Homebrew formula does not reference the macOS x64 release.');
  }

  if (!formula.includes('cflmd-linux-x64.tar.gz')) {
    throw new Error('Rendered Homebrew formula does not reference the Linux release.');
  }

  const npmTarball = path.join(npmOutputDir, `cflmd-${packageJson.version}.tgz`);
  await assertExists(npmTarball);
  await assertExists(formulaPath);
}

function inferRepository(repositoryUrl) {
  if (typeof repositoryUrl !== 'string' || repositoryUrl.length === 0) {
    return null;
  }

  const match = repositoryUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
  if (!match) {
    return null;
  }

  return `${match[1]}/${match[2]}`;
}

async function assertExists(filePath) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`Expected file was not created: ${filePath}`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
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

function capture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} exited with signal ${signal}`
            : `${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
        )
      );
    });
  });
}
