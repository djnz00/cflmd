import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export function nextVersion(version, releaseType = 'patch') {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);

  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  let [major, minor, patch] = match.slice(1).map(Number);

  switch (releaseType) {
    case 'patch':
      patch += 1;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    default:
      throw new Error(`Unsupported release type: ${releaseType}`);
  }

  return `${major}.${minor}.${patch}`;
}

export async function readPackageVersion(filePath) {
  const packageJson = JSON.parse(await readFile(resolvePath(filePath), 'utf8'));
  return packageJson.version;
}

export async function writePackageVersion(filePath, version) {
  const resolvedPath = resolvePath(filePath);
  const packageJson = JSON.parse(await readFile(resolvedPath, 'utf8'));
  packageJson.version = version;
  await writeFile(resolvedPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function resolvePath(filePath) {
  return path.resolve(rootDir, filePath);
}

async function main(argv) {
  const [command, ...args] = argv;

  switch (command) {
    case 'get-version':
      ensureArgCount(command, args, 1);
      process.stdout.write(`${await readPackageVersion(args[0])}\n`);
      return;
    case 'next-version':
      ensureArgCount(command, args, 2);
      process.stdout.write(`${nextVersion(args[0], args[1])}\n`);
      return;
    case 'set-version':
      ensureArgCount(command, args, 2);
      await writePackageVersion(args[0], args[1]);
      return;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function ensureArgCount(command, args, expected) {
  if (args.length !== expected) {
    throw new Error(`Usage error for ${command}. See --help.`);
  }
}

function printHelp() {
  process.stdout.write(
    [
      'Usage:',
      '  node scripts/versioning.mjs get-version package.json',
      '  node scripts/versioning.mjs next-version 0.1.0 patch',
      '  node scripts/versioning.mjs set-version package.json 0.1.1',
      ''
    ].join('\n')
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[versioning] ${error.message}`);
    process.exitCode = 1;
  });
}
